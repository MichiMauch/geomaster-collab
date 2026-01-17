import "dotenv/config";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@libsql/client";
import jwt from "jsonwebtoken";

const PORT = parseInt(process.env.PORT || "1234", 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",");

// Validate required environment variables
const COLLAB_JWT_SECRET = process.env.COLLAB_JWT_SECRET;
if (!COLLAB_JWT_SECRET) {
  throw new Error("COLLAB_JWT_SECRET environment variable must be set");
}

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
if (!TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL environment variable must be set");
}

// Turso database client
const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Ensure collaboration_documents table exists
async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS collaboration_documents (
      name TEXT PRIMARY KEY,
      data BLOB,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);
  console.log("Database initialized");
}

const server = Server.configure({
  port: PORT,

  // CORS for WebSocket
  async onRequest({ request }) {
    const origin = request.headers.origin;
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      console.log(`Blocked request from origin: ${origin}`);
      return new Response("Forbidden", { status: 403 });
    }
    return null;
  },

  // Authentication via JWT
  async onAuthenticate({ token, documentName }) {
    if (!token) {
      throw new Error("No token provided");
    }

    try {
      const decoded = jwt.verify(token, COLLAB_JWT_SECRET) as {
        userId: string;
        userName: string;
        userColor: string;
        isSuperAdmin: boolean;
      };

      // Only SuperAdmins can collaborate
      if (!decoded.isSuperAdmin) {
        throw new Error("Not authorized");
      }

      console.log(`User ${decoded.userName} authenticated for document: ${documentName}`);

      // Return user data for awareness
      return {
        user: {
          id: decoded.userId,
          name: decoded.userName,
          color: decoded.userColor,
        },
      };
    } catch (error) {
      console.error("Authentication failed:", error);
      throw new Error("Invalid token");
    }
  },

  async onConnect({ documentName, context }) {
    console.log(`Connection established for document: ${documentName}`);
    return context;
  },

  async onDisconnect({ documentName, context }) {
    console.log(`User disconnected from document: ${documentName}`);
  },

  extensions: [
    new Database({
      // Load document from Turso
      fetch: async ({ documentName }) => {
        try {
          const result = await db.execute({
            sql: "SELECT data FROM collaboration_documents WHERE name = ?",
            args: [documentName],
          });

          if (result.rows.length > 0 && result.rows[0].data) {
            const data = result.rows[0].data;
            // Handle both Buffer and ArrayBuffer
            if (data instanceof ArrayBuffer) {
              return new Uint8Array(data);
            }
            if (Buffer.isBuffer(data)) {
              return new Uint8Array(data);
            }
            // If it's stored as base64 string
            if (typeof data === "string") {
              return new Uint8Array(Buffer.from(data, "base64"));
            }
          }
          return null;
        } catch (error) {
          console.error(`Error fetching document ${documentName}:`, error);
          return null;
        }
      },

      // Save document to Turso
      store: async ({ documentName, state }) => {
        try {
          // Convert Uint8Array to Buffer for storage
          const buffer = Buffer.from(state);

          await db.execute({
            sql: `
              INSERT INTO collaboration_documents (name, data, updated_at)
              VALUES (?, ?, unixepoch())
              ON CONFLICT(name) DO UPDATE SET
                data = excluded.data,
                updated_at = unixepoch()
            `,
            args: [documentName, buffer],
          });

          console.log(`Document ${documentName} saved (${buffer.length} bytes)`);
        } catch (error) {
          console.error(`Error storing document ${documentName}:`, error);
        }
      },
    }),
  ],
});

// Start server
initDatabase()
  .then(() => {
    server.listen();
    console.log(`Hocuspocus server running on port ${PORT}`);
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

# GeoMaster Collaboration Server

Hocuspocus-basierter WebSocket-Server für Echtzeit-Kollaboration im GeoMaster News-Editor.

## Features

- Echtzeit-Synchronisation von TipTap-Dokumenten
- Cursor-Awareness (sehen, wo andere tippen)
- JWT-basierte Authentifizierung
- Persistenz via Turso (SQLite)
- Docker-ready für Coolify

## Setup

### Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# .env erstellen
cp .env.example .env
# Dann .env mit echten Werten füllen

# Entwicklungsserver starten
npm run dev
```

### Environment Variables

| Variable | Beschreibung |
|----------|-------------|
| `PORT` | Server-Port (default: 1234) |
| `JWT_SECRET` | Secret für Token-Validierung |
| `TURSO_DATABASE_URL` | Turso Datenbank URL |
| `TURSO_AUTH_TOKEN` | Turso Auth Token |
| `ALLOWED_ORIGINS` | Komma-getrennte erlaubte Origins |

### Deployment (Coolify)

1. Repository in Coolify hinzufügen
2. Environment Variables setzen (gleiche wie .env)
3. Port 1234 exponieren
4. Deploy

## Architektur

```
Client (GeoMaster)           Server (Hocuspocus)
     │                              │
     │──── WebSocket + JWT ────────►│
     │                              │
     │◄─── Y.js Sync Updates ──────│
     │                              │
     │                        ┌─────┴─────┐
     │                        │  Turso DB │
     │                        └───────────┘
```

## API

Der Server akzeptiert WebSocket-Verbindungen auf `ws://host:port`.

### Authentifizierung

Der Client muss ein JWT-Token im Connection-Request mitschicken:

```typescript
const provider = new HocuspocusProvider({
  url: 'ws://localhost:1234',
  name: 'news-123', // Document ID
  token: 'jwt-token-here',
});
```

Das Token muss folgende Claims enthalten:
- `userId`: Benutzer-ID
- `userName`: Anzeigename
- `userColor`: Cursor-Farbe (hex)
- `isSuperAdmin`: Muss `true` sein

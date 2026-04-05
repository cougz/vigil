# Vigil

Lightweight, self-hosted Docker application for managing Intel vPro / Intel AMT machines via a modern web UI. Power actions and KVM remote desktop.

## Quick Start

```bash
git clone git@github.com:cougz/vigil.git
cd vigil
docker compose up --build -d
```

- **Vigil UI:** http://localhost:3000
- **Log viewer (Dozzle):** http://localhost:8080

## Development

```bash
# Terminal 1 — backend (with hot reload)
cd server && npm install && npm run dev

# Terminal 2 — frontend (with Vite dev server + proxy)
cd client && npm install && npm run dev
```

The Vite dev server proxies `/api` and `/ws` to the Fastify backend on port 3000.

## Ports

| Port | Service |
|------|---------|
| 3000 | Vigil web UI + API |
| 8080 | Dozzle log viewer |

## Intel AMT Ports

| Port | Protocol | Usage |
|------|----------|-------|
| 16992 | HTTP | WS-MAN (Digest auth) |
| 16993 | HTTPS | WS-MAN (Digest + TLS) |
| 16994 | TCP | KVM Redirection (plain) |
| 16995 | TLS | KVM Redirection (TLS) |

## Configuration

Environment variables (set in `compose.yaml` or `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATA_PATH` | `/data` | Path to data directory |
| `LOG_LEVEL` | `info` | Log level (`info`, `debug`) |
| `NODE_ENV` | `production` | Node environment |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Create device |
| GET | `/api/devices/:id` | Get device + power state |
| PUT | `/api/devices/:id` | Update device |
| DELETE | `/api/devices/:id` | Delete device |
| GET | `/api/devices/:id/power` | Get live power state |
| POST | `/api/devices/:id/power` | Execute power action |
| WS | `/ws/kvm/:id` | KVM tunnel (WebSocket) |

## Data

Device data is stored in a bind-mounted JSON file at `./data/computers.json`. This directory is git-ignored and created automatically on first run.

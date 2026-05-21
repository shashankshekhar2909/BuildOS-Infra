# BuildOS Infra

Self-hosted control plane for a fleet of Docker hosts — VPS, homelab, anything that can run a Python daemon. One dashboard to see CPU/RAM/disk per node, list containers, start/stop/restart them, tail their logs, manage Cloudflare DNS, panic-lock the whole fleet, and ask Gemini why something broke. Runs as two Docker containers on your homelab.

```
                ┌──────────────────────────────────────────────────┐
                │            BuildOS Control Plane (host)          │
                │                                                  │
                │   Next.js (4225) ──proxy──►  Express + WS (8015) │
                │                                          │       │
                │                                          ▼       │
                │                                       SQLite     │
                └──────────────────────────────┬───────────────────┘
                                               ▲
                                               │ wss:// egress only
                       ┌───────────────────────┼───────────────────────┐
                       │                       │                       │
              ┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
              │  VPS node       │     │  Homelab node   │     │  Any host       │
              │  Python agent   │     │  Python agent   │     │  Python agent   │
              │  /var/run/      │     │  /var/run/      │     │  /var/run/      │
              │  docker.sock    │     │  docker.sock    │     │  docker.sock    │
              └─────────────────┘     └─────────────────┘     └─────────────────┘
```

Agents connect **outbound** to the master over a single persistent WebSocket. No inbound port on the agent host. NAT, residential firewalls, CGNAT all work.

---

## Table of contents

1. [Features](#features)
2. [Stack](#stack)
3. [Requirements](#requirements)
4. [Quick start (Docker)](#quick-start-docker)
5. [Configuration](#configuration)
6. [Adding an agent to a remote node](#adding-an-agent-to-a-remote-node)
7. [Cloudflare integration](#cloudflare-integration-optional)
8. [Gemini AI co-pilot](#gemini-ai-co-pilot-optional)
9. [Emergency lockdown](#emergency-lockdown)
10. [Auto-heal](#auto-heal)
11. [Token rotation](#token-rotation)
12. [REST + WebSocket API reference](#api-reference)
13. [Local development (no Docker)](#local-development-no-docker)
14. [Project layout](#project-layout)
15. [Security checklist before exposing](#security-checklist-before-exposing)
16. [Troubleshooting](#troubleshooting)

---

## Features

| Phase | Feature |
|-------|---------|
| 1 | Express REST API + Next.js dashboard + SQLite + JWT login (admin / viewer roles) |
| 2 | Python agent daemon + egress-only WebSocket + live telemetry + container start/stop/restart |
| 3 | Cloudflare DNS list / create / delete via scoped API token |
| 4 | Emergency Airlock (checkbox + `FORCE KILL` keyphrase), agent-side `EMERGENCY_BLOCK`, argon2id token hashing, subprotocol WS auth |
| 5 | Gemini `gemini-2.5-flash` diagnose endpoint + UI co-pilot panel |
| 6 | Live event log stream, auto-heal sweep (30s, throttled per container), "Diagnose last 50" preset |
| 7 | Node registration UI w/ one-shot install command + on-demand container log tail (real Docker stdout) |
| 8 | Time-series `node_metrics` table (7d retention) + per-node sparkline + token rotation |

---

## Stack

| Layer | Tech | Port |
|-------|------|------|
| Frontend | Next.js 15 (App Router, standalone build) | `4225` (host) → `3000` (container) |
| Backend  | Express + `tsx` + `ws` (TypeScript) | `8015` (host) → `8000` (container) |
| Database | SQLite (`node:sqlite`, WAL mode), single file in a Docker volume | n/a |
| Agent    | Python 3 + `websockets` + `docker` SDK + `psutil` | egress-only |
| AI       | `@google/genai` w/ `gemini-2.5-flash` | server-side only |
| Crypto   | `@node-rs/argon2` (argon2id), HMAC-SHA256 JWT | |

---

## Requirements

**Master host (homelab):**
- Docker + Docker Compose v2
- ~256 MB RAM, ~1 GB disk

**Agent hosts:**
- Linux w/ systemd
- Python 3.10+
- Docker socket at `/var/run/docker.sock`
- Outbound TCP/443 (or whatever port the master listens on) reachable

---

## Quick start (Docker)

```bash
git clone <repo> buildos-infra
cd buildos-infra
cp .env.example .env

# Edit .env — set strong values for JWT_SECRET, ADMIN_PASSWORD, VIEWER_PASSWORD.
# Optional: paste GEMINI_API_KEY, CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID.

docker compose up -d --build
```

That brings up two containers:
- `buildos_backend` — Express API + WebSocket hub on `:8015`
- `buildos_control_plane` — Next.js dashboard on `:4225`

Open `http://<host-ip>:4225`. Default login is `admin` / `admin` (change immediately).

### Verify

```bash
curl http://localhost:4225/api/health
# {"status":"ok","phase":"phase-8","database":"sqlite","cloudflare":"...","gemini":"...","emergency_lockdown":false}

curl -X POST http://localhost:4225/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","username":"admin","password":"admin"}'
# {"success":true,"token":"...","user":{...}}
```

---

## Configuration

All variables live in `.env` next to `docker-compose.yml`. The compose file forwards them to the backend container.

### Master backend

| Var | Default | Purpose |
|-----|---------|---------|
| `APP_BASE_URL` | `http://localhost:4225` | Public URL of the dashboard; used to build install commands |
| `NEXT_PUBLIC_APP_BASE_URL` | same | Same value, exposed to the browser |
| `BACKEND_INTERNAL_URL` | `http://backend:8000` | **Container-internal** URL Next uses to proxy `/api/*`. Inside a container `localhost` is the container — leave this pointing at the compose service `backend`. |
| `JWT_SECRET` | `change-me-in-production` | HMAC key for session tokens. Rotate w/ `openssl rand -hex 32`. |
| `JWT_EXPIRES_IN_SECONDS` | `3600` | Session TTL |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | Admin login |
| `VIEWER_USERNAME` / `VIEWER_PASSWORD` | `viewer` / `viewer` | Read-only login |
| `DATABASE_PATH` | `/app/data/buildos-infra.sqlite` | SQLite file (volume-mounted) |
| `DEFAULT_AGENT_VERSION` | `v1.0.0` | Stamped on new node rows |
| `CLOUDFLARE_API_TOKEN` | empty | Scoped CF token (`Zone.DNS:Edit`). Empty = DNS routes return cached rows only. |
| `CLOUDFLARE_ZONE_ID` | empty | Target zone id |
| `GEMINI_API_KEY` | empty | Server-side Google AI Studio key. Empty = co-pilot returns 503. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Override w/ any supported model id |

### Agent (`/etc/buildos-agent/config.env`)

| Var | Purpose |
|-----|---------|
| `MASTER_SERVER_URL` | Base WSS URL **without** node id (e.g., `wss://buildos.example.com/api/ws/agent`) |
| `NODE_ID` | Assigned by master on registration |
| `SECURE_AGENT_TOKEN` | Plaintext token shown **once** at registration; master stores argon2id hash |
| `TELEMETRY_INTERVAL_SECONDS` | Heartbeat cadence (default 5) |
| `ALLOWED_CONTAINERS` | Comma-separated container names. Empty = no filter. **Set this in production** to limit blast radius if the master is compromised. |
| `EMERGENCY_STOP_ON_BLOCK` | `true`/`false` — on EMERGENCY_BLOCK, stop every container in the allowlist. Default `true`. |
| `LOG_LEVEL` | `INFO` / `DEBUG` |

---

## Adding an agent to a remote node

### Step 1 — Register the node from the dashboard

1. Log in to the master at `http://<master-ip>:4225` as admin.
2. Navigate to **Servers**.
3. Fill **Register new node**: name, type (`VPS` / `HOMELAB` / `PROXMOX`), provider, IP, region.
4. Click **Register**. A green card appears with:
   - `node_id` (e.g., `node_vps_3ac29d`)
   - `secure_token` (shown **once** — copy it now)
   - A ready-to-paste `curl ... | bash` install command

### Step 2 — Run the installer on the target host

SSH into the remote host and paste the command:

```bash
curl -sSL https://your-master/install.sh | bash -s -- \
  --token bs_agent_tkn_xxxxxxxx \
  --node-id node_vps_3ac29d \
  --master wss://your-master/api/ws/agent
```

> The repo also ships `agent/install.sh` directly. If you don't want a public installer URL, copy the `agent/` directory to the remote host and run `sudo ./agent/install.sh --token ... --node-id ... --master wss://...`.

The installer:
- Creates a `buildos-agent` system user (added to the `docker` group).
- Installs to `/opt/buildos-agent`, creates a Python venv, installs `requirements.txt`.
- Writes `/etc/buildos-agent/config.env` with mode `0600`.
- Registers and starts `buildos-agent.service` (systemd).

### Step 3 — Confirm

Back in the dashboard, the node flips from `offline` → `online` within one heartbeat (~5s). The fleet card on **Dashboard** shows live CPU/RAM/disk + a sparkline. Containers appear under **Containers** within a few heartbeats.

### Run an agent manually (no installer)

For development or one-shot tests:

```bash
python3 -m venv /tmp/buildos-agent-venv
/tmp/buildos-agent-venv/bin/pip install -r agent/requirements.txt

MASTER_SERVER_URL="ws://your-master:8015/api/ws/agent" \
NODE_ID="node_vps_3ac29d" \
SECURE_AGENT_TOKEN="bs_agent_tkn_xxxxxxxx" \
TELEMETRY_INTERVAL_SECONDS=3 \
ALLOWED_CONTAINERS="nginx,api,redis" \
/tmp/buildos-agent-venv/bin/python agent/main.py
```

---

## Cloudflare integration (optional)

The dashboard's **Domains** page lists and edits DNS records for a single zone.

1. Create a scoped Cloudflare API token: `Zone.DNS:Edit` on the target zone. Do not use the global API key.
2. Add to `.env`:
   ```bash
   CLOUDFLARE_API_TOKEN="<scoped-token>"
   CLOUDFLARE_ZONE_ID="<zone-id>"
   ```
3. Restart backend: `docker compose up -d --build backend`.
4. `/api/health` reports `"cloudflare":"configured"`.

Without credentials, GET still works (returns the local mirror in `dns_records`) but writes return 503.

---

## Gemini AI co-pilot (optional)

`POST /api/gemini/diagnose` accepts `{ prompt, logs? }` and returns a Gemini-generated diagnosis structured as: root cause, three actions, suggested commands.

UI surfaces:
- **Dashboard → AI co-pilot panel** — free-form prompt + optional log paste box.
- **Dashboard → Log stream → "Diagnose last 50"** — pipes the most recent 50 control-plane events straight into Gemini.

Set `GEMINI_API_KEY` (Google AI Studio key) in `.env`. The key is **server-only**; the browser never sees it.

---

## Emergency lockdown

When something is on fire and you need everything to stop:

1. Dashboard → **Emergency**.
2. Check the confirmation box.
3. Type `FORCE KILL` exactly into the input.
4. Click **Engage lockdown**.

Effects:
- All `POST /api/infra/containers/:id/control` return HTTP 423.
- All `POST /api/cloudflare/dns` and `DELETE /api/cloudflare/dns/:id` return HTTP 423.
- An `EMERGENCY_BLOCK` frame is fanned out to every connected agent over WS.
- Agents reject local `DOCKER_CONTROL` frames and, if `EMERGENCY_STOP_ON_BLOCK=true`, stop every container in `ALLOWED_CONTAINERS`.
- Auto-heal sweep is paused.
- State is persisted in `system_state.emergency_lockdown="TRUE"` and survives restart.

Release via **Release lockdown** (admin only). Master sends `EMERGENCY_RELEASE` to agents.

---

## Auto-heal

Each container row on `/containers` has an **auto-heal on failure** checkbox (admin only). When enabled:

- A 30s master sweep looks for containers where `auto_heal=1`, the node is `online`, and the state is `exited` / `error` / `dead` / `restarting`.
- It dispatches `restart` to the agent and marks `last_heal_attempt` to throttle subsequent attempts to once per 60 seconds.
- The sweep is skipped while emergency lockdown is engaged.

---

## Token rotation

If an agent token leaks (or you just want to rotate periodically):

1. Dashboard → **Servers**.
2. Click **rotate token** on the row, confirm.
3. The success card shows a new one-shot token + curl install command.
4. SSH into the agent host, edit `/etc/buildos-agent/config.env`, paste the new `SECURE_AGENT_TOKEN`, then:
   ```bash
   sudo systemctl restart buildos-agent
   ```
5. Until the agent restarts, it remains locked out (WS upgrade 401s).

---

## API reference

### REST

All `/api/infra/*` routes require a Bearer JWT from `POST /api/auth/login`.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/api/health` | none | Phase, db, cloudflare, gemini, lockdown state |
| POST   | `/api/auth/login` | none | Body `{role,username,password}` → `{token,...}` |
| GET    | `/api/infra/nodes` | required | List w/ status + last_ping |
| POST   | `/api/infra/nodes/register` | admin | Body `{name,type,provider,ip_address,region}` → install command + token |
| GET    | `/api/infra/nodes/:id/metrics?range=15m\|1h\|24h\|7d` | required | CPU/RAM/disk time-series |
| POST   | `/api/infra/nodes/:id/regenerate-token` | admin | New argon2 hash + one-shot plaintext |
| GET    | `/api/infra/containers?node_id=...` | required | All synced containers |
| POST   | `/api/infra/containers/:id/control` | admin | Body `{action:"start"\|"stop"\|"restart"}` (gated by lockdown) |
| POST   | `/api/infra/containers/:id/auto-heal` | admin | Body `{enabled:bool}` |
| GET    | `/api/infra/logs?limit=N` | required | Last N (max 500) system log rows |
| POST   | `/api/infra/emergency-kill` | admin | Body `{confirmed:true,auth_keyphrase:"FORCE KILL"}` |
| POST   | `/api/infra/emergency-reset` | admin | Release lockdown |
| GET    | `/api/cloudflare/dns` | required | Live from CF (mirrored locally) or cache when unconfigured |
| POST   | `/api/cloudflare/dns` | admin | Create record (gated by lockdown) |
| DELETE | `/api/cloudflare/dns/:id` | admin | Delete record (gated by lockdown) |
| POST   | `/api/gemini/diagnose` | required | Body `{prompt, logs?}` (4000 char prompt cap) |

### WebSocket — agents

Endpoint: `wss://<master>/api/ws/agent/<NODE_ID>`
Auth: `Authorization: Bearer <SECURE_AGENT_TOKEN>` header (argon2 verify; legacy sha256 fallback).

| Direction | Action | Notes |
|-----------|--------|-------|
| agent → master | `HEARTBEAT` | `{telemetry:{cpu_pct,ram_pct,disk_pct}, containers:[...]}` |
| master → agent | `DOCKER_CONTROL` | `{transaction_id, target_container, signal:"start"\|"stop"\|"restart"}` |
| agent → master | `CMD_RESPONSE` | `{transaction_id, status, message}` |
| master → agent | `EMERGENCY_BLOCK` / `EMERGENCY_RELEASE` | Toggle agent-side lock |
| master → agent | `SUBSCRIBE_LOGS` / `UNSUBSCRIBE_LOGS` | `{container_id, container_name}` |
| agent → master | `CONTAINER_LOG` | `{container_id, line, stream, timestamp}` |

### WebSocket — browser dashboard

Endpoint: `wss://<master>/api/ws/control-plane`
Auth: `Sec-WebSocket-Protocol: buildos.token.<JWT>` subprotocol (token never in URL).

Inbound (browser → master):
```json
{"action":"SUBSCRIBE_LOGS","node_id":"...","container_id":"...","container_name":"..."}
{"action":"UNSUBSCRIBE_LOGS","node_id":"...","container_id":"..."}
```

Outbound event types:
- `WELCOME` — connection ack
- `TELEMETRY_BROADCAST` — heartbeat fan-out
- `AGENT_CONNECTED` / `AGENT_DISCONNECTED`
- `CMD_RESPONSE` — agent command result
- `LOG_EVENT` — every `appendSystemLog` row
- `CONTAINER_LOG` — live Docker stdout (filtered by client subscriptions)
- `DNS_RECORD_CREATED` / `DNS_RECORD_DELETED`
- `EMERGENCY_LOCKDOWN` / `EMERGENCY_RELEASED`

---

## Local development (no Docker)

Two processes, two terminals.

```bash
npm install

# Terminal 1 — Express backend on :8000
npm run backend

# Terminal 2 — Next.js dev on :4225
npm run dev
```

Set in `.env` for this mode:
```bash
BACKEND_INTERNAL_URL="http://localhost:8000"
```

Typecheck (CI gate):
```bash
npm run lint          # frontend (tsconfig.lint.json)
npx tsc --noEmit      # full repo
```

---

## Project layout

```
buildos-infra/
├── src/app/                     # Next.js App Router
│   ├── login/                   # public login page
│   ├── (protected)/             # auth-gated route group
│   │   ├── dashboard/           # live fleet + log stream + co-pilot
│   │   ├── servers/             # node list + register + rotate
│   │   ├── containers/          # live list + control + log tail + auto-heal
│   │   ├── domains/             # Cloudflare DNS CRUD
│   │   └── emergency/           # Airlock UX
│   └── auth/callback/
├── src/components/              # React UI (incl. live-fleet-card, log-stream-card, copilot-panel, container-log-tail, sparkline)
├── src/hooks/                   # use-control-plane-ws, use-log-stream, use-node-metrics, use-app-user
├── src/lib/                     # api.ts (fetch helper), auth/, navigation, utils
├── backend/src/
│   ├── server.ts                # Express bootstrap + REST routes
│   ├── ws-hub.ts                # WebSocket upgrade router + agent registry + fan-out
│   ├── auth.ts                  # HS256 JWT + timing-safe creds
│   ├── database.ts              # SQLite (WAL), schema, migrations, helpers
│   ├── cloudflare.ts            # CF v4 wrapper (scoped Bearer)
│   ├── gemini.ts                # @google/genai client
│   └── config.ts                # Env loader w/ defaults
├── agent/                       # Python remote daemon
│   ├── main.py                  # Async heartbeat + receive loop + log tail
│   ├── install.sh               # systemd installer
│   ├── buildos-agent.service
│   ├── requirements.txt
│   └── config.example.env
├── docker-compose.yml           # backend + control-plane services
├── Dockerfile                   # Next.js standalone image
├── Dockerfile.backend           # tsx backend image
├── .env.example
└── next.config.ts               # /api/* rewrite to BACKEND_INTERNAL_URL
```

Aspirational/future-state docs (FastAPI/Python design) sit in `ARCHITECTURE.md`, `BACKEND_SPEC.md`, `MONOREPO_STRUCTURE.md`. Current implementation is Node/Express — endpoints + payloads documented here are authoritative.

---

## Security checklist before exposing

- [ ] `JWT_SECRET` is `openssl rand -hex 32`, not the default.
- [ ] `ADMIN_PASSWORD`, `VIEWER_PASSWORD` rotated off the defaults.
- [ ] Cloudflare token is **scoped** (`Zone.DNS:Edit`), not the global API key.
- [ ] Gemini key only in backend `.env` — never in any `NEXT_PUBLIC_*` var.
- [ ] Agents set `ALLOWED_CONTAINERS` to limit blast radius.
- [ ] `/etc/buildos-agent/config.env` is `chmod 600`, owned by `buildos-agent:buildos-agent` (the installer does this).
- [ ] Master is reachable only via Tailscale / Cloudflare Tunnel / VPN — **do not** publish `4225` directly to the internet without a TLS-terminating proxy.
- [ ] SQLite file is on a backed-up volume; an off-site `sqlite3 .backup` snapshot runs daily.

---

## Troubleshooting

### Login or any `/api/*` returns 500

```bash
docker logs buildos_control_plane --tail 50
```

- `ECONNREFUSED http://localhost:8015/...` → backend container not running, or `BACKEND_INTERNAL_URL` is wrongly set to `localhost`. Inside the frontend container `localhost` is the frontend itself. Set `BACKEND_INTERNAL_URL=http://backend:8000` and `docker compose up -d backend`.
- `ENOTFOUND backend` → the backend service isn't on the same Compose network. Make sure both services are declared in the same `docker-compose.yml`.

### Backend container exits immediately

```bash
docker logs buildos_backend --tail 50
```

- `Cannot find package 'vite'` → outdated build. `backend/src/server.ts` only loads Vite via dynamic import in non-production; pull latest.

### Agent shows `offline` after install

- Confirm the host can resolve and reach `MASTER_SERVER_URL` (check firewall, DNS).
- `journalctl -u buildos-agent -e` — check for `4003 Unauthorized` (wrong token / node_id mismatch).
- Token typos are the #1 cause. Rotate the token from the dashboard if unsure.

### Login works but the dashboard's fleet card is empty

- WS handshake may have failed. Open browser DevTools → Network → WS. Look for the `/api/ws/control-plane` connection w/ subprotocol `buildos.token.<JWT>`. If it 401s, your session expired — log out and back in.

### Reset everything

```bash
docker compose down
docker volume rm buildos-infra_buildos_data
docker compose up -d --build
```

This wipes SQLite (nodes, containers, logs, metrics, DNS mirror, system state). Default seed re-runs on next boot.

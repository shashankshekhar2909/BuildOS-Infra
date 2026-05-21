<div align="center">

# 🛰️ BuildOS Infra

**Self-hosted control plane for your fleet.**
One dashboard. Every Docker host. Cloudflare DNS. Panic button. AI co-pilot.

[![Stack](https://img.shields.io/badge/stack-Next.js%2015%20%C2%B7%20Express%20%C2%B7%20SQLite%20%C2%B7%20Python-0891b2)]()
[![Auth](https://img.shields.io/badge/auth-argon2id%20%C2%B7%20JWT%20%C2%B7%20rate--limited-22c55e)]()
[![Edge](https://img.shields.io/badge/edge-Cloudflare%20Tunnel%20%C2%B7%20Tailscale-f59e0b)]()
[![License](https://img.shields.io/badge/license-MIT-64748b)]()

</div>

---

## Why

You have VPSes, a homelab, maybe a Proxmox box. SSH-tabbing through them to check container health and DNS is tedious and error-prone. **BuildOS Infra** gives you one mobile-friendly dashboard that:

- 📡 **Sees every host** — CPU / RAM / disk + container inventory in real time
- 🎛️ **Controls containers** — start / stop / restart, tail live Docker logs
- 🌐 **Manages DNS** — Cloudflare records, per-zone, w/ token-scoped writes
- 🚨 **Panics safely** — `FORCE KILL` keyphrase fans out to every agent in <1s
- 🤖 **Asks Gemini** — paste 50 lines of logs, get root-cause + fix
- 🔁 **Heals itself** — opt-in auto-restart on container failure
- 🧩 **Runs Proxmox PCT/VMs** — list, start, stop LXC + QEMU guests via the same UI
- 📱 **Works on your phone** — drawer-based UI, big tap targets, iOS-safe inputs

Two Docker containers on your homelab, plus one Python systemd daemon per agent host. No SaaS, no telemetry off-box.

---

## Architecture

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
              │  VPS node       │     │  Homelab node   │     │  Proxmox host   │
              │  Python agent   │     │  Python agent   │     │  Python agent   │
              │  /var/run/      │     │  /var/run/      │     │  PVE API +      │
              │  docker.sock    │     │  docker.sock    │     │  docker.sock    │
              └─────────────────┘     └─────────────────┘     └─────────────────┘
```

Agents connect **outbound** to the master over a single persistent WebSocket. No inbound port on the agent host. NAT, residential firewalls, CGNAT all work.

---

## Table of contents

1. [Features](#features)
2. [Stack](#stack)
3. [Requirements](#requirements)
4. [Quick start](#quick-start)
5. [Configuration](#configuration)
6. [Adding an agent](#adding-an-agent)
7. [Cloudflare integration](#cloudflare-integration)
8. [Gemini AI co-pilot](#gemini-ai-co-pilot)
9. [Emergency lockdown](#emergency-lockdown)
10. [Auto-heal](#auto-heal)
11. [User management](#user-management)
12. [Token rotation](#token-rotation)
13. [API reference](#api-reference)
14. [Local development](#local-development)
15. [Project layout](#project-layout)
16. [Security posture](#security-posture)
17. [Troubleshooting](#troubleshooting)

---

## Features

### 🖥️ Fleet
- Live CPU / RAM / disk meters w/ color thresholds (75% amber, 90% red)
- Per-node 1h sparkline (CPU + RAM)
- Container grouping by server, free-text filter, state filter
- Drawer-based detail view (right-side slide-in on desktop, full-screen on mobile)

### 🔐 Auth + RBAC
- DB-backed users (`admin` / `viewer`), argon2id hashing
- JWT sessions w/ rotatable `JWT_SECRET`
- Login rate-limit (5 fails / 15min / IP)
- User CRUD UI: add, change role, set password, delete (with safety rails — no last-admin demote, no self-delete)
- Per-user account page for self-password change
- Audit `actor` column on `system_logs` — "who did what" lives forever

### 🌐 Edge + DNS
- Cloudflare zone CRUD (multi-zone)
- Per-zone access probe (accessible / blocked / error badges)
- Proxied / DNS-only toggle on each record
- All mutations log + broadcast

### 🐳 Container ops
- Start / stop / restart via the agent over WS (no SSH)
- Live Docker stdout tail w/ subscription ref-counting
- Auto-heal opt-in per container (30s sweep, 60s throttle)
- Orphan reconciliation (container deleted on host → row flips to `missing`, removed from heal sweep)

### 🤖 AI
- Gemini `gemini-2.5-flash` for free-form diagnosis
- Quick-action chips: "What's broken?", "Why offline?", "Restart loop?", "Resource hot spots"
- "Diagnose last 50 events" one-tap from the log stream
- Per-user rate-limit (10 / min)

### 🚨 Safety
- Emergency airlock (checkbox + `FORCE KILL` keyphrase + admin role)
- Master + agent both honor lockdown — DNS writes + container control return HTTP 423
- Auto-heal pauses during lockdown
- State persists across restart

### 🧱 Proxmox
- LXC + QEMU enumeration via `proxmoxer`
- Start / stop / reboot / shutdown from the same drawer
- Per-guest cpu / mem / disk %

### 🛡️ Hardening
- `helmet` w/ strict CSP, HSTS 1y, X-Frame-Options, Referrer-Policy
- Trust proxy + CF-Connecting-IP for accurate rate-limit keys
- `Sec-WebSocket-Protocol` subprotocol auth for browser (token never in URL)
- argon2id-hashed agent tokens stored server-side; plaintext shown once

---

## Stack

| Layer | Tech | Port |
|-------|------|------|
| Frontend | Next.js 15 (App Router, standalone build), Tailwind v4, **shadcn/ui** on Radix | `4225` → `3000` |
| Backend  | Express + `tsx` + `ws` (TypeScript) | `8015` → `8000` |
| Database | SQLite (`node:sqlite`, WAL mode), Docker volume | — |
| Agent    | Python 3 + `websockets` + `docker` SDK + `psutil` + `proxmoxer` | egress only |
| AI       | `@google/genai` w/ `gemini-2.5-flash` | server-side |
| Crypto   | `@node-rs/argon2` (argon2id), HMAC-SHA256 JWT, `helmet` headers | |

---

## Requirements

**Master host (homelab):**
- Docker + Docker Compose v2
- ~256 MB RAM, ~1 GB disk

**Agent hosts:**
- Linux w/ systemd
- Python 3.10+
- Docker socket at `/var/run/docker.sock` (or Proxmox API access for PVE mode)
- Outbound TCP/443 (or whatever port the master listens on) reachable

---

## Quick start

```bash
git clone <repo> buildos-infra
cd buildos-infra
cp .env.example .env

# Generate a strong JWT secret (mandatory in production)
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# Edit .env — rotate ADMIN_PASSWORD, VIEWER_PASSWORD off defaults.
# Optional: paste GEMINI_API_KEY, CLOUDFLARE_API_TOKEN + zones.

docker compose up -d --build
```

Two containers come up:
- `buildos_backend` — Express API + WebSocket hub on `:8015`
- `buildos_control_plane` — Next.js dashboard on `:4225`

Open `http://<host-ip>:4225`. Default login is `admin` / `admin` — **change immediately** from the **Users** page.

### Verify

```bash
curl http://localhost:4225/api/health
# {"status":"ok"}

curl -X POST http://localhost:4225/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# {"success":true,"token":"...","user":{...}}
```

---

## Configuration

All variables live in `.env` next to `docker-compose.yml`. The compose file forwards them to the backend container.

### Master backend

| Var | Default | Purpose |
|-----|---------|---------|
| `APP_BASE_URL` | `http://localhost:4225` | Public URL of the dashboard; used to build agent install commands |
| `NEXT_PUBLIC_APP_BASE_URL` | same | Same value, exposed to the browser |
| `BACKEND_INTERNAL_URL` | `http://backend:8000` | **Container-internal** URL Next uses to proxy `/api/*`. Inside a container `localhost` is the container itself — leave this pointing at the compose service `backend`. |
| `JWT_SECRET` | `change-me-in-production` | HMAC key for session tokens. Backend FATALs in prod if left at default. Rotate w/ `openssl rand -hex 32`. |
| `JWT_EXPIRES_IN_SECONDS` | `3600` | Session TTL |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin` | Seed admin login (one-shot — change in UI after first boot) |
| `VIEWER_USERNAME` / `VIEWER_PASSWORD` | `viewer` / `viewer` | Seed read-only login |
| `SKIP_DEMO_SEED` | `false` | Set `true` in real deployments to skip seeded demo nodes |
| `DATABASE_PATH` | `/app/data/buildos-infra.sqlite` | SQLite file (volume-mounted) |
| `DEFAULT_AGENT_VERSION` | `v1.0.0` | Stamped on new node rows |
| `CLOUDFLARE_API_TOKEN` | empty | Scoped CF token (`Zone.DNS:Edit`). Empty = DNS routes return cached rows only. |
| `CLOUDFLARE_ZONE_ID` | empty | Single-zone fallback id |
| `CLOUDFLARE_ZONES` | empty | Comma-separated zone seeds: `name=zone_id,name2=zone_id2` |
| `GEMINI_API_KEY` | empty | Server-side Google AI Studio key. Empty = co-pilot returns 503. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Override w/ any supported model id |
| `NODE_ENV` | `development` | Set to `production` for FATAL on default secrets + stricter helmet |

### Agent (`/etc/buildos-agent/config.env`)

| Var | Purpose |
|-----|---------|
| `MASTER_SERVER_URL` | Base WSS URL **without** node id (e.g., `wss://buildos.example.com/api/ws/agent`) |
| `NODE_ID` | Assigned by master on registration |
| `SECURE_AGENT_TOKEN` | Plaintext token shown **once** at registration; master stores argon2id hash |
| `AGENT_MODE` | `docker` / `proxmox` / `hybrid` (default `docker`) |
| `TELEMETRY_INTERVAL_SECONDS` | Heartbeat cadence (default 5) |
| `ALLOWED_CONTAINERS` | Comma-separated container names. Empty = no filter. **Set in production** to limit blast radius. |
| `EMERGENCY_STOP_ON_BLOCK` | `true`/`false` — on EMERGENCY_BLOCK, stop every container in the allowlist. Default `true`. |
| `PVE_HOST` / `PVE_TOKEN_ID` / `PVE_TOKEN_SECRET` | Proxmox API access (only when `AGENT_MODE` includes `proxmox`) |
| `LOG_LEVEL` | `INFO` / `DEBUG` |

---

## Adding an agent

### Step 1 — Register the node from the dashboard

1. Log in to the master as admin.
2. Navigate to **Servers**.
3. Fill **Register new node**: name, type (`VPS` / `HOMELAB` / `PROXMOX`), provider, IP, region.
4. Click **Register**. A green card appears with:
   - `node_id` (e.g., `node_vps_3ac29d`)
   - `secure_token` (shown **once** — copy it now)
   - A ready-to-paste `curl ... | bash` install command

### Step 2 — Run the installer on the target host

SSH into the remote host and paste the command. The installer:

- Creates a `buildos-agent` system user (added to `docker` group if present)
- Installs to `/opt/buildos-agent`, creates a Python venv, installs `requirements.txt`
- Writes `/etc/buildos-agent/config.env` with mode `0600`
- Registers and starts `buildos-agent.service` (systemd)

Flags:
```
--token <bs_agent_tkn_...>     # required, plaintext token from dashboard
--node-id <node_vps_...>       # required, node id from dashboard
--master wss://your-master/... # required, full WS URL
--mode docker|proxmox|hybrid   # default: docker
--allow "nginx,api,redis"      # optional, container allowlist
```

### Step 3 — Confirm

Back in the dashboard, the node flips from `offline` → `online` within one heartbeat (~5s). The fleet card on **Dashboard** shows live CPU/RAM/disk + a sparkline. Containers appear under **Containers** within a few heartbeats.

### Hetzner / cloud VPS via Tailscale

If the master sits on Tailscale and the agent host is a cloud VPS:

1. Install Tailscale on both: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`
2. Use the master's Tailscale IP in `MASTER_SERVER_URL`: `ws://100.x.y.z:8015/api/ws/agent`
3. Run installer w/ `--master ws://100.x.y.z:8015/api/ws/agent`

No inbound port on either side. Tailscale is the transport.

### Manual run (no installer)

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

## Cloudflare integration

The dashboard's **Domains** page lists and edits DNS records per zone.

1. Create a scoped Cloudflare API token: **My Profile → API Tokens → Create Token**.
   - Template: *Edit zone DNS*
   - Permissions: `Zone.DNS:Edit` (+ optional `Zone:Read`)
   - Zone resources: the specific zone(s) you want to manage
   - **Do not** use the global API key or an Access Service Token (`cfat_...`)
2. Add to `.env`:
   ```bash
   CLOUDFLARE_API_TOKEN="<scoped-token>"
   CLOUDFLARE_ZONES="example.com=<zone-id>,other.com=<zone-id>"
   ```
3. Restart backend: `docker compose up -d --build backend`
4. `/api/health` reports the token is configured; Domains page shows green "accessible" badge per zone.

Without credentials, GET still works (returns the local mirror in `dns_records`); writes return 503.

### Add a zone later

Use **Add zone later** on the Domains page — no redeploy needed. Token must already have access to the new zone.

---

## Gemini AI co-pilot

`POST /api/gemini/diagnose` accepts `{ prompt, logs? }` and returns a Gemini-generated diagnosis.

UI surfaces:
- **Dashboard → AI co-pilot panel** — free-form prompt + quick-action chips + optional log paste
- **Dashboard → Log stream → "Diagnose 50"** — pipes the most recent 50 control-plane events straight into Gemini

Set `GEMINI_API_KEY` (Google AI Studio key) in `.env`. The key is **server-only**; the browser never sees it. Rate-limited 10 req/min per user.

---

## Emergency lockdown

When something is on fire:

1. Dashboard → **Emergency**
2. Check the confirmation box
3. Type `FORCE KILL` exactly into the input
4. Click **Engage lockdown**

Effects:
- All `POST /api/infra/containers/:id/control` return HTTP 423
- All `POST /api/cloudflare/dns` and `DELETE /api/cloudflare/dns/:id` return HTTP 423
- An `EMERGENCY_BLOCK` frame is fanned out to every connected agent
- Agents reject local `DOCKER_CONTROL` and, if `EMERGENCY_STOP_ON_BLOCK=true`, stop every container in `ALLOWED_CONTAINERS`
- Auto-heal sweep is paused
- State persists in `system_state.emergency_lockdown="TRUE"` and survives restart

Release via **Release lockdown** (admin only). Master sends `EMERGENCY_RELEASE` to agents.

---

## Auto-heal

Each container row on `/containers` has an **auto-heal on failure** checkbox (admin only). When enabled:

- A 30s master sweep looks for containers where `auto_heal=1`, the node is `online`, and the state is `exited` / `error` / `dead` / `restarting`
- It dispatches `restart` to the agent and marks `last_heal_attempt` to throttle subsequent attempts to once per 60 seconds
- The sweep is skipped while emergency lockdown is engaged
- Containers reported as `missing` (deleted on host but row still exists) are excluded

---

## User management

`/users` (admin only):

- List all users with role badges
- **Add user** — username + password (≥8 chars) + role
- **Set password** — admin can force-reset any user's password
- **Promote / demote** — flip viewer ↔ admin (refuses last-admin demote)
- **Delete** — remove a user (refuses self-delete + last-admin removal)

`/account` (every user):

- View own role + id
- Change own password (current + new + confirm)
- Sign out

All mutations log to `system_logs` with the acting user in the `actor` column.

---

## Token rotation

If an agent token leaks (or you just rotate periodically):

1. Dashboard → **Servers** → click the node row
2. In the drawer, click **rotate token**, confirm
3. The success card shows a new one-shot token + curl install command
4. SSH into the agent host, edit `/etc/buildos-agent/config.env`, paste the new `SECURE_AGENT_TOKEN`, then:
   ```bash
   sudo systemctl restart buildos-agent
   ```
5. Until the agent restarts, it remains locked out (WS upgrade 401s)

---

## API reference

### REST

All `/api/infra/*` routes require a Bearer JWT from `POST /api/auth/login`. Mutating routes also require `admin` role.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/api/health` | none | `{status:"ok"}` |
| GET    | `/api/status` | required | Phase, db, cloudflare, gemini, lockdown state |
| POST   | `/api/auth/login` | none | Body `{username,password}` → `{token,...}` (role from DB) |
| GET    | `/api/auth/me` | required | Current user record |
| GET    | `/api/users` | admin | List users |
| POST   | `/api/users` | admin | Body `{username,password,role}` |
| PATCH  | `/api/users/:id/role` | admin | Body `{role}` |
| PATCH  | `/api/users/:id/password` | self+current or admin | Body `{new_password, current_password?}` |
| DELETE | `/api/users/:id` | admin | Refuses self-delete + last-admin |
| GET    | `/api/infra/nodes` | required | List w/ status + last_ping |
| POST   | `/api/infra/nodes/register` | admin | Body `{name,type,provider,ip_address,region}` → install command + token |
| GET    | `/api/infra/nodes/:id/metrics?range=15m\|1h\|24h\|7d` | required | CPU/RAM/disk time-series |
| POST   | `/api/infra/nodes/:id/regenerate-token` | admin | New argon2 hash + one-shot plaintext |
| DELETE | `/api/infra/nodes/:id` | admin | Remove node + cascade containers |
| GET    | `/api/infra/containers?node_id=...` | required | All synced containers |
| POST   | `/api/infra/containers/:id/control` | admin | Body `{action:"start"\|"stop"\|"restart"}` (gated by lockdown) |
| POST   | `/api/infra/containers/:id/auto-heal` | admin | Body `{enabled:bool}` |
| GET    | `/api/infra/logs?limit=N` | required | Last N (max 500) system log rows, includes `actor` |
| POST   | `/api/infra/emergency-kill` | admin | Body `{confirmed:true,auth_keyphrase:"FORCE KILL"}` |
| POST   | `/api/infra/emergency-reset` | admin | Release lockdown |
| GET    | `/api/infra/pve/:nodeId/guests` | required | List LXC + QEMU guests |
| POST   | `/api/infra/pve/:nodeId/guests/:vmid/control` | admin | Body `{action:"start"\|"stop"\|"reboot"\|"shutdown"}` |
| GET    | `/api/cloudflare/zones` | required | List configured zones |
| POST   | `/api/cloudflare/zones` | admin | Add a zone seed |
| GET    | `/api/cloudflare/zones/:id/check` | required | Probe token access to zone |
| GET    | `/api/cloudflare/dns?zone_id=...` | required | Live from CF (mirrored locally) or cache when unconfigured |
| POST   | `/api/cloudflare/dns` | admin | Create record (gated by lockdown) |
| DELETE | `/api/cloudflare/dns/:id` | admin | Delete record (gated by lockdown) |
| POST   | `/api/gemini/diagnose` | required | Body `{prompt, logs?}` — rate-limited 10/min/user |

### WebSocket — agents

Endpoint: `wss://<master>/api/ws/agent/<NODE_ID>`
Auth: `Authorization: Bearer <SECURE_AGENT_TOKEN>` header (argon2 verify; legacy sha256 fallback).

| Direction | Action | Notes |
|-----------|--------|-------|
| agent → master | `HEARTBEAT` | `{telemetry:{cpu_pct,ram_pct,disk_pct}, containers:[...]}` |
| agent → master | `PVE_GUESTS` | LXC + QEMU enumeration (proxmox mode) |
| master → agent | `DOCKER_CONTROL` | `{transaction_id, target_container, signal:"start"\|"stop"\|"restart"}` |
| master → agent | `PVE_CONTROL` | `{transaction_id, vmid, kind, signal}` |
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
- `LOG_EVENT` — every `appendSystemLog` row (includes `actor`)
- `CONTAINER_LOG` — live Docker stdout (filtered by client subscriptions)
- `EMERGENCY_LOCKDOWN` / `EMERGENCY_RELEASED`

---

## Local development

Quickest path — both servers, one command:

```bash
npm install
npm run live
```

That starts:
- Express backend on `:8016`
- Next.js dev server on `:4235`

Split terminals if preferred:

```bash
# Terminal 1
PORT=8016 APP_URL="http://localhost:4235" DATABASE_PATH="./data/buildos-infra.sqlite" npm run backend

# Terminal 2
PORT=4235 BACKEND_INTERNAL_URL="http://127.0.0.1:8016" npm run dev
```

CI gates:
```bash
npm run lint          # frontend (tsconfig.lint.json)
npx tsc --noEmit      # full repo
npm run build         # production build
```

---

## Project layout

```
buildos-infra/
├── src/app/                     # Next.js App Router
│   ├── login/                   # public login
│   ├── (protected)/             # auth-gated route group
│   │   ├── dashboard/           # live fleet + log stream + co-pilot
│   │   ├── servers/             # node list + register + rotate (drawer)
│   │   ├── containers/          # live list + control + log tail + auto-heal
│   │   ├── domains/             # Cloudflare DNS CRUD
│   │   ├── users/               # user management (admin)
│   │   ├── account/             # self password change
│   │   └── emergency/           # airlock UX
│   └── auth/callback/
├── src/components/              # React UI
│   ├── ui/                      # shadcn primitives (sheet, select, dialog, sonner, …)
│   ├── live-fleet-card.tsx
│   ├── log-stream-card.tsx
│   ├── copilot-panel.tsx
│   ├── container-log-tail.tsx
│   ├── node-detail-drawer.tsx
│   ├── container-detail-drawer.tsx
│   └── sparkline.tsx
├── src/hooks/                   # use-control-plane-ws, use-log-stream, use-node-metrics, use-app-user
├── src/lib/                     # api.ts (fetch helper), auth/, navigation, utils
├── backend/src/
│   ├── server.ts                # Express bootstrap + REST routes + helmet
│   ├── ws-hub.ts                # WebSocket upgrade router + agent registry + fan-out
│   ├── auth.ts                  # HS256 JWT + DB-backed verify + dummy-hash on unknown user
│   ├── database.ts              # SQLite (WAL), schema, migrations, helpers
│   ├── cloudflare.ts            # CF v4 wrapper (scoped Bearer)
│   ├── gemini.ts                # @google/genai client
│   └── config.ts                # Env loader w/ FATAL on bad secrets
├── agent/                       # Python remote daemon
│   ├── main.py                  # Async heartbeat + receive loop + log tail + PVE
│   ├── install.sh               # systemd installer (auto-installs python3-venv)
│   ├── buildos-agent.service
│   ├── requirements.txt
│   └── config.example.env
├── docker-compose.yml           # backend + control-plane + (optional) agent
├── Dockerfile                   # Next.js standalone image
├── Dockerfile.backend           # tsx backend image
├── Dockerfile.agent             # local agent image
├── .env.example
└── next.config.ts               # /api/* rewrite to BACKEND_INTERNAL_URL
```

---

## Security posture

### Defaults
- argon2id for all user passwords + agent tokens (legacy SHA-256 fallback kept until all tokens rotated)
- HS256 JWT w/ rotatable secret + FATAL on default-in-production
- Login rate-limit (5 fails / 15min / IP) — keyed on `cf-connecting-ip` when behind Cloudflare
- Gemini rate-limit (10/min/user)
- `helmet` w/ strict CSP, HSTS 1y + `includeSubDomains`, X-Frame-Options SAMEORIGIN, Referrer-Policy, X-DNS-Prefetch-Control off
- `Sec-WebSocket-Protocol` subprotocol auth (token never in URL, never in server logs)
- `system_logs.actor` column on every operator mutation

### Before exposing publicly

- [ ] `JWT_SECRET` is `openssl rand -hex 32`, not the default
- [ ] `ADMIN_PASSWORD`, `VIEWER_PASSWORD` rotated off the defaults (or changed via Users page)
- [ ] `SKIP_DEMO_SEED=true`
- [ ] Cloudflare token is **scoped** (`Zone.DNS:Edit`), not the global API key, not an Access Service Token
- [ ] Cloudflare Tunnel (or Tailscale, or VPN) fronts the master — do **not** publish `:4225` directly to the internet without TLS termination
- [ ] Agents set `ALLOWED_CONTAINERS` to limit blast radius
- [ ] `/etc/buildos-agent/config.env` is `chmod 600`, owned by `buildos-agent:buildos-agent` (installer handles this)
- [ ] SQLite file is on a backed-up volume; off-site `sqlite3 .backup` snapshot runs daily
- [ ] `NODE_ENV=production` set

---

## Troubleshooting

### Login or any `/api/*` returns 500

```bash
docker logs buildos_control_plane --tail 50
```

- `ECONNREFUSED http://localhost:8015/...` → backend container not running, or `BACKEND_INTERNAL_URL` is wrongly set to `localhost`. Inside the frontend container `localhost` is the frontend itself. Set `BACKEND_INTERNAL_URL=http://backend:8000` and `docker compose up -d backend`.
- `ENOTFOUND backend` → backend service isn't on the same Compose network. Verify both services in the same `docker-compose.yml`.

### Backend container exits immediately

```bash
docker logs buildos_backend --tail 50
```

- `FATAL: JWT_SECRET is using default value in production` → generate one: `echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env`
- `Cannot find package 'vite'` → outdated build. `server.ts` only loads Vite via dynamic import in non-production; pull latest.

### Agent shows `offline` after install

- Confirm the host can resolve and reach `MASTER_SERVER_URL` (firewall, DNS, Tailscale).
- `journalctl -u buildos-agent -e` — check for `4003 Unauthorized` (wrong token / node_id mismatch).
- Token typos are the #1 cause. Rotate from the dashboard if unsure.

### Login works but dashboard's fleet card is empty

- WS handshake may have failed. DevTools → Network → WS. Look for the `/api/ws/control-plane` connection w/ subprotocol `buildos.token.<JWT>`. If it 401s, your session expired — sign out and back in.

### Cloudflare token "cannot access this zone"

- You pasted an **Access Service Token** (`cfat_...`) — wrong type. That's for protecting apps behind Cloudflare Access.
- You need an **API Token** from *My Profile → API Tokens → Create Token → Edit zone DNS*, scoped to the specific zone(s).

### Reset everything

```bash
docker compose down
docker volume rm buildos-infra_buildos_data
docker compose up -d --build
```

Wipes SQLite (nodes, containers, logs, metrics, DNS mirror, system state, users). Default seed re-runs on next boot.

---

<div align="center">

**Built with caution. Operated with care. Crashed on purpose, occasionally.**

Issues + PRs welcome.

</div>

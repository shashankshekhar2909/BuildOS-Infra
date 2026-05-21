# Execution Plan — BuildOS Infra Implementation Roadmap

A step-by-step development strategy designed for a solo engineer to construct BuildOS Infra incrementally.

---

## Phase 1: Minimal Viable Control Plane (Local Master & UI Core)
- [x] Initialize SQLite database tables (`nodes`, `containers`, `system_logs`). Implemented via `node:sqlite` in `backend/src/database.ts`.
- [x] Express API routing (`/api/auth/login`, `/api/infra/nodes`, `/api/infra/containers`, `/api/infra/containers/:id/control`) w/ HS256 JWT + admin/viewer roles. Implementation chose **Express+tsx** over FastAPI for stack uniformity w/ Next frontend.
- [x] Next.js 15 frontend on port `4225`, proxies `/api/*` to backend service `http://backend:8000` via Compose network.
- [x] Docker Compose deployment for homelab (`docker-compose.yml`, `Dockerfile`, `Dockerfile.backend`).
- [ ] Real-time log terminal output (WS pipeline) — pending Phase 2.
- [ ] Cloudflare panels — pending Phase 3.

## Phase 2: Master-Agent Secure WebSocket Handshakes
- [x] Python remote agent daemon (`agent/main.py`) using `docker` SDK + `websockets`, w/ psutil telemetry, exp backoff + jitter reconnect, container allowlist gate.
- [x] Master WS routes (`backend/src/ws-hub.ts`): `/api/ws/agent/:node_id` (Bearer token verify against `secret_token_hash`), `/api/ws/control-plane` (JWT verify, browser uses `?token=`).
- [x] Bi-directional signaling: agent → HEARTBEAT (telemetry + container snapshot, upsert into `containers`, ping-update node), master → DOCKER_CONTROL (start/stop/restart), agent → CMD_RESPONSE.
- [x] Live UI fanout: `useControlPlaneWs` hook + `LiveFleetCard` on `/dashboard`. Shows CPU/RAM/disk + container counts per node in real time.
- [x] Agent install scaffolding: `install.sh`, `buildos-agent.service` systemd unit, `requirements.txt`, `config.example.env`.
- [ ] Replace SHA256 token hash w/ argon2id (security hardening).
- [ ] Replace `?token=` query-param WS auth for browser w/ Sec-WebSocket-Protocol subprotocol or HttpOnly cookie.

## Phase 3: Cloudflare Zero-Trust Integration
- [x] Cloudflare v4 wrapper (`backend/src/cloudflare.ts`) — Bearer token auth, zone-scoped DNS list/create/delete, typed error surface, graceful 503 when unconfigured.
- [x] REST routes wired: `GET /api/cloudflare/dns` (mirrors to `dns_records` table on read), `POST /api/cloudflare/dns` (admin + lockdown gate), `DELETE /api/cloudflare/dns/:id` (admin + lockdown gate).
- [x] `dns_records` SQLite table — local mirror so dashboard renders last-known state when CF unreachable.
- [x] UI `/domains` page — live table, add/delete form for admins, source badge (`cloudflare` vs `cache`), inline error banner.
- [x] WS broadcasts: `DNS_RECORD_CREATED`, `DNS_RECORD_DELETED` events fan out to all connected dashboards.
- [ ] Tunnel stats visualizer (CF `cfd_tunnel` metrics) — pending, depends on `cf_tunnels` table + tunnel-id selection UX.

## Phase 4 — Emergency Safeguards (started early; finished alongside Phase 3)
- [x] Persistent emergency state in `system_state` table (survives restart, audited via `updated_by`).
- [x] `POST /api/infra/emergency-kill` — requires `confirmed:true` + `auth_keyphrase:"FORCE KILL"`, admin only.
- [x] `POST /api/infra/emergency-reset` — admin only.
- [x] Lockdown gate (`rejectIfLocked`) on container control + DNS create/delete (HTTP 423 + standard error body).
- [x] UI `/emergency` page — two-phase Airlock (checkbox → keyphrase), live `LOCKED` badge from `/api/health`.
- [x] WS broadcasts: `EMERGENCY_LOCKDOWN`, `EMERGENCY_RELEASED` events.
- [x] Dispatch `EMERGENCY_BLOCK` WS frame to all agents on lock; `EMERGENCY_RELEASE` on reset. Agent honors lock (rejects DOCKER_CONTROL, optionally stops allowlisted containers via `EMERGENCY_STOP_ON_BLOCK=true`).
- [x] Argon2id token hashing (`@node-rs/argon2`) w/ per-row salt. SHA256 legacy hashes still verify via fallback (`verifyToken` detects `$argon2` prefix).
- [x] Browser WS auth via `Sec-WebSocket-Protocol: buildos.token.<jwt>` subprotocol. Query-param `?token=` removed for browser. Agent path still uses `Authorization: Bearer` header.

## Phase 4: Emergency Safeguards & Hardening
- [ ] Implement multi-step AirLock lockout confirmation parameters inside Web interface flows.
- [ ] Wire backend controllers to handle emergency command locks. On actuation, dispatches termination signals to agents, drops DNS records, and filters access.
- [ ] Conduct vulnerability reviews. Ensure all secrets are mapped in environment vaults rather than browser caches.

## Phase 5: AI Operations & Autonomic Optimization
- [x] Gemini diagnose endpoint `POST /api/gemini/diagnose` (requires auth). Server-side `@google/genai` w/ `gemini-2.5-flash` default model. System instruction enforces structured response (root cause + 3 actions + commands). Input cap 4000 chars; logs truncated to last 8 KB.
- [x] UI co-pilot panel (`src/components/copilot-panel.tsx`) on `/dashboard` w/ prompt + logs paste box.
- [x] Graceful 503 when `GEMINI_API_KEY` unset; `/api/health` reports `gemini:configured|unconfigured`.
- [x] Preset diagnostic query: "Diagnose last 50" button in log-stream card pipes recent events to Gemini.
- [x] Self-healing triggers: per-container `auto_heal` flag (admin toggle on `/containers` page) + 30s master sweep restarts containers in `exited|error|dead|restarting` w/ online agent, throttled to once per 60s per container. Skipped during emergency lockdown.

## Phase 6: Observability & Autonomic Healing
- [x] Live log stream: master broadcasts every `appendSystemLog` row to the control-plane WS as `LOG_EVENT`. UI `LogStreamCard` seeds from `GET /api/infra/logs?limit=100`, then live-tails via WS, capped at 200 in-memory rows.
- [x] `auto_heal` column on `containers` (additive migration via `ensureColumn`), `last_heal_attempt` timestamp for throttling.
- [x] `POST /api/infra/containers/:id/auto-heal { enabled: bool }` (admin).
- [x] Containers page rebuilt: live polling, start/stop/restart actions for admins, auto-heal toggle.
- [x] Per-container Docker log tail from agent. UI `ContainerLogTail` opens dedicated WS, sends `SUBSCRIBE_LOGS {node_id, container_id, container_name}` over control-plane, master forwards to agent, agent runs `container.logs(stream=True, follow=True, tail=20, timestamps=True)` in an executor task, streams `CONTAINER_LOG` frames back. Subscription is reference-counted on master so a single agent stream serves multiple watchers. Unsubscribe on UI close.
- [ ] Tunnel stats visualizer (Cloudflare `cfd_tunnel` metrics + `cf_tunnels` table).

## Phase 8: Metrics History & Token Rotation
- [x] `node_metrics` table (cpu_pct, ram_pct, disk_pct, indexed on `(node_id, timestamp DESC)`). Heartbeat handler in `ws-hub.ts` now persists one row per ping.
- [x] `GET /api/infra/nodes/:id/metrics?range=15m|1h|24h|7d` returns time-bounded rows.
- [x] Retention prune: hourly sweep drops rows older than 7d (`pruneMetrics`).
- [x] UI sparkline (`src/components/sparkline.tsx`) — pure inline SVG, no chart dep. `useNodeMetrics` hook polls every 15s. Mounted on each row of the live fleet card.
- [x] `POST /api/infra/nodes/:id/regenerate-token` (admin) — new argon2 hash, returns one-shot plaintext + ready-to-paste install command.
- [x] `/servers` row "rotate token" button surfaces the new token via the same success-card UI as registration.

## Phase 7: Operator UX & Live Logs
- [x] `/servers` page rebuilt: live polling of `/api/infra/nodes`, status badges, **Register new node** admin form. Success card displays one-shot `secure_token` + ready-to-paste install command (copy button).
- [x] `/containers` page: per-row "tail logs" toggle opens `ContainerLogTail` panel w/ live agent stdout.
- [x] Master WS hub accepts inbound browser frames (`SUBSCRIBE_LOGS`/`UNSUBSCRIBE_LOGS`), maintains per-client `logSubs` set, refcounts forwarding to agents, cleans up on disconnect.
- [x] Agent: on `SUBSCRIBE_LOGS`, starts asyncio task that reads docker log stream in executor; on `UNSUBSCRIBE_LOGS` (or disconnect), cancels task. Enforces `ALLOWED_CONTAINERS` allowlist on subscribe.

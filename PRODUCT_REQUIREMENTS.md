# Product Requirements Document (PRD) — BuildOS Infra

BuildOS Infra is a lightweight, high-performance, developer-centric operations control plane. It is designed to manage container workloads across multiple cloud virtual private servers (VPS) and homelab engines (e.g., Proxmox PVE, self-hosted Docker servers) without the heavy structural complexity of Kubernetes.

---

## 1. Objectives & Scope
- **Visibility**: Real-time health, resource telemetry, and event telemetry from scattered systems.
- **Unified Control**: Simple process management (Start/Stop/Restart) of Docker containers on remote hosts securely.
- **Edge Routing Verification**: Map public subdomains through Cloudflare Zero Trust Tunnels to local Docker runtime ports.
- **Fail-Safe Security**: Keep credentials server-side and facilitate a global lockdown "Emergency Kill-Switch" to safeguard infrastructure during breaches or high-latency cost events.
- **Extensibility**: Layout solid foundations for future autonomous AI operations, self-healing setups, and declarative deploy templates.

---

## 2. Core Functional Requirements

### 1. Unified Control Panel Dashboard
- **Node Overview**: Visual status cards showing host platform metrics (CPU load %, RAM usage, network identifiers, ping times) and hardware type categorization (VPS or local Homelab).
- **Docker Matrix**: Central listing of all containers on all active nodes. Must enable searching and filtering processes by tag, status, or node identity.
- **Remote Operations**: Direct control overrides to send signal interrupts (`SIGTERM`, `SIGKILL`, or `SIGHUP`) directly to container runtimes.

### 2. Edge Connectivity Maps
- **Tunnel Visibility**: Track uptime status, bandwidth utilization, active multiplexed connections, and performance of Cloudflare Tunnel endpoints.
- **DNS Sync Control**: Integrate directly with the Cloudflare DNS API (v4) to register, list, proxy, and prune zone files mapped dynamically to running containers.

### 3. Emergency Airlock Control
- **Safeguard Sequence**: A multi-step structured activation sequence (Confirm consequences checkbox -> Type keyphrase "FORCE KILL") to execute immediate container isolation and tunnel shutdown.
- **Fail-Safe Lockdown State**: Rejects all incoming actions while in lockdown. Allows a manual keys-present recover command when threats are resolved.

### 4. Real-Time Diagnostics & Copilot
- **Event Ledger**: Direct terminal stream of system logs, agent pings, DNS actions, and alert states.
- **AI Co-pilot**: Gemini-3.5-Flash integration to help SREs analyze active terminal alerts, draft Docker compose templates, map reverse-proxy properties, and suggest memory allocations.

---

## 3. Product Constraints & Exclusions
- **No Over-Abstraction**: This is not a scheduler replacement. We rely on Docker Compose and standard runtimes on the nodes.
- **Offline Resiliency**: Sub-systems must run fine locally if connection to the master is severed; agent states report accurately upon reconnection.
- **Storage Boundary**: Data structures keep standard relational bindings. Metrics telemetry is cached on clean sliding-window metrics ledgers rather than heavy time-series systems.

# System Architecture Design — BuildOS Infra

This document describes the high-level system components, security pipelines, and interaction models of the BuildOS Infra control plane.

```
                  +----------------------------------------------+
                  |            BUILDOS CENTRAL PLATFORM          |
                  |                                              |
                  |  +-----------------+    +-----------------+  |
                  |  |  React SPA      |    |  FastAPI        |  |
                  |  |  Dashboard UI   |<-->|  Master Backend |  |
                  |  +-----------------+    +-----------------+  |
                  |                                 ^            |
                  +---------------------------------|------------+
                                                    | (Auth HTTP + WebSockets / mutual TLS)
                             +----------------------+--------------------+
                             |                                           |
                             v                                           v
               +---------------------------+               +---------------------------+
               |      REMOTE VPS NODE      |               |     HOMELAB PVE CENTER    |
               |                           |               |                           |
               |  +---------------------+  |               |  +---------------------+  |
               |  | BuildOS Python Agent|  |               |  | BuildOS Python Agent|  |
               |  +---------------------+  |               |  +---------------------+  |
               |             |             |               |             |             |
               |             v             |               |             v             |
               |  +---------------------+  |               |  +---------------------+  |
               |  | Docker Engine API   |  |               |  | Docker API + PVE API|  |
               |  +---------------------+  |               |  +---------------------+  |
               |             |             |               |                           |
               |             v             |               |                           |
               |  +---------------------+  |               |                           |
               |  | Cloudflare Tunnel   |  |               |                           |
               |  +---------------------+  |               |                           |
               +---------------------------+               +---------------------------+
```

---

## 1. Core Architectural Components

### 1. BuildOS Control Panel (Web Interface)
- Single-page dashboard built using **React 19**, **Tailwind CSS**, or modern UI paradigms.
- Connects to the central backend using unified REST API contracts and secure real-time WebSockets.

### 2. Central Master Backend (FastAPI / Express Gateway)
- Secure central orchestrator. Maintains state machines for active agent links, pending jobs, and Cloudflare configuration pipelines.
- Coordinates critical fail-safes and coordinates real-time telemetry.
- Proxies AI queries to the server-side Gemini API pipeline.

### 3. BuildOS Remote Operation Agent
- Lightweight Python agent installed as a systemd background service on each remote host or VPS node.
- Runs without public host port exposures: establishes a persistent, secure WebSocket/TLS channel to the central master.
- Communicates directly with local hosts using the standard Docker SDK.

---

## 2. Communications & Topology Pipeline
- **Command Transmission**: Central dashboard triggers command -> FastAPI app validates auth -> sends message through established persistent WebSocket link to the specific agent -> agent executes command -> returns signal feedback -> logs update in the central database.
- **Telemetry Streaming**: Remote agent polls cpu, memory, and container variables periodically (2-5s) -> sends payloads to central queue -> updates database/Redis -> multiplexes to active web client sessions.

---

## 3. High-Availability & Self-Hosting
- **Containerization**: Packaged inside simple docker-compose configurations containing database dependency, API daemon, and local web app proxy.
- **Failover Handling**: If the database is disconnected, the control plane logs alerts to system files and operations run in secure read-only mode until connection is re-established.

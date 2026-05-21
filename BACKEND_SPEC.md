# Backend Specification — BuildOS Infra

The FastAPI master backend manages incoming web UI commands, processes security checks, communicates with active remote agent channels, proxy Cloudflare pipelines, and hosts the AI operational co-pilot endpoints.

---

## 1. REST API Controllers & Endpoints

### 1. Operations Nodes Endpoint
- **GET** `/api/infra/nodes`: List status schemas, provider configurations, and alive indicators of all core server nodes.
- **POST** `/api/infra/nodes/register`: Registers a fresh node profile and returns client security authentication credentials.

### 2. Containers Override Controllers
- **GET** `/api/infra/containers`: Queries global state values of all synced remote Docker containers.
- **POST** `/api/infra/containers/{id}/control`: Dispatches operational commands to change state machines.
  - Body payload: `{ "action": "start" | "stop" | "restart" }`
  - Safeguard Check: Must reject if emergency lockout parameters are active.

### 3. DNS Integration Services
- **POST** `/api/cloudflare/dns`: Calls Cloudflare v4 backend API wrapper to register target DNS subdomain parameters securely.
- **DELETE** `/api/cloudflare/dns/{id}`: Drops mapped subdomain bindings immediately.

### 4. Emergency Lockdowns
- **POST** `/api/infra/emergency-kill`: Actuates global airlock safety procedures immediately. Stops VPS containers and suspends tunneled pipelines.
- **POST** `/api/infra/emergency-reset`: Normalizes system structures and releases operational isolation locks.

---

## 2. Real-Time Telemetry Pipeline (WebSockets)
- Path: `/api/ws/control-plane`
- Client Web UI connects securely; backend registers connections and streams updates of active nodes and container states.
- Remote agents register path: `/api/ws/agent/{node_id}` using secure authorization tokens in authorization headers. Undergoes authorization, checks IP, and opens persistent bi-directional connection.

---

## 3. Server-side Gemini API Co-pilot
- Endpoint: `/api/gemini/diagnose`
- Integrates the modern `@google/genai` TypeScript SDK.
- Payload parameters:
  - `prompt`: String query context
  - `logs`: Diagnostic stream context
- Secure configuration guidelines: Always keep the API token environment variable (`GEMINI_API_KEY`) secured server-side. Never send or expose it in Web DOM features.

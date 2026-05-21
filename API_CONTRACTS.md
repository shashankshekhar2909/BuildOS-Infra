# API Contracts & Protocols — BuildOS Infra

This document defines the interface specifications (REST and WebSockets) between the BuildOS Frontend Panel, the Central Control Plane Master Backend, and the Remote Daemon Agents.

---

## 1. Server Management API

### 1.1 Register Node
Configure a fresh VPS or Homelab server, creating its profile on the master backend.
- **Method**: `POST`
- **Path**: `/api/infra/nodes/register`
- **Request Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <ADMIN_JWT_TOKEN>
  ```
- **Request Body**:
  ```json
  {
    "name": "vps-nyc-primary",
    "type": "VPS",
    "provider": "DigitalOcean",
    "ip_address": "159.203.4.12",
    "region": "us-east"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "node_id": "node_vps_3ac29d",
    "secure_token": "bs_agent_tkn_81a7b4fbcde312891d84920a103",
    "download_installer_cmd": "curl -sSL https://get.buildos.io/install.sh | bash -s -- --token bs_agent_tkn_81a7b4fbcde312891d84920a103 --master https://master.buildos.io"
  }
  ```

### 1.2 Query Active Nodes List
Retrieves a list of all nodes, their deployment contexts, and live heartbeat status indicators.
- **Method**: `GET`
- **Path**: `/api/infra/nodes`
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "node_vps_3ac29d",
      "name": "vps-nyc-primary",
      "type": "VPS",
      "provider": "DigitalOcean",
      "ip_address": "159.203.4.12",
      "region": "us-east",
      "status": "online",
      "agent_version": "v1.2.4",
      "last_ping": "2026-05-21T05:42:01Z"
    }
  ]
  ```

---

## 2. Container Management API

### 2.1 Retrieve Containers Grid
List synced container configurations polled across active host systems.
- **Method**: `GET`
- **Path**: `/api/infra/containers`
- **Params**:
  - `node_id` (optional): String indicator to filter by target host server.
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "c_nginx_proxy_01",
      "node_id": "node_vps_3ac29d",
      "name": "nginx-proxy",
      "image": "nginx:alpine",
      "state": "running",
      "status_text": "Up 4 days",
      "ports_map": "80:80, 443:443",
      "exposed_domain": "buildos.dev",
      "cf_tunnel_configured": true
    }
  ]
  ```

### 2.2 Container Command Override (Control Signals)
Deploy command overrides to stop, start, or restart container instances.
- **Method**: `POST`
- **Path**: `/api/infra/containers/{id}/control`
- **Request Body**:
  ```json
  {
    "action": "restart" 
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "container_id": "c_nginx_proxy_01",
    "updated_state": "restarting",
    "message": "Sigterm reload transaction queued on agent 'node_vps_3ac29d'."
  }
  ```
- **Error Response (`400 Bad Request` — e.g., during active Emergency lockdowns)**:
  ```json
  {
    "error": "Operation Rejected: Global Emergency Kill switch active on control plane."
  }
  ```

---

## 3. Realtime Events & WebSockets Pipeline

### 3.1 Web UI Subscription Socket
The visual control panel connects base links to ingest stream notifications.
- **URL**: `wss://master.buildos.io/api/ws/control-plane?token=<USER_JWT_TOKEN>`

#### Master Broadcast Event: Telemetry Payload
```json
{
  "event_type": "TELEMETRY_BROADCAST",
  "timestamp": "2026-05-21T05:42:43Z",
  "data": {
    "node_id": "node_vps_3ac29d",
    "cpu_usage": 12.4,
    "ram_usage": 32.1,
    "containers_running": 12,
    "containers_total": 14
  }
}
```

#### Master Broadcast Event: Logs & Alerts
```json
{
  "event_type": "LOG_BROADCAST",
  "data": {
    "log_type": "warning",
    "source": "homelab-pve-01",
    "message": "High RAM utilization: 88% memory threshold warning breached."
  }
}
```

### 3.2 Host Agent Handshake Socket
Persistent outbound socket opened by each daemon client back to controller coordinates.
- **URL**: `wss://master.buildos.io/api/ws/agent/<NODE_ID>`
- **Authentication Headers**:
  ```http
  Authorization: Bearer <SECURE_AGENT_TOKEN>
  ```

#### Agent Telemetry Feed Push (Interval: 3s)
```json
{
  "action": "HEARTBEAT",
  "timestamp": "2026-05-21T05:43:00Z",
  "payload": {
    "cpu_metrics": 14.8,
    "ram_metrics": 41.2,
    "containers": [
      {
        "id": "c_7a12bc",
        "name": "home-assistant",
        "image": "homeassistant:stable",
        "state": "running",
        "status": "Up 6 days"
      }
    ]
  }
}
```

#### Master Command Callback Over Sockets
```json
{
  "action": "EXECUTE_CONTAINER_SIGNAL",
  "transaction_id": "tx_8192a7bcd",
  "payload": {
    "container_name": "home-assistant",
    "signal": "stop"
  }
}
```

---

## 4. Emergency Actions API

### 4.1 Trigger Core Lockdown
Execute immediate container isolation, drop active sessions, and detach public network proxies.
- **Method**: `POST`
- **Path**: `/api/infra/emergency-kill`
- **Request Body**:
  ```json
  {
    "confirmed": true,
    "auth_keyphrase": "FORCE KILL"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "all_nodes_isolated": true,
    "locked_at": "2026-05-21T05:43:02Z",
    "system_status": "LOCKEDDOWN_ISOLATED"
  }
  ```

### 4.2 Reset Lockdown State
De-activate emergency airlocks and reconnect daemon callback processing limits.
- **Method**: `POST`
- **Path**: `/api/infra/emergency-reset`
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "system_status": "NOMINAL",
    "recovered_at": "2026-05-21T05:43:10Z"
  }
  ```

---

## 5. Cloudflare Integration API

### 5.1 List Synchronized Zone Records
List configured DNS parameters on associated Cloudflare active domains.
- **Method**: `GET`
- **Path**: `/api/cloudflare/dns`
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "dns_01",
      "zone_name": "buildos.dev",
      "subdomain": "api.buildos.dev",
      "record_type": "CNAME",
      "content": "cf-tunnel-prod-02.cfargotunnel.com",
      "proxied": true,
      "ttl": "Auto"
    }
  ]
  ```

### 5.2 Configure New CNAME Routing Record
Directly calls Cloudflare v4 REST API handlers to register target subdomain maps.
- **Method**: `POST`
- **Path**: `/api/cloudflare/dns`
- **Request Body**:
  ```json
  {
    "zone_name": "buildos.dev",
    "subdomain": "portal-api.buildos.dev",
    "record_type": "CNAME",
    "content": "cf-tunnel-prod-01.cfargotunnel.com",
    "proxied": true
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "record_id": "cf_dns_rec_19a2b38ac",
    "synced_dns": "portal-api.buildos.dev"
  }
  ```

### 5.3 Remove DNS Record
- **Method**: `DELETE`
- **Path**: `/api/cloudflare/dns/{id}`
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "removed_id": "cf_dns_rec_19a2b38ac"
  }
  ```

---

## 6. Health & Telemetry Metrics API

### 6.1 Node Metrics Query
Read detailed historical resource charts of processor logs, network input/outputs, and RAM indexes.
- **Method**: `GET`
- **Path**: `/api/infra/nodes/{id}/metrics`
- **Params**:
  - `range`: String selection (e.g., `1h`, `24h`, `7d`)
- **Response (`200 OK`)**:
  ```json
  {
    "node_id": "node_vps_3ac29d",
    "data_points": [
      {
        "timestamp": "2026-05-21T05:30:00Z",
        "cpu_avg": 12.1,
        "ram_avg": 32.0,
        "network_in_mbps": 4.12,
        "network_out_mbps": 11.24
      },
      {
        "timestamp": "2026-05-21T05:40:00Z",
        "cpu_avg": 14.8,
        "ram_avg": 32.1,
        "network_in_mbps": 4.88,
        "network_out_mbps": 12.01
      }
    ]
  }
  ```

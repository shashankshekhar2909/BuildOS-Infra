# Remote Agent Communication Model & Protocols — BuildOS Infra

This spec defines the operational design for the persistent WebSocket communication pipeline between remote node agents and the central Master control plane backend.

---

## 1. Top-Level Design: Persistent Egress-Only Connection
To prevent exposing remote nodes to the public internet, BuildOS Infra relies on an **Egress-Only Callback Topology**:
- No ports (neither SSH nor Docker sockets) are opened for inbound traffic on remote nodes.
- Instead, the remote agent initiates a persistent outbound **WebSocket Secure (WSS)** connection back to the public-facing BuildOS Central Master instance.
- This creates an optimal dual-channel tunnel capable of bidirectional control, bypassing carrier-grade NATs, residential firewalls, or Cloudflare filters securely.

---

## 2. Secure Authentication Handshake
1. **Dynamic Registration Phase**:
   - Registering a new node on the web panel returns an installation token:
     `SECURE_AGENT_TOKEN="bs_agent_tkn_..."`
2. **Websocket Authorization Challenge**:
   - The agent establishes a connection to the master on endpoint `wss://master.buildos.io/api/ws/agent/{node_id}`.
   - Credentials are verified via **Authorization Headers** using static Bearer Tokens or short-lived cryptographic hash signatures.
   - **Handshake Validation Flow**:
     - Remote client sends WSS request carrying the signature.
     - Master server validates the signature matching stored node secrets in database tables.
     - Connection accepted -> connection promoted to standard bidirectional transport. Connection rejected -> connection terminated instantly with secure `4003 Unauthorized` Close frames.

---

## 3. Persistent Heartbeat & Real-Time Metrics Pipeline
To guarantee connection freshness and live host monitoring, the agent runs a persistent loop every **5 seconds**:
- **Ping Message**: The agent pushes a telemetry frame enclosing memory state, processor load, and Docker status structures.

### Heartbeat Telemetry Payload Schema
```json
{
  "action": "HEARTBEAT",
  "client_time": "2026-05-21T05:43:00Z",
  "payload": {
    "telemetry": {
      "cpu_pct": 14.8,
      "ram_pct": 38.2,
      "disk_pct": 52.4
    },
    "containers": [
      {
        "id": "7a12bc9fe3",
        "name": "api-backend",
        "image": "sunnyrocks/buildos-api:v1.0.2",
        "state": "running",
        "status": "Up 2 days",
        "ports": "8000:8000"
      },
      {
        "id": "cf102bd3ea",
        "name": "postgres-db",
        "image": "postgres:16-alpine",
        "state": "running",
        "status": "Up 12 days",
        "ports": "127.0.0.1:5432:5432"
      }
    ]
  }
}
```

---

## 4. Command Execution Pipeline & Docker SDK Operations
When an operator issues start, stop, or reboot instructions in the dashboard:
1. The master validates that the control plane **Emergency-kill** state is configured as `FALSE`.
2. Master formats a command transaction and writes it to the respective agent's persistent WebSocket frame:
   ```json
   {
     "action": "DOCKER_CONTROL",
     "transaction_id": "tx_req_9a2b3c",
     "target_container": "api-backend",
     "signal": "restart"
   }
   ```
3. The remote Python agent receives the frame and processes the target against the local Docker Daemon API via the official Python Docker SDK:
   ```python
   # Inside remote agent executor loop
   import docker

   client = docker.from_env()
   try:
       container = client.containers.get(cmd_payload["target_container"])
       if cmd_payload["signal"] == "start":
           container.start()
       elif cmd_payload["signal"] == "stop":
           container.stop()
       elif cmd_payload["signal"] == "restart":
           container.restart()
           
       # Return success report 
       send_websocket_response({
           "action": "CMD_RESPONSE",
           "transaction_id": cmd_payload["transaction_id"],
           "status": "success",
           "message": f"Successfully completed signal: {cmd_payload['signal']}"
       })
   except Exception as e:
       # Return error details safely
       send_websocket_response({
           "action": "CMD_RESPONSE",
           "transaction_id": cmd_payload["transaction_id"],
           "status": "failed",
           "message": str(e)
       })
   ```

---

## 5. Offline Detection & Graceful Reconnect Handling
- **Agent Resilience**:
  - The Python agent includes an exponential system backoff reconnect loops: if connection to Master fails or drops, the agent sleeps for `1s`, then attempts reconnection. In repeated failures, it backs off progressively to limit flooding overheads (`1s`, `2s`, `4s`, `8s`, up to a maximum interval of `30s`).
  - Native container applications running on the hosts continue processing without disruption if Master-agent coordination is temporarily severed.
- **Master Offline Detection**:
  - The Master maintains a database TTL check on agent activity. If no ping, metrics, or heartbeat payload is received for `15 seconds`, the master updates the host cluster status class from `online` to `offline` inside state registers and alerts dashboard sessions.

---

## 6. Emergency Lockdown Handling (AirLock Actuation)
If a critical condition occurs and the global **Emergency Kill-Switch** is actuated on the web panel:
1. The master immediately publishes an **EMERGENCY BLOCK** signal across all WebSocket channels.
2. The agent interprets the payload frame and initiates an offline isolate configuration:
   - Terminates running Docker containers using rapid termination profiles.
   - De-activates public domain tunnel proxies to close access routes completely.
   - Transitions into passive lockdown mode (rejects subsequent non-reboot operational commands until safe state reset tokens are validated).

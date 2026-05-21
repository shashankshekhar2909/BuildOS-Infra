# Remote Agent Specification — BuildOS Infra Agent

The BuildOS Infra Agent is a ultra-lightweight daemon deployed on VPS and local homelab hardware Nodes. It establishes persistent connections back to the central Master instance and manages Docker container commands securely.

---

## 2. Software Architecture & Runtime Environment
- **Runtime**: Python 3.9+ environment wrapper.
- **Key Modules**:
  - `docker` (Official Docker SDK for Python)
  - `websockets` (Async bi-directional communication)
  - `psutil` (Host resource telemetry metrics extraction)
  - `asyncio` (Non-blocking loop engine)

---

## 3. Remote Operations Workflow
1. **Bootstrap Initialization**:
   - Reads secure credentials file `/etc/buildos-agent/config.env` holding `MASTER_SERVER_URL` and `SECURE_AGENT_TOKEN`.
   - On runtime boot, tries connecting to websocket node: `wss://{MASTER_URL}/api/ws/agent/{node_id}` with headers:
     `Authorization: Bearer {SECURE_AGENT_TOKEN}`
2. **Telemetry Heartbeat Loop (Cron-interval: 3s)**:
   - Aggregates system metrics using `psutil`:
     ```python
     cpu = psutil.cpu_percent(interval=1)
     ram = psutil.virtual_memory().percent
     ```
   - Queries docker runtime list using Docker SDK parameters:
     ```python
     containers = docker_client.containers.list(all=True)
     ```
   - Packs metadata payloads and dispatches back to the central Master queue over the active web-connection.
3. **Execution Pipeline / Command Listener**:
   - Awaits incoming commands (`start`, `stop`, `restart`) from the websocket connection.
   - On message payload receipt:
     - Dispatches command targets directly against docker API client.
     - Handles errors robustly; returns callback outputs securely with trace details if processes fail.

---

## 4. Host Deploys Systemd Template
To run as a secure, persistent daemon on standard Debian, Arch Linux, or RedHat base structures:

```ini
[Unit]
Description=BuildOS Operations Agent Daemon
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/buildos-agent
ExecStart=/opt/buildos-agent/venv/bin/python main.py
Restart=always
RestartSec=5
EnvironmentFile=/etc/buildos-agent/config.env

[Install]
WantedBy=multi-user.target
```

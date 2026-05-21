# Ideal Monorepo Structure — BuildOS Infra

A highly structured, production-ready monorepo layout designed for a solo engineer to maintain high coordination across the control plane components.

---

## 1. Monorepo Directory Tree

```
buildos-infra/
├── .env.example                 # Global development environment outline
├── docker-compose.yml           # Local multi-node test simulation & master compose
├── README.md                    # Core developer onboarding guide
│
├── frontend/                    # Web Control Panel Dashboard
│   ├── public/                  # Public web assets & launchers
│   ├── src/
│   │   ├── components/          # Extracted visual UI components
│   │   ├── hooks/               # Custom React state modules (useWebSocket, useNodes, etc)
│   │   ├── types/               # Local UI types mapping (mirrored from shared scope)
│   │   ├── lib/                 # Utility helpers (cn, formatters)
│   │   ├── App.tsx              # Application layout root
│   │   └── main.tsx             # SPA entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                     # Central SRE Gateway (Master Orchestrator)
│   ├── src/
│   │   ├── api/                 # Endpoint controllers (nodes.py, containers.py, dns.py)
│   │   ├── core/                # Configuration management, database drivers & safety checks
│   │   ├── models/              # SQLAlchemy / SQLModel database schema definitions
│   │   ├── services/            # Custom API wrappers (cloudflare_service.py, ai_copilot.py)
│   │   └── main.py              # FastAPI application bootstrap & persistent WS layer
│   ├── tests/                   # Core endpoint unit test suites
│   ├── Dockerfile
│   ├── requirements.txt
│   └── pyproject.toml
│
├── agent/                       # Remote Node Daemon (Docker SDK Runner)
│   ├── src/
│   │   ├── system_metrics.py     # psutil resource utilization scrapers
│   │   ├── docker_control.py    # Local Docker SDK wrapper processes
│   │   └── main.py              # Persistent websocket client & handler loop
│   ├── config.example.env       # Local agent credentials template
│   ├── install.sh               # On-node bootstrap deployment script
│   ├── buildos-agent.service    # Systemd daemon config template
│   ├── Dockerfile               # Sandbox/Testing container deployment spec
│   └── requirements.txt
│
├── infra/                       # Declarative Deployment & Server Provisioning Configurations
│   ├── terraform/               # Cloud VM provisioning scripts (Hetzner/DigitalOcean)
│   ├── ansible/                 # Node hardening, Docker setup & Agent daemon installation playbooks
│   └── cloudflare/              # Terraform definitions for CF tunnels & initial zone configurations
│
├── docker/                      # Production Deployment Dockerfiles
│   ├── backend.prod.Dockerfile
│   ├── frontend.prod.Dockerfile
│   └── nginx.conf               # Edge reverse proxy matching container routing specifications
│
├── scripts/                     # Operational & CI/CD developer automation helpers
│   ├── setup_dev.sh             # Configures local virtual environments and pre-commit keys
│   ├── sync_cloudflare_rules.sh # Emergency domain cutoff utility script
│   └── backup_db.sh             # Automated cron catalog script for database volumes
│
├── context/                     # Context-driven configuration profiles
│   ├── dev_nodes.json           # Mock configuration setups for offline developer sandboxes
│   └── alerts_matrix.json       # Configured health monitor thresholds (e.g., CPU, RAM limits)
│
└── prompts/                     # Dynamic Operational Prompt templates (Copilot guidance)
    ├── system_diagnose.txt      # Prompts the AI SRE to analyze terminal alerts logs
    ├── docker_compose_draft.txt # Guides the AI Co-pilot to generate optimal production compose scripts
    └── secure_mTLS_guide.txt    # Instructional prompt template on mutual trust certificate handshakes
```

---

## 2. Shared Types Strategy
- Since the backend runs in Python (FastAPI/SQLAlchemy) and the frontend is a TypeScript SPA, we implement a **Single Source of Truth** for type declarations.
- **Workflow**: 
  - Define data transfer objects (DTOs) as standard Pydantic models inside `backend/src/models/dto.py`.
  - Use `typescript-generator` utilities or scripts (e.g., `pydantic-to-typescript`) in CI/CD pipeline inside `scripts/generate_types.sh` to compile type definitions into TypeScript contracts.
  - Output files are automatically written directly into `frontend/src/types/shared.ts` before staging.

---

## 3. Service Boundaries & API Design
- **Single Responsibility**: The **Agent** never directly communicates with the database or external services like Cloudflare. It is strictly an executor of local docker socket commands.
- **Pull over Push (WebSockets)**: The Agent establishes connections *outbound* back to the Master APIs. This enables remote nodes to remain behind NATs, firewalls, or Cloudflare tunnels without requiring open host port rules.
- **Database Safety**: Only the **Master Backend** holds read-write permissions over state tables. System logs write non-blocking logs via an event bus to preserve execution speeds.

---

## 4. Environment Variable Strategy

### Master Backend (`backend/.env`)
```bash
MASTER_SECRET_KEY="high-entropy-signature-signing-key"
DATABASE_URL="postgresql://postgres:pass@coredb:5432/buildos"
CLOUDFLARE_API_KEY="server-side-only-global-cf-secret"
CLOUDFLARE_ZONE_ID="cloudflare-target-domain-zone-id"
GEMINI_API_KEY="google-ai-studio-gemini-credentials"
EMERGENCY_LOCKDOWN_STATUS="FALSE"
```

### Remote Agent Node (`/etc/buildos-agent/config.env`)
```bash
MASTER_SERVER_URL="wss://master.buildos.io/api/ws/agent"
SECURE_AGENT_TOKEN="unique-high-entropy-host-verification-token"
TELEMETRY_INTERVAL_SECONDS=3
DOCKER_HOST="unix:///var/run/docker.sock"
```

---

## 5. Docker Compose Architecture

This compose file boots the parent Master platform, local dashboard, database clusters, and a simulated mock container agent system on a single docker host for isolated offline development.

```yaml
version: "3.8"

services:
  master-db:
    image: postgres:16-alpine
    container_name: buildos_db
    environment:
      POSTGRES_DB: buildos
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: securepasswd
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - buildos-private

  redis-telemetry:
    image: redis:7-alpine
    container_name: buildos_redis_telemetry
    networks:
      - buildos-private

  control-plane-backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: buildos_api_master
    environment:
      - DATABASE_URL=postgresql://admin:securepasswd@master-db:5432/buildos
      - REDIS_URL=redis://redis-telemetry:6379/0
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    ports:
      - "8000:8000"
    depends_on:
      - master-db
      - redis-telemetry
    networks:
      - buildos-private

  control-plane-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: buildos_web_panel
    ports:
      - "3000:3000"
    depends_on:
      - control-plane-backend
    networks:
      - buildos-private

networks:
  buildos-private:
    driver: bridge

volumes:
  pgdata:
```

---

## 6. Real-World Deployment Strategy

1. **Control Plane Master Platform**:
   - Packaged and deployed on a small managed server (e.g., Hetzner cloud or basic AWS Lightsail VM) via Docker Compose.
   - Fronted by an Nginx Edge Proxy handling TLS certificates. Ports other than HTTPS (443) and WebSockets (8000/ws) are isolated by system firewall configurations.

2. **On-Node Remote Agent Installation**:
   - Deployed on VPS or Homelab targets using our simple bootstrap script:
     `curl -sSL https://get.buildos.io/install.sh | bash -s -- --token YOUR_SECURE_AGENT_TOKEN --master https://master.buildos.io`
   - The installer installs Python requirements, auto-discovers local `/var/run/docker.sock`, bundles the program files inside `/opt/buildos-agent`, registers a persistent `buildos-agent.service` systemd service, and forces a system boot reload.

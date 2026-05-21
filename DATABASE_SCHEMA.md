# Database Schema Specification — BuildOS Infra

BuildOS Infra uses a clean relational database schema (designed for PostgreSQL or SQLite backend drivers). It ensures quick state tracking, telemetry audit trails, and security associations.

---

## 1. Database Schema Specifications

### `nodes` Entity
Tracks physical hosts and clustered virtualization hosts.
```sql
CREATE TABLE nodes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    type VARCHAR(64) NOT NULL, -- 'VPS' | 'HOMELAB' | 'PROXMOX'
    provider VARCHAR(128) NOT NULL, -- 'DigitalOcean' | 'Hetzner' | 'AWS' | 'Self-Hosted'
    ip_address VARCHAR(45) NOT NULL,
    region VARCHAR(100) NOT NULL,
    status VARCHAR(32) DEFAULT 'offline', -- 'online' | 'isolated' | 'offline'
    agent_version VARCHAR(32) NOT NULL,
    secret_token_hash VARCHAR(256) NOT NULL, -- Authenticates remote agent callback
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### `containers` Entity
Stores container profiles polled by agent daemon systems.
```sql
CREATE TABLE containers (
    id VARCHAR(128) PRIMARY KEY, -- Docker remote SHA or custom unique ID
    node_id VARCHAR(64) REFERENCES nodes(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    image VARCHAR(256) NOT NULL,
    state VARCHAR(32) NOT NULL, -- 'running' | 'stopped' | 'restarting' | 'error'
    status_text VARCHAR(128),     -- e.g., 'Up 4 days'
    ports_map VARCHAR(256),       -- e.g., '80:80, 443:443'
    cpu_limit VARCHAR(32),
    mem_limit VARCHAR(32),
    exposed_domain VARCHAR(256),  -- Mapping to host edge domain
    cf_tunnel_configured BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### `dns_records` Entity
Tracks registered DNS zone profiles synced with remote Cloudflare.
```sql
CREATE TABLE dns_records (
    id VARCHAR(64) PRIMARY KEY,
    zone_name VARCHAR(128) NOT NULL, -- e.g., 'buildos.dev'
    subdomain VARCHAR(128) NOT NULL, -- e.g., 'app.buildos.dev'
    record_type VARCHAR(16) NOT NULL, -- 'CNAME' | 'A' | 'TXT'
    target_content TEXT NOT NULL,      -- e.g., 'cf-tunnel-prod.cfargotunnel.com'
    proxied BOOLEAN DEFAULT TRUE,
    ttl VARCHAR(32) DEFAULT 'Auto',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### `cf_tunnels` Entity
Maintains metadata regarding active Cloudflare Tunnels mapped securely from remote hosts.
```sql
CREATE TABLE cf_tunnels (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    node_id VARCHAR(64) REFERENCES nodes(id) ON DELETE CASCADE,
    status VARCHAR(32) DEFAULT 'inactive', -- 'healthy' | 'inactive' | 'degraded'
    active_connections INT DEFAULT 0,
    data_transferred_gb NUMERIC(10, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### `system_logs` Entity
Centralized event ledger auditing remote commands, alerts, and heartbeat logs.
```sql
CREATE TABLE system_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    log_type VARCHAR(16) NOT NULL, -- 'info' | 'warning' | 'error' | 'critical'
    source VARCHAR(128) NOT NULL,  -- e.g., 'prod-vps-sg-01', 'CLOUDFLARE_ENGINE'
    message TEXT NOT NULL
);
```

---

## 2. In-Memory Redis Telemetry Structures
Telemetry data (live CPU metrics, memory logs) should bypass heavy disk storage.
Suggest using sliding-window keys in Redis:
- Key: `telemetry:node:{node_id}`
- Type: `Sorted Set (ZSET)` using Unix epoch millisecond as score.
- Telemetry Value Format: `{"cpu": 14.2, "ram": 42.1, "timestamp": 1729384812}`
- Cleanup: Maintain automated sliding window (prune values score older than 1 hour).

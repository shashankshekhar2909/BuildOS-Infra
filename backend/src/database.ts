import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { hashSync as argon2HashSync, verifySync as argon2VerifySync, Algorithm } from "@node-rs/argon2";
import { config } from "./config.js";

export type NodeRow = {
  id: string;
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
  status: string;
  agent_version: string;
  last_ping: string;
  created_at: string;
};

export type ContainerRow = {
  id: string;
  node_id: string;
  name: string;
  image: string;
  state: string;
  status_text: string | null;
  ports_map: string | null;
  cpu_limit: string | null;
  mem_limit: string | null;
  exposed_domain: string | null;
  cf_tunnel_configured: number;
  auto_heal: number;
  last_heal_attempt: string | null;
  updated_at: string;
};

function ensureDatabaseDirectory(databasePath: string): void {
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });
}

const databaseFile = path.resolve(config.databasePath);
ensureDatabaseDirectory(databaseFile);

export const db = new DatabaseSync(databaseFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    region TEXT NOT NULL,
    status TEXT DEFAULT 'offline',
    agent_version TEXT NOT NULL,
    secret_token_hash TEXT NOT NULL,
    last_ping TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS containers (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    state TEXT NOT NULL,
    status_text TEXT,
    ports_map TEXT,
    cpu_limit TEXT,
    mem_limit TEXT,
    exposed_domain TEXT,
    cf_tunnel_configured INTEGER DEFAULT 0,
    auto_heal INTEGER DEFAULT 0,
    last_heal_attempt TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    log_type TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dns_records (
    id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    proxied INTEGER DEFAULT 1,
    ttl INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cloudflare_zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO system_state (key, value) VALUES ('emergency_lockdown', 'FALSE');

  CREATE TABLE IF NOT EXISTS node_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    cpu_pct REAL NOT NULL,
    ram_pct REAL NOT NULL,
    disk_pct REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_node_metrics_node_time
    ON node_metrics (node_id, timestamp DESC);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Lightweight column migrations for older DBs.
function ensureColumn(table: string, column: string, ddl: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((r) => r.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("containers", "auto_heal", "auto_heal INTEGER DEFAULT 0");
ensureColumn("containers", "last_heal_attempt", "last_heal_attempt TEXT");
ensureColumn("nodes", "parent_node_id", "parent_node_id TEXT");
ensureColumn("system_logs", "actor", "actor TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS pve_guests (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    vmid INTEGER NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    cpu_pct REAL DEFAULT 0,
    mem_pct REAL DEFAULT 0,
    disk_pct REAL DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    has_buildos_agent INTEGER DEFAULT 0,
    child_node_id TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (node_id, vmid, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_pve_guests_node ON pve_guests (node_id);
`);

const countNodesStatement = db.prepare("SELECT COUNT(*) AS count FROM nodes");
const insertNodeStatement = db.prepare(`
  INSERT INTO nodes (
    id, name, type, provider, ip_address, region, status, agent_version, secret_token_hash, last_ping
  ) VALUES (
    @id, @name, @type, @provider, @ip_address, @region, @status, @agent_version, @secret_token_hash, @last_ping
  )
`);
const updateNodeStatement = db.prepare(`
  UPDATE nodes
  SET name = @name,
      type = @type,
      provider = @provider,
      ip_address = @ip_address,
      region = @region
  WHERE id = @id
`);
const deleteNodeStatement = db.prepare(`DELETE FROM nodes WHERE id = ?`);
const insertContainerStatement = db.prepare(`
  INSERT INTO containers (
    id, node_id, name, image, state, status_text, ports_map, cpu_limit, mem_limit, exposed_domain, cf_tunnel_configured
  ) VALUES (
    @id, @node_id, @name, @image, @state, @status_text, @ports_map, @cpu_limit, @mem_limit, @exposed_domain, @cf_tunnel_configured
  )
`);
const insertLogStatement = db.prepare(`
  INSERT INTO system_logs (timestamp, log_type, source, message, actor)
  VALUES (@timestamp, @log_type, @source, @message, @actor)
`);
const countCloudflareZonesStatement = db.prepare("SELECT COUNT(*) AS count FROM cloudflare_zones");
const insertCloudflareZoneStatement = db.prepare(`
  INSERT INTO cloudflare_zones (id, name)
  VALUES (@id, @name)
`);

const ARGON2_OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

function hashToken(token: string): string {
  return argon2HashSync(token, ARGON2_OPTS);
}

export function hashPassword(password: string): string {
  return argon2HashSync(password, ARGON2_OPTS);
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith("$argon2")) return false;
  try {
    return argon2VerifySync(stored, plain);
  } catch {
    return false;
  }
}

function legacySha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyToken(plainToken: string, storedHash: string): boolean {
  if (storedHash.startsWith("$argon2")) {
    try {
      return argon2VerifySync(storedHash, plainToken);
    } catch {
      return false;
    }
  }
  // Legacy SHA256 fallback — timing-safe compare.
  const expected = Buffer.from(legacySha256(plainToken));
  const actual = Buffer.from(storedHash);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function seedDatabase(): void {
  const row = countNodesStatement.get() as { count: number };
  if (row.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  insertNodeStatement.run({
    id: "node_vps_3ac29d",
    name: "vps-nyc-primary",
    type: "VPS",
    provider: "DigitalOcean",
    ip_address: "159.203.4.12",
    region: "us-east",
    status: "online",
    agent_version: config.defaultAgentVersion,
    secret_token_hash: hashToken("seed-node-token-1"),
    last_ping: now
  });

  insertNodeStatement.run({
    id: "node_homelab_92b4de",
    name: "homelab-pve-01",
    type: "HOMELAB",
    provider: "Self-Hosted",
    ip_address: "192.168.1.150",
    region: "home-office",
    status: "online",
    agent_version: config.defaultAgentVersion,
    secret_token_hash: hashToken("seed-node-token-2"),
    last_ping: now
  });

  insertContainerStatement.run({
    id: "c_nginx_proxy_01",
    node_id: "node_vps_3ac29d",
    name: "nginx-proxy",
    image: "nginx:alpine",
    state: "running",
    status_text: "Up 4 days",
    ports_map: "80:80, 443:443",
    cpu_limit: null,
    mem_limit: null,
    exposed_domain: "buildos.dev",
    cf_tunnel_configured: 0
  });

  insertContainerStatement.run({
    id: "c_buildos_api_01",
    node_id: "node_vps_3ac29d",
    name: "buildos-api",
    image: "buildos/api:phase1",
    state: "running",
    status_text: "Up 12 hours",
    ports_map: "3000:3000",
    cpu_limit: null,
    mem_limit: null,
    exposed_domain: null,
    cf_tunnel_configured: 0
  });

  insertContainerStatement.run({
    id: "c_home_assistant_01",
    node_id: "node_homelab_92b4de",
    name: "home-assistant",
    image: "homeassistant/home-assistant:stable",
    state: "running",
    status_text: "Up 6 days",
    ports_map: "8123:8123",
    cpu_limit: null,
    mem_limit: null,
    exposed_domain: null,
    cf_tunnel_configured: 0
  });

  insertLogStatement.run({
    timestamp: now,
    log_type: "info",
    source: "CONTROL_PLANE",
    message: "Phase 1 database bootstrap completed.",
    actor: null
  });
}

if (process.env.SKIP_DEMO_SEED !== "true") {
  seedDatabase();
}

function seedCloudflareZones(): void {
  const row = countCloudflareZonesStatement.get() as { count: number };
  if (row.count > 0) return;

  for (const zone of config.cloudflareZones) {
    insertCloudflareZoneStatement.run(zone);
  }
}

seedCloudflareZones();

export function createSecureAgentToken(): { plainToken: string; tokenHash: string } {
  const plainToken = `bs_agent_tkn_${crypto.randomBytes(20).toString("hex")}`;
  return {
    plainToken,
    tokenHash: hashToken(plainToken)
  };
}

export function generateNodeId(type: string): string {
  return `node_${type.toLowerCase()}_${crypto.randomBytes(3).toString("hex")}`;
}

export function listNodes(): NodeRow[] {
  return db
    .prepare(`
      SELECT id, name, type, provider, ip_address, region, status, agent_version, last_ping, created_at
      FROM nodes
      ORDER BY created_at DESC
    `)
    .all() as NodeRow[];
}

export function insertNode(input: {
  id: string;
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
  agent_version: string;
  secret_token_hash: string;
}): void {
  insertNodeStatement.run({
    ...input,
    status: "offline",
    last_ping: new Date().toISOString()
  });
}

export function updateNode(input: {
  id: string;
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
}): boolean {
  const result = updateNodeStatement.run(input);
  return Number(result.changes ?? 0) > 0;
}

export function deleteNode(id: string): boolean {
  const result = deleteNodeStatement.run(id);
  return Number(result.changes ?? 0) > 0;
}

const CONTAINER_COLS = `
  id, node_id, name, image, state, status_text, ports_map, cpu_limit, mem_limit,
  exposed_domain, cf_tunnel_configured, auto_heal, last_heal_attempt, updated_at
`;

export function listContainers(nodeId?: string): ContainerRow[] {
  const baseQuery = `SELECT ${CONTAINER_COLS} FROM containers`;
  if (nodeId) {
    return db
      .prepare(`${baseQuery} WHERE node_id = ? ORDER BY updated_at DESC`)
      .all(nodeId) as ContainerRow[];
  }
  return db.prepare(`${baseQuery} ORDER BY updated_at DESC`).all() as ContainerRow[];
}

export function findContainer(id: string): ContainerRow | undefined {
  return db
    .prepare(`SELECT ${CONTAINER_COLS} FROM containers WHERE id = ?`)
    .get(id) as ContainerRow | undefined;
}

export function setContainerAutoHeal(id: string, enabled: boolean): void {
  db.prepare(`UPDATE containers SET auto_heal = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
}

export function markHealAttempt(id: string): void {
  db.prepare(`UPDATE containers SET last_heal_attempt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function listHealCandidates(): ContainerRow[] {
  return db
    .prepare(`
      SELECT ${CONTAINER_COLS} FROM containers c
      WHERE c.auto_heal = 1
        AND c.state IN ('exited', 'error', 'dead', 'restarting')
        AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = c.node_id AND n.status = 'online')
        AND (c.last_heal_attempt IS NULL OR c.last_heal_attempt < datetime('now','-60 seconds'))
    `)
    .all() as ContainerRow[];
}

export type SystemLogRow = {
  id: number;
  timestamp: string;
  log_type: string;
  source: string;
  message: string;
  actor: string | null;
};

export type MetricsRow = {
  timestamp: string;
  cpu_pct: number;
  ram_pct: number;
  disk_pct: number;
};

const insertMetricStatement = db.prepare(`
  INSERT INTO node_metrics (node_id, timestamp, cpu_pct, ram_pct, disk_pct)
  VALUES (@node_id, @timestamp, @cpu_pct, @ram_pct, @disk_pct)
`);

export function recordNodeMetric(input: {
  node_id: string;
  cpu_pct: number;
  ram_pct: number;
  disk_pct: number;
}): void {
  insertMetricStatement.run({
    ...input,
    timestamp: new Date().toISOString()
  });
}

export function listNodeMetrics(nodeId: string, sinceIso: string): MetricsRow[] {
  return db
    .prepare(`
      SELECT timestamp, cpu_pct, ram_pct, disk_pct
      FROM node_metrics
      WHERE node_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `)
    .all(nodeId, sinceIso) as MetricsRow[];
}

export function pruneMetrics(olderThanIso: string): number {
  const result = db
    .prepare(`DELETE FROM node_metrics WHERE timestamp < ?`)
    .run(olderThanIso);
  return Number(result.changes ?? 0);
}

export type PveGuestRow = {
  id: string;
  node_id: string;
  vmid: number;
  kind: string;
  name: string;
  state: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  uptime_seconds: number;
  has_buildos_agent: number;
  child_node_id: string | null;
  updated_at: string;
};

const upsertPveGuestStmt = db.prepare(`
  INSERT INTO pve_guests (
    id, node_id, vmid, kind, name, state, cpu_pct, mem_pct, disk_pct, uptime_seconds, updated_at
  ) VALUES (
    @id, @node_id, @vmid, @kind, @name, @state, @cpu_pct, @mem_pct, @disk_pct, @uptime_seconds, CURRENT_TIMESTAMP
  )
  ON CONFLICT(node_id, vmid, kind) DO UPDATE SET
    name = excluded.name,
    state = excluded.state,
    cpu_pct = excluded.cpu_pct,
    mem_pct = excluded.mem_pct,
    disk_pct = excluded.disk_pct,
    uptime_seconds = excluded.uptime_seconds,
    updated_at = CURRENT_TIMESTAMP
`);

export function upsertPveGuest(input: {
  node_id: string;
  vmid: number;
  kind: string;
  name: string;
  state: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  uptime_seconds: number;
}): void {
  upsertPveGuestStmt.run({
    ...input,
    id: `${input.node_id}__${input.kind}_${input.vmid}`
  });
}

export function reconcileMissingPveGuests(
  nodeId: string,
  present: Array<{ vmid: number; kind: string }>
): number {
  if (present.length === 0) {
    const r = db
      .prepare(`UPDATE pve_guests SET state = 'missing' WHERE node_id = ? AND state != 'missing'`)
      .run(nodeId);
    return Number(r.changes ?? 0);
  }
  const ids = present.map((p) => `${nodeId}__${p.kind}_${p.vmid}`);
  const placeholders = ids.map(() => "?").join(",");
  const r = db
    .prepare(
      `UPDATE pve_guests SET state = 'missing'
       WHERE node_id = ? AND state != 'missing' AND id NOT IN (${placeholders})`
    )
    .run(nodeId, ...ids);
  return Number(r.changes ?? 0);
}

export function listPveGuests(nodeId?: string): PveGuestRow[] {
  if (nodeId) {
    return db
      .prepare(`SELECT * FROM pve_guests WHERE node_id = ? ORDER BY vmid ASC`)
      .all(nodeId) as PveGuestRow[];
  }
  return db
    .prepare(`SELECT * FROM pve_guests ORDER BY node_id ASC, vmid ASC`)
    .all() as PveGuestRow[];
}

export function findPveGuest(
  nodeId: string,
  kind: string,
  vmid: number
): PveGuestRow | undefined {
  return db
    .prepare(`SELECT * FROM pve_guests WHERE node_id = ? AND kind = ? AND vmid = ?`)
    .get(nodeId, kind, vmid) as PveGuestRow | undefined;
}

export function rotateNodeToken(id: string): { plainToken: string } | null {
  const node = db.prepare(`SELECT id FROM nodes WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!node) return null;
  const { plainToken, tokenHash } = createSecureAgentToken();
  db.prepare(`UPDATE nodes SET secret_token_hash = ? WHERE id = ?`).run(tokenHash, id);
  return { plainToken };
}

export function listRecentLogs(limit = 200): SystemLogRow[] {
  return db
    .prepare(
      `SELECT id, timestamp, log_type, source, message, actor FROM system_logs ORDER BY id DESC LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 500)) as SystemLogRow[];
}

export function updateContainerState(id: string, state: string, statusText: string): void {
  db.prepare(`
    UPDATE containers
    SET state = ?, status_text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(state, statusText, id);
}

export function findNodeById(id: string): (NodeRow & { secret_token_hash: string }) | undefined {
  return db
    .prepare(`
      SELECT id, name, type, provider, ip_address, region, status, agent_version, last_ping, created_at, secret_token_hash
      FROM nodes
      WHERE id = ?
    `)
    .get(id) as (NodeRow & { secret_token_hash: string }) | undefined;
}

export function updateNodeStatus(id: string, status: string): void {
  db.prepare(`UPDATE nodes SET status = ? WHERE id = ?`).run(status, id);
}

export function updateNodePing(id: string, status: string): void {
  db.prepare(`UPDATE nodes SET status = ?, last_ping = CURRENT_TIMESTAMP WHERE id = ?`).run(
    status,
    id
  );
}

export function reconcileMissingContainers(nodeId: string, presentIds: string[]): number {
  if (presentIds.length === 0) {
    const result = db
      .prepare(`UPDATE containers SET state = 'missing' WHERE node_id = ? AND state != 'missing'`)
      .run(nodeId);
    return Number(result.changes ?? 0);
  }
  const placeholders = presentIds.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE containers SET state = 'missing'
       WHERE node_id = ? AND state != 'missing' AND id NOT IN (${placeholders})`
    )
    .run(nodeId, ...presentIds);
  return Number(result.changes ?? 0);
}

export function upsertContainerFromAgent(input: {
  id: string;
  node_id: string;
  name: string;
  image: string;
  state: string;
  status_text: string | null;
  ports_map: string | null;
}): void {
  db.prepare(`
    INSERT INTO containers (id, node_id, name, image, state, status_text, ports_map, cf_tunnel_configured)
    VALUES (@id, @node_id, @name, @image, @state, @status_text, @ports_map, 0)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      image = excluded.image,
      state = excluded.state,
      status_text = excluded.status_text,
      ports_map = excluded.ports_map,
      updated_at = CURRENT_TIMESTAMP
  `).run(input);
}

export type DnsRecordRow = {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxied: number;
  ttl: number;
  updated_at: string;
};

export type CloudflareZoneRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export function listCloudflareZones(): CloudflareZoneRow[] {
  return db
    .prepare(`SELECT id, name, created_at, updated_at FROM cloudflare_zones ORDER BY name ASC`)
    .all() as CloudflareZoneRow[];
}

export function upsertCloudflareZone(input: { id: string; name: string }): void {
  db.prepare(`
    INSERT INTO cloudflare_zones (id, name)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = CURRENT_TIMESTAMP
  `).run(input.id, input.name);
}

export function deleteCloudflareZone(id: string): void {
  db.prepare(`DELETE FROM cloudflare_zones WHERE id = ?`).run(id);
}

export function findCloudflareZone(id: string): CloudflareZoneRow | undefined {
  return db
    .prepare(`SELECT id, name, created_at, updated_at FROM cloudflare_zones WHERE id = ?`)
    .get(id) as CloudflareZoneRow | undefined;
}

export function listDnsRecords(zoneId?: string): DnsRecordRow[] {
  if (zoneId) {
    return db
      .prepare(`SELECT * FROM dns_records WHERE zone_id = ? ORDER BY updated_at DESC`)
      .all(zoneId) as DnsRecordRow[];
  }
  return db
    .prepare(`SELECT * FROM dns_records ORDER BY updated_at DESC`)
    .all() as DnsRecordRow[];
}

export function findDnsRecord(id: string): DnsRecordRow | undefined {
  return db
    .prepare(`SELECT * FROM dns_records WHERE id = ?`)
    .get(id) as DnsRecordRow | undefined;
}

export function upsertDnsRecord(input: Omit<DnsRecordRow, "updated_at">): void {
  db.prepare(`
    INSERT INTO dns_records (id, zone_id, zone_name, name, type, content, proxied, ttl)
    VALUES (@id, @zone_id, @zone_name, @name, @type, @content, @proxied, @ttl)
    ON CONFLICT(id) DO UPDATE SET
      zone_id = excluded.zone_id,
      zone_name = excluded.zone_name,
      name = excluded.name,
      type = excluded.type,
      content = excluded.content,
      proxied = excluded.proxied,
      ttl = excluded.ttl,
      updated_at = CURRENT_TIMESTAMP
  `).run(input);
}

export function deleteDnsRecord(id: string): void {
  db.prepare(`DELETE FROM dns_records WHERE id = ?`).run(id);
}

export function getSystemState(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM system_state WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSystemState(key: string, value: string, updatedBy: string): void {
  db.prepare(`
    INSERT INTO system_state (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, value, updatedBy);
}

export function isEmergencyLocked(): boolean {
  return getSystemState("emergency_lockdown") === "TRUE";
}

type LogListener = (row: SystemLogRow) => void;
const logListeners = new Set<LogListener>();

export function onSystemLog(listener: LogListener): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

export function appendSystemLog(
  logType: string,
  source: string,
  message: string,
  actor: string | null = null
): void {
  const timestamp = new Date().toISOString();
  const result = insertLogStatement.run({
    timestamp,
    log_type: logType,
    source,
    message,
    actor
  });
  const id = Number(result.lastInsertRowid);
  for (const listener of logListeners) {
    try {
      listener({ id, timestamp, log_type: logType, source, message, actor });
    } catch {
      // ignore listener errors
    }
  }
}

// --- User management ---

export type UserRow = {
  id: number;
  username: string;
  role: "admin" | "viewer";
  created_at: string;
  updated_at: string;
};

export type UserWithHash = UserRow & { password_hash: string };

const insertUserStmt = db.prepare(`
  INSERT INTO users (username, role, password_hash) VALUES (?, ?, ?)
`);

const updatePasswordStmt = db.prepare(`
  UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const updateRoleStmt = db.prepare(`
  UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const deleteUserStmt = db.prepare(`DELETE FROM users WHERE id = ?`);

export function listUsers(): UserRow[] {
  return db
    .prepare(`SELECT id, username, role, created_at, updated_at FROM users ORDER BY id ASC`)
    .all() as UserRow[];
}

export function findUserByUsername(username: string): UserWithHash | undefined {
  return db
    .prepare(
      `SELECT id, username, role, password_hash, created_at, updated_at FROM users WHERE username = ?`
    )
    .get(username) as UserWithHash | undefined;
}

export function findUserById(id: number): UserWithHash | undefined {
  return db
    .prepare(
      `SELECT id, username, role, password_hash, created_at, updated_at FROM users WHERE id = ?`
    )
    .get(id) as UserWithHash | undefined;
}

export function createUser(input: {
  username: string;
  role: "admin" | "viewer";
  password: string;
}): UserRow {
  const result = insertUserStmt.run(input.username, input.role, hashPassword(input.password));
  const id = Number(result.lastInsertRowid);
  const row = findUserById(id);
  if (!row) throw new Error("User insert failed");
  // Strip hash before returning.
  const { password_hash: _ph, ...rest } = row;
  void _ph;
  return rest;
}

export function changePassword(userId: number, newPassword: string): void {
  updatePasswordStmt.run(hashPassword(newPassword), userId);
}

export function changeRole(userId: number, role: "admin" | "viewer"): void {
  updateRoleStmt.run(role, userId);
}

export function deleteUser(id: number): void {
  deleteUserStmt.run(id);
}

export function countAdmins(): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`).get() as {
    count: number;
  };
  return row.count;
}

function bootstrapUsers(): void {
  const total = (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number })
    .count;
  if (total > 0) return;

  // Seed first admin + viewer from env so existing access keeps working.
  insertUserStmt.run(
    config.adminUsername,
    "admin",
    hashPassword(config.adminPassword)
  );
  insertUserStmt.run(
    config.viewerUsername,
    "viewer",
    hashPassword(config.viewerPassword)
  );
}

bootstrapUsers();

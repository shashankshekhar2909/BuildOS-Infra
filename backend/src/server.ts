import http from "http";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { issueAuthToken, requireAuth, requireRole, verifyCredentials } from "./auth.js";
import {
  appendSystemLog,
  changePassword,
  changeUsername,
  changeRole,
  countAdmins,
  createUser,
  createSecureAgentToken,
  deleteUser,
  findUserById,
  findUserByUsername,
  listUsers,
  verifyPassword,
  deleteDnsRecord as deleteDnsRecordRow,
  deleteNode,
  findContainer,
  findDnsRecord,
  findNodeById,
  generateNodeId,
  getSystemState,
  insertNode,
  isEmergencyLocked,
  listContainers,
  listDnsRecords as listDnsRecordsRows,
  findPveGuest,
  listHealCandidates,
  listNodeMetrics,
  listNodes,
  listPveGuests,
  listRecentLogs,
  markHealAttempt,
  onSystemLog,
  pruneMetrics,
  rotateNodeToken,
  setContainerAutoHeal,
  setSystemState,
  updateContainerState,
  updateNode,
  upsertCloudflareZone,
  upsertDnsRecord
} from "./database.js";
import {
  cloudflareConfigured,
  createDnsRecord as cfCreateDns,
  deleteDnsRecord as cfDeleteDns,
  getCloudflareZone as cfGetZone,
  isCloudflareError,
  listCloudflareZones as cfListCloudflareZones,
  listDnsRecords as cfListDns,
  resolveCloudflareZone
} from "./cloudflare.js";
import { diagnose as geminiDiagnose, geminiConfigured, isGeminiError } from "./gemini.js";
import {
  attachWsServer,
  broadcastToAgents,
  broadcastToControlPlane,
  isAgentOnline,
  sendToAgent
} from "./ws-hub.js";

const app = express();
const rootDir = process.cwd();

// Behind exactly one proxy (Cloudflare Tunnel / Caddy / Nginx). Make req.ip honor
// X-Forwarded-For. CF sets CF-Connecting-IP, which we prefer where available.
app.set("trust proxy", 1);

// Security headers. CSP is conservative; relax if you embed third-party iframes.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"], // Next.js inline hydration scripts
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'", "wss:", "https:"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false, // breaks some asset loads behind CF Tunnel
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

app.use(express.json({ limit: "1mb" }));

function clientIp(req: import("express").Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  return req.ip ?? "unknown";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildInstallerCommand(input: {
  token: string;
  nodeId: string;
  masterUrl: string;
  ipAddress: string;
}): string {
  return [
    `ping -c 1 ${shellQuote(input.ipAddress)} || true`,
    `curl -sSL https://get.buildos.io/install.sh | bash -s -- --token ${shellQuote(input.token)} --node-id ${shellQuote(input.nodeId)} --master ${shellQuote(input.masterUrl)}`
  ].join(" && ");
}

function buildSshInstallerCommand(input: {
  token: string;
  nodeId: string;
  masterUrl: string;
  ipAddress: string;
}): string {
  const remoteInstall = `curl -sSL https://get.buildos.io/install.sh | bash -s -- --token ${shellQuote(input.token)} --node-id ${shellQuote(input.nodeId)} --master ${shellQuote(input.masterUrl)}`;
  return `ping -c 1 ${shellQuote(input.ipAddress)} || true && ssh ${shellQuote(`root@${input.ipAddress}`)} ${shellQuote(remoteInstall)}`;
}

// Public liveness probe — minimal surface for uptime checks.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Authenticated, richer view used by the dashboard.
app.get("/api/status", requireAuth, (_req, res) => {
  res.json({
    status: "ok",
    phase: "phase-8",
    database: "sqlite",
    cloudflare: cloudflareConfigured() ? "configured" : "unconfigured",
    gemini: geminiConfigured() ? "configured" : "unconfigured",
    emergency_lockdown: getSystemState("emergency_lockdown") === "TRUE"
  });
});

app.get("/api/cloudflare/zones", requireAuth, (_req, res) => {
  res.json({
    configured: cloudflareConfigured(),
    zones: cfListCloudflareZones()
  });
});

app.get("/api/cloudflare/zones/:id/check", requireAuth, async (req, res) => {
  try {
    const zone = await cfGetZone(req.params.id);
    res.json({ success: true, zone });
  } catch (e) {
    if (isCloudflareError(e)) {
      const message =
        e.status === 401 || e.status === 403
          ? "Cloudflare token cannot access this zone. Use a token scoped to the zone or add this zone to the token permissions."
          : e.message;
      res.status(e.status).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Cloudflare zone check failed" });
  }
});

app.post("/api/cloudflare/zones", requireRole("admin"), (req, res) => {
  const { id, name } = req.body ?? {};
  if (typeof id !== "string" || typeof name !== "string") {
    res.status(400).json({ error: "id and name are required strings" });
    return;
  }
  upsertCloudflareZone({ id, name });
  appendSystemLog(
    "info",
    "CLOUDFLARE_ENGINE",
    `Cloudflare zone saved: ${name} (${id}).`,
    (res.locals.auth as { sub: string }).sub
  );
  res.status(201).json({ success: true, zones: cfListCloudflareZones() });
});

function rejectIfLocked(res: import("express").Response): boolean {
  if (isEmergencyLocked()) {
    res.status(423).json({
      error: "Operation Rejected: Global Emergency Kill switch active on control plane."
    });
    return true;
  }
  return false;
}

// --- Login rate limiter (in-memory, per-IP, 5 fails / 15 min).
type RateBucket = { fails: number; lockedUntil: number };
const loginBuckets = new Map<string, RateBucket>();
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginKey(req: import("express").Request): string {
  return clientIp(req);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of loginBuckets) {
    if (b.lockedUntil < now && b.fails === 0) loginBuckets.delete(k);
  }
}, 60_000).unref();

app.post("/api/auth/login", (req, res) => {
  const key = loginKey(req);
  const bucket = loginBuckets.get(key) ?? { fails: 0, lockedUntil: 0 };
  if (bucket.lockedUntil > Date.now()) {
    const retryAfterSec = Math.ceil((bucket.lockedUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ error: `Too many attempts. Retry in ${retryAfterSec}s.` });
    return;
  }

  const { username, password, role } = req.body ?? {};

  if ((role !== "admin" && role !== "viewer") || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "role, username, and password are required" });
    return;
  }

  const verified = verifyCredentials(role, username, password);
  if (!verified) {
    bucket.fails += 1;
    if (bucket.fails >= LOGIN_MAX_FAILS) {
      bucket.lockedUntil = Date.now() + LOGIN_WINDOW_MS;
      bucket.fails = 0;
      appendSystemLog("warning", "AUTH", `Login lockout for ${key} (${LOGIN_WINDOW_MS / 60000}m).`);
    }
    loginBuckets.set(key, bucket);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  loginBuckets.delete(key);

  // DB role wins over requested role.
  const actualRole = verified.role;
  const token = issueAuthToken({ username, role: actualRole });
  appendSystemLog("info", "AUTH", `User '${username}' logged in (${actualRole}).`, username);
  res.json({
    success: true,
    token,
    token_type: "Bearer",
    expires_in: config.jwtExpiresInSeconds,
    user: {
      id: username,
      name: actualRole === "admin" ? "BuildOS Admin" : "BuildOS Viewer",
      email: `${username}@buildos.local`,
      role: actualRole,
      roles: [actualRole]
    }
  });
});

// --- User management routes (mounted before /api/infra requireAuth so we keep
// our own requireAuth on each handler). ---

app.get("/api/auth/me", requireAuth, (_req, res) => {
  const auth = res.locals.auth as { sub: string; role: string };
  const user = findUserByUsername(auth.sub);
  if (!user) {
    res.status(404).json({ error: "Session user no longer exists" });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at
  });
});

app.get("/api/users", requireRole("admin"), (_req, res) => {
  res.json(listUsers());
});

app.post("/api/users", requireRole("admin"), (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    (role !== "admin" && role !== "viewer")
  ) {
    res.status(400).json({ error: "username, password, role(admin|viewer) required" });
    return;
  }
  if (username.length < 3 || username.length > 64) {
    res.status(400).json({ error: "username must be 3-64 chars" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "password must be >=8 chars" });
    return;
  }
  if (findUserByUsername(username)) {
    res.status(409).json({ error: "username already exists" });
    return;
  }
  const actor = (res.locals.auth as { sub: string }).sub;
  const created = createUser({ username, password, role });
  appendSystemLog("info", "AUTH", `User '${username}' (${role}) created by ${actor}.`, actor);
  res.status(201).json(created);
});

app.patch("/api/users/:id/role", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const role = req.body?.role;
  if (!Number.isFinite(id) || (role !== "admin" && role !== "viewer")) {
    res.status(400).json({ error: "id + role required" });
    return;
  }
  const user = findUserById(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.role === "admin" && role === "viewer" && countAdmins() <= 1) {
    res.status(400).json({ error: "Cannot demote the last admin." });
    return;
  }
  const actor = (res.locals.auth as { sub: string }).sub;
  changeRole(id, role);
  appendSystemLog("warning", "AUTH", `User '${user.username}' role -> ${role} by ${actor}.`, actor);
  res.json({ success: true });
});

app.patch("/api/users/:id/password", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { current_password, new_password } = req.body ?? {};
  if (!Number.isFinite(id) || typeof new_password !== "string" || new_password.length < 8) {
    res.status(400).json({ error: "new_password (>=8 chars) required" });
    return;
  }
  const target = findUserById(id);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const auth = res.locals.auth as { sub: string; role: string };
  const isSelf = auth.sub === target.username;
  if (!isSelf && auth.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Self-change is allowed with just the session token. If current_password is
  // provided, keep accepting it for compatibility, but do not require it.
  if (isSelf && typeof current_password === "string" && current_password.length > 0) {
    const me = findUserByUsername(auth.sub);
    if (!me || !verifyPassword(current_password, me.password_hash)) {
      res.status(401).json({ error: "Current password incorrect" });
      return;
    }
  }
  changePassword(id, new_password);
  appendSystemLog("warning", "AUTH", `Password changed for '${target.username}' by ${auth.sub}.`, auth.sub);
  res.json({ success: true });
});

app.patch("/api/users/:id/username", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { username } = req.body ?? {};
  if (!Number.isFinite(id) || typeof username !== "string") {
    res.status(400).json({ error: "username required" });
    return;
  }
  const nextUsername = username.trim();
  if (nextUsername.length < 3 || nextUsername.length > 64) {
    res.status(400).json({ error: "username must be 3-64 chars" });
    return;
  }
  const target = findUserById(id);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const auth = res.locals.auth as { sub: string; role: string };
  const isSelf = auth.sub === target.username;
  if (!isSelf && auth.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = findUserByUsername(nextUsername);
  if (existing && existing.id !== id) {
    res.status(409).json({ error: "username already exists" });
    return;
  }
  if (target.username === nextUsername) {
    res.json({ success: true });
    return;
  }
  changeUsername(id, nextUsername);
  appendSystemLog(
    "warning",
    "AUTH",
    `Username changed '${target.username}' -> '${nextUsername}' by ${auth.sub}.`,
    auth.sub
  );
  if (isSelf) {
    const role = auth.role === "admin" || auth.role === "viewer" ? auth.role : target.role;
    const token = issueAuthToken({ username: nextUsername, role: role as "admin" | "viewer" });
    res.json({
      success: true,
      token,
      token_type: "Bearer",
      expires_in: config.jwtExpiresInSeconds,
      user: {
        id: nextUsername,
        name: role === "admin" ? "BuildOS Admin" : "BuildOS Viewer",
        email: `${nextUsername}@buildos.local`,
        role,
        roles: [role]
      }
    });
    return;
  }
  res.json({ success: true });
});

app.delete("/api/users/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const target = findUserById(id);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const auth = res.locals.auth as { sub: string };
  if (target.username === auth.sub) {
    res.status(400).json({ error: "Cannot delete yourself." });
    return;
  }
  if (target.role === "admin" && countAdmins() <= 1) {
    res.status(400).json({ error: "Cannot delete the last admin." });
    return;
  }
  deleteUser(id);
  appendSystemLog("warning", "AUTH", `User '${target.username}' deleted by ${auth.sub}.`, auth.sub);
  res.json({ success: true });
});

app.use("/api/infra", requireAuth);

app.get("/api/infra/nodes", (_req, res) => {
  res.json(listNodes());
});

app.post("/api/infra/nodes/register", requireRole("admin"), (req, res) => {
  const { name, type, provider, ip_address, region } = req.body ?? {};

  if (
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof provider !== "string" ||
    typeof ip_address !== "string" ||
    typeof region !== "string"
  ) {
    res.status(400).json({ error: "name, type, provider, ip_address, and region are required" });
    return;
  }

  const nodeId = generateNodeId(type);
  const { plainToken, tokenHash } = createSecureAgentToken();

  try {
    insertNode({
      id: nodeId,
      name,
      type,
      provider,
      ip_address,
      region,
      agent_version: config.defaultAgentVersion,
      secret_token_hash: tokenHash
    });
  } catch (error) {
    res.status(409).json({ error: "Node registration failed. Name may already exist." });
    return;
  }

  const actor = (res.locals.auth as { sub: string }).sub;
  appendSystemLog("info", name, `Node '${name}' registered with id '${nodeId}'.`, actor);

  const masterUrl = config.appUrl.replace(/\/$/, "");
  res.status(201).json({
    success: true,
    node_id: nodeId,
    secure_token: plainToken,
    download_installer_cmd: buildInstallerCommand({
      token: plainToken,
      nodeId,
      masterUrl,
      ipAddress: ip_address
    }),
    ssh_installer_cmd: buildSshInstallerCommand({
      token: plainToken,
      nodeId,
      masterUrl,
      ipAddress: ip_address
    })
  });
});

app.patch("/api/infra/nodes/:id", requireRole("admin"), (req, res) => {
  const { name, type, provider, ip_address, region } = req.body ?? {};

  if (
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof provider !== "string" ||
    typeof ip_address !== "string" ||
    typeof region !== "string"
  ) {
    res.status(400).json({ error: "name, type, provider, ip_address, and region are required" });
    return;
  }

  const existing = findNodeById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Node not found" });
    return;
  }

  updateNode({
    id: req.params.id,
    name,
    type,
    provider,
    ip_address,
    region
  });

  appendSystemLog(
    "info",
    name,
    `Node '${req.params.id}' updated.`,
    (res.locals.auth as { sub: string }).sub
  );
  res.json({ success: true, node_id: req.params.id });
});

app.delete("/api/infra/nodes/:id", requireRole("admin"), (req, res) => {
  const existing = findNodeById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Node not found" });
    return;
  }

  deleteNode(req.params.id);
  appendSystemLog(
    "info",
    existing.name,
    `Node '${existing.name}' deleted.`,
    (res.locals.auth as { sub: string }).sub
  );
  res.json({ success: true, node_id: req.params.id });
});

app.get("/api/infra/containers", (req, res) => {
  const nodeId = typeof req.query.node_id === "string" ? req.query.node_id : undefined;
  res.json(listContainers(nodeId));
});

app.post("/api/infra/containers/:id/control", requireRole("admin"), (req, res) => {
  if (rejectIfLocked(res)) return;
  const { action } = req.body ?? {};
  if (action !== "start" && action !== "stop" && action !== "restart") {
    res.status(400).json({ error: "action must be one of: start, stop, restart" });
    return;
  }

  const container = findContainer(req.params.id);
  if (!container) {
    res.status(404).json({ error: "Container not found" });
    return;
  }

  // Only write optimistic state when the agent is reachable. Otherwise we leave
  // the row alone so reconcile/heartbeat can correct it.
  if (!isAgentOnline(container.node_id)) {
    res.status(503).json({
      error: `Agent '${container.node_id}' is offline; cannot dispatch.`
    });
    return;
  }

  let updatedState = container.state;
  let statusText = container.status_text ?? "";

  if (action === "start") {
    updatedState = "running";
    statusText = "Start transaction queued.";
  } else if (action === "stop") {
    updatedState = "stopped";
    statusText = "Stop transaction queued.";
  } else {
    updatedState = "restarting";
    statusText = "Restart transaction queued.";
  }

  updateContainerState(container.id, updatedState, statusText);
  appendSystemLog(
    "info",
    container.node_id,
    `Container '${container.name}' received '${action}' control signal.`,
    (res.locals.auth as { sub: string }).sub
  );

  const transactionId = `tx_${Date.now().toString(36)}`;
  const dispatched = sendToAgent(container.node_id, {
    action: "DOCKER_CONTROL",
    transaction_id: transactionId,
    target_container: container.name,
    signal: action
  });

  res.json({
    success: true,
    container_id: container.id,
    updated_state: updatedState,
    transaction_id: transactionId,
    agent_dispatched: dispatched,
    agent_online: isAgentOnline(container.node_id),
    message: dispatched
      ? `Signal '${action}' dispatched to agent '${container.node_id}'.`
      : `Agent '${container.node_id}' offline; state updated optimistically.`
  });
});

app.get("/api/cloudflare/dns", requireAuth, async (req, res) => {
  const zoneId = typeof req.query.zone_id === "string" ? req.query.zone_id : undefined;
  const zone = resolveCloudflareZone(zoneId);

  if (!zone) {
    res.json({
      source: "cache",
      configured: false,
      zones: cfListCloudflareZones(),
      records: listDnsRecordsRows()
    });
    return;
  }
  try {
    const live = await cfListDns(zone.id);
    for (const r of live) {
      upsertDnsRecord({
        id: r.id,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        name: r.name,
        type: r.type,
        content: r.content,
        proxied: r.proxied ? 1 : 0,
        ttl: r.ttl
      });
    }
    res.json({
      source: "cloudflare",
      configured: true,
      zones: cfListCloudflareZones(),
      active_zone: zone,
      records: listDnsRecordsRows(zone.id)
    });
  } catch (e) {
    if (isCloudflareError(e)) {
      appendSystemLog("error", "CLOUDFLARE_ENGINE", `List DNS failed: ${e.message}`);
      const message =
        e.status === 401 || e.status === 403
          ? "Cloudflare token cannot access this zone. Use a token scoped to this zone or add this zone to the token permissions."
          : e.message;
      res.status(e.status).json({
        error: message,
        zones: cfListCloudflareZones(),
        fallback: listDnsRecordsRows(zone.id)
      });
      return;
    }
    res.status(500).json({ error: "Cloudflare list failed" });
  }
});

app.post("/api/cloudflare/dns", requireRole("admin"), async (req, res) => {
  if (rejectIfLocked(res)) return;
  const { zone_id, name, type, content, proxied, ttl } = req.body ?? {};
  if (typeof name !== "string" || typeof type !== "string" || typeof content !== "string") {
    res.status(400).json({ error: "name, type, content are required strings" });
    return;
  }
  const zone = resolveCloudflareZone(typeof zone_id === "string" ? zone_id : undefined);
  if (!zone) {
    res.status(503).json({ error: "Cloudflare not configured" });
    return;
  }
  try {
    const created = await cfCreateDns({
      zoneId: zone.id,
      name,
      type,
      content,
      proxied: typeof proxied === "boolean" ? proxied : true,
      ttl: typeof ttl === "number" ? ttl : 1
    });
    upsertDnsRecord({
      id: created.id,
      zone_id: created.zone_id,
      zone_name: created.zone_name,
      name: created.name,
      type: created.type,
      content: created.content,
      proxied: created.proxied ? 1 : 0,
      ttl: created.ttl
    });
    appendSystemLog(
      "info",
      "CLOUDFLARE_ENGINE",
      `DNS record created: ${created.name} (${created.type})`,
      (res.locals.auth as { sub: string }).sub
    );
    broadcastToControlPlane({ event_type: "DNS_RECORD_CREATED", data: created });
    res.status(201).json({ success: true, record: created });
  } catch (e) {
    if (isCloudflareError(e)) {
      appendSystemLog("error", "CLOUDFLARE_ENGINE", `Create DNS failed: ${e.message}`);
      const message =
        e.status === 401 || e.status === 403
          ? "Cloudflare token cannot access this zone. Use a token scoped to this zone or add this zone to the token permissions."
          : e.message;
      res.status(e.status).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Cloudflare create failed" });
  }
});

app.delete("/api/cloudflare/dns/:id", requireRole("admin"), async (req, res) => {
  if (rejectIfLocked(res)) return;
  const record = findDnsRecord(req.params.id);
  if (!record) {
    res.status(404).json({ error: "DNS record not found" });
    return;
  }
  if (!cloudflareConfigured(record.zone_id)) {
    res.status(503).json({ error: "Cloudflare not configured" });
    return;
  }
  try {
    await cfDeleteDns(record.zone_id, req.params.id);
    deleteDnsRecordRow(req.params.id);
    appendSystemLog(
      "info",
      "CLOUDFLARE_ENGINE",
      `DNS record deleted: ${req.params.id}`,
      (res.locals.auth as { sub: string }).sub
    );
    broadcastToControlPlane({ event_type: "DNS_RECORD_DELETED", data: { id: req.params.id } });
    res.json({ success: true, removed_id: req.params.id });
  } catch (e) {
    if (isCloudflareError(e)) {
      const message =
        e.status === 401 || e.status === 403
          ? "Cloudflare token cannot access this zone. Use a token scoped to this zone or add this zone to the token permissions."
          : e.message;
      res.status(e.status).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Cloudflare delete failed" });
  }
});

app.post("/api/infra/emergency-kill", requireRole("admin"), (req, res) => {
  const { confirmed, auth_keyphrase } = req.body ?? {};
  if (confirmed !== true || auth_keyphrase !== "FORCE KILL") {
    res.status(400).json({ error: "Confirmation + keyphrase 'FORCE KILL' required." });
    return;
  }
  const auth = res.locals.auth as { sub: string } | undefined;
  setSystemState("emergency_lockdown", "TRUE", auth?.sub ?? "unknown");
  appendSystemLog("critical", "CONTROL_PLANE", `Emergency lockdown engaged by ${auth?.sub}.`, auth?.sub ?? null);
  const agentsNotified = broadcastToAgents({
    action: "EMERGENCY_BLOCK",
    issued_at: new Date().toISOString(),
    by: auth?.sub
  });
  broadcastToControlPlane({
    event_type: "EMERGENCY_LOCKDOWN",
    data: { locked: true, by: auth?.sub, at: new Date().toISOString(), agents_notified: agentsNotified }
  });
  res.json({
    success: true,
    system_status: "LOCKEDDOWN_ISOLATED",
    locked_at: new Date().toISOString(),
    agents_notified: agentsNotified
  });
});

app.post("/api/infra/emergency-reset", requireRole("admin"), (req, res) => {
  const auth = res.locals.auth as { sub: string } | undefined;
  setSystemState("emergency_lockdown", "FALSE", auth?.sub ?? "unknown");
  appendSystemLog("warning", "CONTROL_PLANE", `Emergency lockdown released by ${auth?.sub}.`, auth?.sub ?? null);
  broadcastToAgents({
    action: "EMERGENCY_RELEASE",
    issued_at: new Date().toISOString(),
    by: auth?.sub
  });
  broadcastToControlPlane({
    event_type: "EMERGENCY_RELEASED",
    data: { locked: false, by: auth?.sub, at: new Date().toISOString() }
  });
  res.json({
    success: true,
    system_status: "NOMINAL",
    recovered_at: new Date().toISOString()
  });
});

const RANGE_MS: Record<string, number> = {
  "15m": 15 * 60 * 1_000,
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000
};

app.get("/api/infra/nodes/:id/pve-guests", (req, res) => {
  res.json(listPveGuests(req.params.id));
});

app.post("/api/infra/nodes/:id/pve-guests/:kind/:vmid/control", requireRole("admin"), (req, res) => {
  if (rejectIfLocked(res)) return;
  const { kind, vmid: vmidStr, id: nodeId } = req.params;
  const vmid = Number(vmidStr);
  if (!Number.isFinite(vmid)) {
    res.status(400).json({ error: "vmid must be a number" });
    return;
  }
  if (kind !== "lxc" && kind !== "qemu") {
    res.status(400).json({ error: "kind must be 'lxc' or 'qemu'" });
    return;
  }
  const signal = req.body?.signal;
  if (!["start", "stop", "reboot", "shutdown"].includes(signal)) {
    res.status(400).json({ error: "signal must be one of: start, stop, reboot, shutdown" });
    return;
  }
  const guest = findPveGuest(nodeId, kind, vmid);
  if (!guest) {
    res.status(404).json({ error: "PVE guest not found" });
    return;
  }
  if (!isAgentOnline(nodeId)) {
    res.status(503).json({ error: `Agent '${nodeId}' is offline; cannot dispatch.` });
    return;
  }
  const transactionId = `pve_${Date.now().toString(36)}`;
  const dispatched = sendToAgent(nodeId, {
    action: "PVE_CONTROL",
    transaction_id: transactionId,
    vmid,
    kind,
    signal
  });
  appendSystemLog(
    "info",
    nodeId,
    `PVE ${kind} ${vmid} ('${guest.name}') signal '${signal}' dispatched.`,
    (res.locals.auth as { sub: string }).sub
  );
  res.json({
    success: true,
    transaction_id: transactionId,
    dispatched
  });
});

app.get("/api/infra/nodes/:id/metrics", (req, res) => {
  const range = typeof req.query.range === "string" ? req.query.range : "1h";
  const windowMs = RANGE_MS[range] ?? RANGE_MS["1h"];
  const since = new Date(Date.now() - windowMs).toISOString();
  res.json({
    node_id: req.params.id,
    range,
    points: listNodeMetrics(req.params.id, since)
  });
});

app.post("/api/infra/nodes/:id/regenerate-token", requireRole("admin"), (req, res) => {
  const auth = res.locals.auth as { sub: string } | undefined;
  const existing = findNodeById(req.params.id);
  const result = rotateNodeToken(req.params.id);
  if (!result || !existing) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  appendSystemLog(
    "warning",
    req.params.id,
    `Agent token regenerated by ${auth?.sub ?? "unknown"}.`,
    auth?.sub ?? null
  );
  res.json({
    success: true,
    node_id: req.params.id,
    secure_token: result.plainToken,
    download_installer_cmd: buildInstallerCommand({
      token: result.plainToken,
      nodeId: req.params.id,
      masterUrl: config.appUrl,
      ipAddress: existing.ip_address
    }),
    ssh_installer_cmd: buildSshInstallerCommand({
      token: result.plainToken,
      nodeId: req.params.id,
      masterUrl: config.appUrl,
      ipAddress: existing.ip_address
    })
  });
});

app.get("/api/infra/logs", (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  res.json(listRecentLogs(Number.isFinite(limit) ? limit : 200));
});

app.post("/api/infra/containers/:id/auto-heal", requireRole("admin"), (req, res) => {
  const container = findContainer(req.params.id);
  if (!container) {
    res.status(404).json({ error: "Container not found" });
    return;
  }
  const enabled = req.body?.enabled === true;
  setContainerAutoHeal(container.id, enabled);
  appendSystemLog(
    "info",
    container.node_id,
    `Auto-heal ${enabled ? "enabled" : "disabled"} for '${container.name}'.`,
    (res.locals.auth as { sub: string }).sub
  );
  res.json({ success: true, id: container.id, auto_heal: enabled });
});

// --- Gemini rate-limit (per-user, 10 calls per 60s rolling window).
const geminiBuckets = new Map<string, number[]>();
const GEMINI_LIMIT = 10;
const GEMINI_WINDOW_MS = 60_000;

function checkGeminiRate(userKey: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const arr = geminiBuckets.get(userKey) ?? [];
  const recent = arr.filter((t) => now - t < GEMINI_WINDOW_MS);
  if (recent.length >= GEMINI_LIMIT) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.ceil((GEMINI_WINDOW_MS - (now - oldest)) / 1000) };
  }
  recent.push(now);
  geminiBuckets.set(userKey, recent);
  return { ok: true };
}

setInterval(() => {
  const cutoff = Date.now() - GEMINI_WINDOW_MS;
  for (const [k, arr] of geminiBuckets) {
    const recent = arr.filter((t) => t >= cutoff);
    if (recent.length === 0) geminiBuckets.delete(k);
    else geminiBuckets.set(k, recent);
  }
}, 120_000).unref();

app.post("/api/gemini/diagnose", requireAuth, async (req, res) => {
  const auth = res.locals.auth as { sub: string };
  const limit = checkGeminiRate(auth.sub);
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.status(429).json({ error: `Rate limit: ${GEMINI_LIMIT}/min. Retry in ${limit.retryAfter}s.` });
    return;
  }

  const { prompt, logs } = req.body ?? {};
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt (string) is required" });
    return;
  }
  if (prompt.length > 4_000) {
    res.status(400).json({ error: "prompt too long (max 4000 chars)" });
    return;
  }
  try {
    const { text } = await geminiDiagnose({
      prompt,
      logs: typeof logs === "string" ? logs : undefined
    });
    appendSystemLog("info", "GEMINI_COPILOT", `Diagnose called by ${auth.sub} (${prompt.length} chars).`, auth.sub);
    res.json({ success: true, response: text });
  } catch (e) {
    if (isGeminiError(e)) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    const message = e instanceof Error ? e.message : "Gemini call failed";
    appendSystemLog("error", "GEMINI_COPILOT", message);
    res.status(502).json({ error: message });
  }
});

async function start(): Promise<void> {
  if (config.nodeEnv === "production" && config.jwtSecret === "change-me-in-production") {
    console.error(
      "[BuildOS Infra] FATAL: JWT_SECRET is the default. Set a strong value in .env before running in production."
    );
    process.exit(1);
  }
  if (config.jwtSecret === "change-me-in-production") {
    console.warn(
      "[BuildOS Infra] WARN: JWT_SECRET is still the default. Sessions are forgeable. Set a strong value in .env."
    );
  }
  try {
    const adminUser = findUserByUsername(config.adminUsername);
    if (adminUser && verifyPassword("admin", adminUser.password_hash)) {
      console.warn(
        `[BuildOS Infra] WARN: admin password is the default 'admin'. ` +
          `Change it now via /users → set password.`
      );
      appendSystemLog(
        "critical",
        "AUTH",
        `Default admin password detected at boot. Change immediately via /users.`
      );
    }
  } catch {
    // best effort; do not block boot
  }
  if (config.nodeEnv !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        root: rootDir,
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (error) {
      console.warn("[BuildOS Infra] Vite dev middleware unavailable, running API-only.", error);
    }
  }

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.status(404).json({ error: "Not found" });
  });

  const httpServer = http.createServer(app);
  attachWsServer(httpServer);

  // Stream every system log to connected dashboards.
  onSystemLog((row) => {
    broadcastToControlPlane({ event_type: "LOG_EVENT", data: row });
  });

  // Retention: drop metrics older than 7 days every hour.
  setInterval(() => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
    const removed = pruneMetrics(cutoff);
    if (removed > 0) {
      appendSystemLog("info", "CONTROL_PLANE", `Pruned ${removed} metric rows older than 7d.`);
    }
  }, 60 * 60 * 1_000).unref();

  // Self-heal sweep: restart failed containers w/ auto_heal=1 on online agents.
  setInterval(() => {
    if (isEmergencyLocked()) return;
    const candidates = listHealCandidates();
    for (const c of candidates) {
      if (!isAgentOnline(c.node_id)) continue;
      const tx = `heal_${Date.now().toString(36)}_${c.id.slice(0, 6)}`;
      const dispatched = sendToAgent(c.node_id, {
        action: "DOCKER_CONTROL",
        transaction_id: tx,
        target_container: c.name,
        signal: "restart"
      });
      if (dispatched) {
        markHealAttempt(c.id);
        updateContainerState(c.id, "restarting", "Auto-heal: restart dispatched.");
        appendSystemLog(
          "warning",
          c.node_id,
          `Auto-heal: dispatched restart for '${c.name}' (was '${c.state}').`
        );
      }
    }
  }, 30_000).unref();

  httpServer.listen(config.port, "0.0.0.0", () => {
    console.log(
      `[BuildOS Infra] Backend listening on http://0.0.0.0:${config.port} (WS: /api/ws/agent/:id, /api/ws/control-plane)`
    );
  });
}

start().catch((error) => {
  console.error("Failed to start BuildOS Infra backend:", error);
  process.exit(1);
});

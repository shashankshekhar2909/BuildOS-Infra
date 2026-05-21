import http from "http";
import express from "express";
import { config } from "./config.js";
import { issueAuthToken, requireAuth, requireRole, verifyCredentials } from "./auth.js";
import {
  appendSystemLog,
  createSecureAgentToken,
  deleteDnsRecord as deleteDnsRecordRow,
  findContainer,
  generateNodeId,
  getSystemState,
  insertNode,
  isEmergencyLocked,
  listContainers,
  listDnsRecords as listDnsRecordsRows,
  listHealCandidates,
  listNodeMetrics,
  listNodes,
  listRecentLogs,
  markHealAttempt,
  onSystemLog,
  pruneMetrics,
  rotateNodeToken,
  setContainerAutoHeal,
  setSystemState,
  updateContainerState,
  upsertDnsRecord
} from "./database.js";
import {
  cloudflareConfigured,
  createDnsRecord as cfCreateDns,
  deleteDnsRecord as cfDeleteDns,
  isCloudflareError,
  listDnsRecords as cfListDns
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

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    phase: "phase-8",
    database: "sqlite",
    cloudflare: cloudflareConfigured() ? "configured" : "unconfigured",
    gemini: geminiConfigured() ? "configured" : "unconfigured",
    emergency_lockdown: getSystemState("emergency_lockdown") === "TRUE"
  });
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

app.post("/api/auth/login", (req, res) => {
  const { username, password, role } = req.body ?? {};

  if ((role !== "admin" && role !== "viewer") || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "role, username, and password are required" });
    return;
  }

  if (!verifyCredentials(role, username, password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = issueAuthToken({ username, role });
  res.json({
    success: true,
    token,
    token_type: "Bearer",
    expires_in: config.jwtExpiresInSeconds,
    user: {
      id: username,
      name: role === "admin" ? "BuildOS Admin" : "BuildOS Viewer",
      email: `${username}@buildos.local`,
      role,
      roles: [role]
    }
  });
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

  appendSystemLog("info", name, `Node '${name}' registered with id '${nodeId}'.`);

  const masterUrl = config.appUrl.replace(/\/$/, "");
  res.status(201).json({
    success: true,
    node_id: nodeId,
    secure_token: plainToken,
    download_installer_cmd: `curl -sSL https://get.buildos.io/install.sh | bash -s -- --token ${plainToken} --master ${masterUrl}`
  });
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
    `Container '${container.name}' received '${action}' control signal.`
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

app.get("/api/cloudflare/dns", requireAuth, async (_req, res) => {
  if (!cloudflareConfigured()) {
    res.json({ source: "cache", configured: false, records: listDnsRecordsRows() });
    return;
  }
  try {
    const live = await cfListDns();
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
    res.json({ source: "cloudflare", configured: true, records: listDnsRecordsRows() });
  } catch (e) {
    if (isCloudflareError(e)) {
      appendSystemLog("error", "CLOUDFLARE_ENGINE", `List DNS failed: ${e.message}`);
      res.status(e.status).json({ error: e.message, fallback: listDnsRecordsRows() });
      return;
    }
    res.status(500).json({ error: "Cloudflare list failed" });
  }
});

app.post("/api/cloudflare/dns", requireRole("admin"), async (req, res) => {
  if (rejectIfLocked(res)) return;
  const { name, type, content, proxied, ttl } = req.body ?? {};
  if (typeof name !== "string" || typeof type !== "string" || typeof content !== "string") {
    res.status(400).json({ error: "name, type, content are required strings" });
    return;
  }
  if (!cloudflareConfigured()) {
    res.status(503).json({ error: "Cloudflare not configured" });
    return;
  }
  try {
    const created = await cfCreateDns({
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
    appendSystemLog("info", "CLOUDFLARE_ENGINE", `DNS record created: ${created.name} (${created.type})`);
    broadcastToControlPlane({ event_type: "DNS_RECORD_CREATED", data: created });
    res.status(201).json({ success: true, record: created });
  } catch (e) {
    if (isCloudflareError(e)) {
      appendSystemLog("error", "CLOUDFLARE_ENGINE", `Create DNS failed: ${e.message}`);
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Cloudflare create failed" });
  }
});

app.delete("/api/cloudflare/dns/:id", requireRole("admin"), async (req, res) => {
  if (rejectIfLocked(res)) return;
  if (!cloudflareConfigured()) {
    res.status(503).json({ error: "Cloudflare not configured" });
    return;
  }
  try {
    await cfDeleteDns(req.params.id);
    deleteDnsRecordRow(req.params.id);
    appendSystemLog("info", "CLOUDFLARE_ENGINE", `DNS record deleted: ${req.params.id}`);
    broadcastToControlPlane({ event_type: "DNS_RECORD_DELETED", data: { id: req.params.id } });
    res.json({ success: true, removed_id: req.params.id });
  } catch (e) {
    if (isCloudflareError(e)) {
      res.status(e.status).json({ error: e.message });
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
  appendSystemLog("critical", "CONTROL_PLANE", `Emergency lockdown engaged by ${auth?.sub}.`);
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
  appendSystemLog("warning", "CONTROL_PLANE", `Emergency lockdown released by ${auth?.sub}.`);
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
  const result = rotateNodeToken(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  appendSystemLog(
    "warning",
    req.params.id,
    `Agent token regenerated by ${auth?.sub ?? "unknown"}.`
  );
  res.json({
    success: true,
    node_id: req.params.id,
    secure_token: result.plainToken,
    download_installer_cmd: `curl -sSL https://get.buildos.io/install.sh | bash -s -- --token ${result.plainToken} --master ${config.appUrl}`
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
    `Auto-heal ${enabled ? "enabled" : "disabled"} for '${container.name}'.`
  );
  res.json({ success: true, id: container.id, auto_heal: enabled });
});

app.post("/api/gemini/diagnose", requireAuth, async (req, res) => {
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
    appendSystemLog("info", "GEMINI_COPILOT", `Diagnose called (${prompt.length} chars).`);
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

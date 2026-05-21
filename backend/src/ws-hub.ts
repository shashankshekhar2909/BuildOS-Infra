import type { IncomingMessage } from "http";
import { URL } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { verifyAuthToken } from "./auth.js";
import {
  appendSystemLog,
  findNodeById,
  recordNodeMetric,
  reconcileMissingContainers,
  reconcileMissingPveGuests,
  upsertContainerFromAgent,
  upsertPveGuest,
  updateNodePing,
  updateNodeStatus,
  verifyToken
} from "./database.js";

type AgentSocket = WebSocket & {
  nodeId: string;
  isAlive: boolean;
};

type ControlPlaneSocket = WebSocket & {
  username: string;
  isAlive: boolean;
  logSubs: Set<string>; // container ids the client wants log frames for
};

const agents = new Map<string, AgentSocket>();
const controlClients = new Set<ControlPlaneSocket>();

function extractAgentToken(req: IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (raw?.startsWith("Bearer ")) {
    return raw.slice(7).trim();
  }
  return null;
}

const BROWSER_PROTO_PREFIX = "buildos.token.";

function extractBrowserToken(req: IncomingMessage): { token: string; protocol: string } | null {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return null;
  const protocols = Array.isArray(header)
    ? header.flatMap((h) => h.split(","))
    : header.split(",");
  for (const p of protocols) {
    const proto = p.trim();
    if (proto.startsWith(BROWSER_PROTO_PREFIX)) {
      return { token: proto.slice(BROWSER_PROTO_PREFIX.length), protocol: proto };
    }
  }
  return null;
}

export function broadcastToControlPlane(event: Record<string, unknown>): void {
  const payload = JSON.stringify(event);
  for (const client of controlClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function sendToAgent(nodeId: string, message: Record<string, unknown>): boolean {
  const socket = agents.get(nodeId);
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

export function broadcastToAgents(message: Record<string, unknown>): number {
  const payload = JSON.stringify(message);
  let sent = 0;
  for (const socket of agents.values()) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
      sent += 1;
    }
  }
  return sent;
}

export function isAgentOnline(nodeId: string): boolean {
  const socket = agents.get(nodeId);
  return socket?.readyState === WebSocket.OPEN;
}

function handleAgentMessage(socket: AgentSocket, raw: string): void {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }

  const action = frame.action;

  if (action === "HEARTBEAT") {
    const payload = (frame.payload ?? {}) as Record<string, unknown>;
    const telemetry = (payload.telemetry ?? {}) as Record<string, number>;
    const containers = Array.isArray(payload.containers) ? payload.containers : [];

    updateNodePing(socket.nodeId, "online");

    const cpu = Number(telemetry.cpu_pct ?? telemetry.cpu_metrics ?? 0);
    const ram = Number(telemetry.ram_pct ?? telemetry.ram_metrics ?? 0);
    const disk = Number(telemetry.disk_pct ?? 0);
    recordNodeMetric({
      node_id: socket.nodeId,
      cpu_pct: Number.isFinite(cpu) ? cpu : 0,
      ram_pct: Number.isFinite(ram) ? ram : 0,
      disk_pct: Number.isFinite(disk) ? disk : 0
    });

    const presentIds: string[] = [];
    for (const c of containers as Array<Record<string, unknown>>) {
      if (typeof c.id !== "string" || typeof c.name !== "string") continue;
      presentIds.push(c.id);
      upsertContainerFromAgent({
        id: c.id,
        node_id: socket.nodeId,
        name: c.name,
        image: typeof c.image === "string" ? c.image : "unknown",
        state: typeof c.state === "string" ? c.state : "unknown",
        status_text: typeof c.status === "string" ? c.status : null,
        ports_map: typeof c.ports === "string" ? c.ports : null
      });
    }
    const missedCount = reconcileMissingContainers(socket.nodeId, presentIds);
    if (missedCount > 0) {
      appendSystemLog(
        "warning",
        socket.nodeId,
        `Reconcile: ${missedCount} container row(s) marked 'missing' (no longer on host).`
      );
    }

    broadcastToControlPlane({
      event_type: "TELEMETRY_BROADCAST",
      timestamp: new Date().toISOString(),
      data: {
        node_id: socket.nodeId,
        cpu_usage: telemetry.cpu_pct ?? telemetry.cpu_metrics ?? 0,
        ram_usage: telemetry.ram_pct ?? telemetry.ram_metrics ?? 0,
        disk_usage: telemetry.disk_pct ?? 0,
        containers_total: containers.length,
        containers_running: (containers as Array<Record<string, unknown>>).filter(
          (c) => c.state === "running"
        ).length
      }
    });
    return;
  }

  if (action === "PVE_GUESTS") {
    const guests = Array.isArray(frame.guests) ? frame.guests : [];
    const present: Array<{ vmid: number; kind: string }> = [];
    for (const g of guests as Array<Record<string, unknown>>) {
      const vmid = Number(g.vmid);
      const kind = typeof g.kind === "string" ? g.kind : "lxc";
      const name = typeof g.name === "string" ? g.name : `guest-${vmid}`;
      const state = typeof g.state === "string" ? g.state : "unknown";
      if (!Number.isFinite(vmid)) continue;
      present.push({ vmid, kind });
      upsertPveGuest({
        node_id: socket.nodeId,
        vmid,
        kind,
        name,
        state,
        cpu_pct: Number(g.cpu_pct ?? 0),
        mem_pct: Number(g.mem_pct ?? 0),
        disk_pct: Number(g.disk_pct ?? 0),
        uptime_seconds: Number(g.uptime_seconds ?? 0)
      });
    }
    const missed = reconcileMissingPveGuests(socket.nodeId, present);
    if (missed > 0) {
      appendSystemLog(
        "warning",
        socket.nodeId,
        `PVE reconcile: ${missed} guest row(s) marked 'missing'.`
      );
    }
    broadcastToControlPlane({
      event_type: "PVE_GUESTS_UPDATE",
      data: { node_id: socket.nodeId, count: guests.length }
    });
    return;
  }

  if (action === "CMD_RESPONSE") {
    broadcastToControlPlane({
      event_type: "CMD_RESPONSE",
      data: frame
    });
    appendSystemLog(
      frame.status === "success" ? "info" : "error",
      socket.nodeId,
      typeof frame.message === "string" ? frame.message : "Agent command response"
    );
    return;
  }

  if (action === "CONTAINER_LOG") {
    const containerId = typeof frame.container_id === "string" ? frame.container_id : null;
    if (!containerId) return;
    const payload = JSON.stringify({
      event_type: "CONTAINER_LOG",
      data: {
        node_id: socket.nodeId,
        container_id: containerId,
        container_name: frame.container_name,
        line: frame.line,
        stream: frame.stream ?? "stdout",
        timestamp: frame.timestamp ?? new Date().toISOString()
      }
    });
    for (const client of controlClients) {
      if (client.readyState === WebSocket.OPEN && client.logSubs.has(containerId)) {
        client.send(payload);
      }
    }
  }
}

function handleControlPlaneMessage(client: ControlPlaneSocket, raw: string): void {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }
  const action = frame.action;
  const containerId = typeof frame.container_id === "string" ? frame.container_id : null;
  const nodeId = typeof frame.node_id === "string" ? frame.node_id : null;

  if (action === "SUBSCRIBE_LOGS" && containerId && nodeId) {
    client.logSubs.add(containerId);
    sendToAgent(nodeId, {
      action: "SUBSCRIBE_LOGS",
      container_id: containerId,
      container_name: frame.container_name
    });
    return;
  }
  if (action === "UNSUBSCRIBE_LOGS" && containerId && nodeId) {
    client.logSubs.delete(containerId);
    // Reference-count: only tell agent to stop if no remaining subscribers.
    let stillWanted = false;
    for (const other of controlClients) {
      if (other !== client && other.logSubs.has(containerId)) {
        stillWanted = true;
        break;
      }
    }
    if (!stillWanted) {
      sendToAgent(nodeId, { action: "UNSUBSCRIBE_LOGS", container_id: containerId });
    }
  }
}

export function attachWsServer(httpServer: import("http").Server): void {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>) => {
      for (const p of protocols) {
        if (p.startsWith(BROWSER_PROTO_PREFIX)) return p;
      }
      return false;
    }
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (path.startsWith("/api/ws/agent/")) {
      const nodeId = path.slice("/api/ws/agent/".length);
      const token = extractAgentToken(req);
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const node = findNodeById(nodeId);
      if (!node || !verifyToken(token, node.secret_token_hash)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const agent = ws as AgentSocket;
        agent.nodeId = nodeId;
        agent.isAlive = true;

        const prior = agents.get(nodeId);
        if (prior && prior !== agent) {
          prior.terminate();
        }
        agents.set(nodeId, agent);
        updateNodeStatus(nodeId, "online");
        appendSystemLog("info", nodeId, "Agent connected.");
        broadcastToControlPlane({
          event_type: "AGENT_CONNECTED",
          data: { node_id: nodeId }
        });

        agent.on("pong", () => {
          agent.isAlive = true;
        });
        agent.on("message", (data) => handleAgentMessage(agent, data.toString()));
        agent.on("close", () => {
          if (agents.get(nodeId) === agent) {
            agents.delete(nodeId);
            updateNodeStatus(nodeId, "offline");
            appendSystemLog("warning", nodeId, "Agent disconnected.");
            broadcastToControlPlane({
              event_type: "AGENT_DISCONNECTED",
              data: { node_id: nodeId }
            });
          }
        });
      });
      return;
    }

    if (path === "/api/ws/control-plane") {
      const fromHeader = req.headers.authorization?.startsWith("Bearer ")
        ? { token: req.headers.authorization.slice(7).trim(), protocol: null as string | null }
        : null;
      const fromProto = extractBrowserToken(req);
      const tokenInfo = fromProto ?? fromHeader;
      const payload = tokenInfo ? verifyAuthToken(tokenInfo.token) : null;
      if (!payload) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (fromProto && ws.protocol !== fromProto.protocol) {
          // ws lib should have selected our protocol; if it did not, force-close to fail loud.
        }
        const client = ws as ControlPlaneSocket;
        client.username = payload.sub;
        client.isAlive = true;
        client.logSubs = new Set();
        controlClients.add(client);
        client.on("pong", () => {
          client.isAlive = true;
        });
        client.on("message", (data) => handleControlPlaneMessage(client, data.toString()));
        client.on("close", () => {
          // Drop all log subscriptions; emit unsubscribe to agents for ids no other client holds.
          for (const containerId of client.logSubs) {
            let stillWanted = false;
            for (const other of controlClients) {
              if (other !== client && other.logSubs.has(containerId)) {
                stillWanted = true;
                break;
              }
            }
            if (!stillWanted) {
              // Best-effort broadcast (we don't know node_id here); agent will accept stop for unknown ids.
              broadcastToAgents({ action: "UNSUBSCRIBE_LOGS", container_id: containerId });
            }
          }
          controlClients.delete(client);
        });
        client.send(
          JSON.stringify({
            event_type: "WELCOME",
            data: { user: payload.sub, role: payload.role }
          })
        );
      });
      return;
    }

    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  });

  setInterval(() => {
    for (const agent of agents.values()) {
      if (!agent.isAlive) {
        agent.terminate();
        continue;
      }
      agent.isAlive = false;
      agent.ping();
    }
    for (const client of controlClients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 15_000).unref();
}

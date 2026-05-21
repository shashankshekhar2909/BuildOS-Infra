import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Standard setup
const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory data store to represent the state of BuildOS Infra nodes, containers, and Cloudflare configuration.
// Allows interactive control of simulated agents and states with actual persistent state behind the API.
const infraState = {
  nodes: [
    {
      id: "node-vps-prod-01",
      name: "prod-vps-sg-01",
      type: "VPS",
      provider: "DigitalOcean",
      ip: "159.223.45.101",
      region: "Singapore",
      status: "online",
      cpuUsage: 14.2,
      ramUsage: 42.1,
      dockerStatus: "active",
      agentVersion: "v1.2.4",
      lastPing: new Date().toISOString()
    },
    {
      id: "node-vps-prod-02",
      name: "prod-vps-us-02",
      type: "VPS",
      provider: "Hetzner",
      ip: "49.12.87.23",
      region: "Germany (Falkenstein)",
      status: "online",
      cpuUsage: 8.5,
      ramUsage: 22.8,
      dockerStatus: "active",
      agentVersion: "v1.2.4",
      lastPing: new Date().toISOString()
    },
    {
      id: "node-homelab-proxmox",
      name: "homelab-pve-01",
      type: "Homelab (Proxmox Virtual Environment)",
      provider: "Self-Hosted NUC",
      ip: "192.168.1.150",
      region: "Home Office (Local)",
      status: "online",
      cpuUsage: 28.9,
      ramUsage: 68.4,
      dockerStatus: "active",
      agentVersion: "v1.2.4",
      lastPing: new Date().toISOString()
    }
  ],
  containers: [
    // prod-vps-sg-01 container list
    {
      id: "c-01",
      nodeId: "node-vps-prod-01",
      name: "nginx-proxy",
      image: "nginx:alpine",
      state: "running",
      status: "Up 4 days",
      ports: "80:80, 443:443",
      cpu: "0.2%",
      memory: "15.4MB / 1024MB",
      domain: "buildos.dev",
      cfTunnel: true
    },
    {
      id: "c-02",
      nodeId: "node-vps-prod-01",
      name: "buildos-main-app",
      image: "sunnyrocks/buildos-app:v1.0.2",
      state: "running",
      status: "Up 2 hours",
      ports: "3000:3000",
      cpu: "1.2%",
      memory: "142.0MB / 2048MB",
      domain: "app.buildos.dev",
      cfTunnel: true
    },
    {
      id: "c-03",
      nodeId: "node-vps-prod-01",
      name: "redis-cache",
      image: "redis:7-alpine",
      state: "running",
      status: "Up 4 days",
      ports: "127.0.0.1:6379:6379",
      cpu: "0.1%",
      memory: "8.2MB / 512MB",
      domain: "N/A (Internal Only)",
      cfTunnel: false
    },
    // prod-vps-us-02 container list
    {
      id: "c-04",
      nodeId: "node-vps-prod-02",
      name: "api-backend",
      image: "sunnyrocks/buildos-api:v1.0.2",
      state: "running",
      status: "Up 1 day",
      ports: "8000:8000",
      cpu: "0.8%",
      memory: "94.5MB / 1024MB",
      domain: "api.buildos.dev",
      cfTunnel: true
    },
    {
      id: "c-05",
      nodeId: "node-vps-prod-02",
      name: "postgres-db",
      image: "postgres:16-alpine",
      state: "running",
      status: "Up 12 days",
      ports: "127.0.0.1:5432:5432",
      cpu: "0.4%",
      memory: "48.2MB / 4096MB",
      domain: "N/A (Internal Only)",
      cfTunnel: false
    },
    // homelab-pve-01 container list
    {
      id: "c-06",
      nodeId: "node-homelab-proxmox",
      name: "home-assistant",
      image: "homeassistant/home-assistant:stable",
      state: "running",
      status: "Up 6 days",
      ports: "8123:8123",
      cpu: "3.4%",
      memory: "284.1MB / 4096MB",
      domain: "ha.myhomelab.net",
      cfTunnel: true
    },
    {
      id: "c-07",
      nodeId: "node-homelab-proxmox",
      name: "plex-media-server",
      image: "plexinc/pms:latest",
      state: "running",
      status: "Up 6 days",
      ports: "32400:32400",
      cpu: "1.1%",
      memory: "512.9MB / 8192MB",
      domain: "plex.myhomelab.net",
      cfTunnel: true
    },
    {
      id: "c-08",
      nodeId: "node-homelab-proxmox",
      name: "pihole-dns",
      image: "pihole/pihole:latest",
      state: "running",
      status: "Up 6 days",
      ports: "53:53/udp, 80:80",
      cpu: "0.1%",
      memory: "35.2MB / 512MB",
      domain: "pihole.local",
      cfTunnel: false
    }
  ],
  dnsRecords: [
    { id: "dns-01", zone: "buildos.dev", name: "buildos.dev", type: "CNAME", content: "cf-tunnel-prod-01.cfargotunnel.com", proxy: true, ttl: "Auto" },
    { id: "dns-02", zone: "buildos.dev", name: "app.buildos.dev", type: "CNAME", content: "cf-tunnel-prod-01.cfargotunnel.com", proxy: true, ttl: "Auto" },
    { id: "dns-03", zone: "buildos.dev", name: "api.buildos.dev", type: "CNAME", content: "cf-tunnel-prod-02.cfargotunnel.com", proxy: true, ttl: "Auto" },
    { id: "dns-04", zone: "myhomelab.net", name: "ha.myhomelab.net", type: "CNAME", content: "cf-tunnel-local.cfargotunnel.com", proxy: true, ttl: "Auto" },
    { id: "dns-05", zone: "myhomelab.net", name: "plex.myhomelab.net", type: "CNAME", content: "cf-tunnel-local.cfargotunnel.com", proxy: true, ttl: "Auto" }
  ],
  tunnels: [
    { id: "t-01", name: "cf-tunnel-prod-01", node: "prod-vps-sg-01", status: "healthy", connections: 4, dataTransferred: "14.5 GB" },
    { id: "t-02", name: "cf-tunnel-prod-02", node: "prod-vps-us-02", status: "healthy", connections: 4, dataTransferred: "4.8 GB" },
    { id: "t-03", name: "cf-tunnel-local", node: "homelab-pve-01", status: "healthy", connections: 2, dataTransferred: "82.4 GB" }
  ],
  systemLogs: [
    { timestamp: new Date(Date.now() - 3600000).toISOString(), type: "info", source: "prod-vps-sg-01", message: "Docker agent connection established securely." },
    { timestamp: new Date(Date.now() - 3000000).toISOString(), type: "info", source: "prod-vps-us-02", message: "Synched 2 Cloudflare DNS tunnel properties mappings." },
    { timestamp: new Date(Date.now() - 2400000).toISOString(), type: "warning", source: "homelab-pve-01", message: "Proxmox memory usage triggered 85% alert warning limit." },
    { timestamp: new Date(Date.now() - 1800000).toISOString(), type: "error", source: "prod-vps-sg-01", message: "nginx-proxy experienced upstream timeout on check for buildos-main-app" },
    { timestamp: new Date(Date.now() - 600000).toISOString(), type: "info", source: "prod-vps-sg-01", message: "buildos-main-app successful container reboot sequence ended." }
  ],
  emergencyKillTriggered: false
};

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in settings secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}

// REST endpoints to feed the Frontend live actions
app.get("/api/infra/state", (req, res) => {
  res.json(infraState);
});

// Start, Stop, Restart container API simulation
app.post("/api/infra/containers/:id/control", (req, res) => {
  if (infraState.emergencyKillTriggered) {
    return res.status(400).json({ error: "Operation forbidden: Global Emergency Kill-Switch is ACTIVE. All nodes restricted." });
  }

  const { action } = req.body; // "start", "stop", "restart"
  const container = infraState.containers.find(c => c.id === req.params.id);
  
  if (!container) {
    return res.status(404).json({ error: "Container not found" });
  }

  const node = infraState.nodes.find(n => n.id === container.nodeId);
  const nodeName = node ? node.name : "unknown-node";

  if (action === "stop") {
    container.state = "stopped";
    container.status = "Exited (0) Just Now";
    container.cpu = "0.0%";
  } else if (action === "start") {
    container.state = "running";
    container.status = "Up Just Now";
    container.cpu = "0.1%";
  } else if (action === "restart") {
    container.state = "running";
    container.status = "Up Just Now (Rebooted)";
    container.cpu = "1.5%";
  }

  // Add system logs
  const timestamp = new Date().toISOString();
  infraState.systemLogs.unshift({
    timestamp,
    type: "info",
    source: nodeName,
    message: `Container '${container.name}' instruction: [${action.toUpperCase()}] triggered by administrator control panel.`
  });

  res.json({ success: true, container });
});

// Emergency control triggers
app.post("/api/infra/emergency-kill", (req, res) => {
  const { confirmed } = req.body;
  if (!confirmed) {
    return res.status(400).json({ error: "Confirmation is required to execute emergency actions." });
  }

  infraState.emergencyKillTriggered = true;
  
  // Stop all cloud containers
  infraState.containers.forEach(c => {
    c.state = "stopped";
    c.status = "Exited (137) Terminated (Emergency)";
    c.cpu = "0.0%";
  });

  // Mark nodes as emergency isolated
  infraState.nodes.forEach(n => {
    n.status = "isolated";
  });

  infraState.systemLogs.unshift({
    timestamp: new Date().toISOString(),
    type: "error",
    source: "CONTROL PLANE CORE",
    message: "CRITICAL: Global Emergency Kill switch triggered! Terminating all container configurations on nodes and severing active tunnels."
  });

  res.json({ success: true, state: infraState });
});

// Reset Emergency Control Trigger
app.post("/api/infra/emergency-reset", (req, res) => {
  infraState.emergencyKillTriggered = false;
  
  // Restore state to normal running (for prototype utility)
  infraState.containers.forEach(c => {
    c.state = "running";
    c.status = "Up Just Now (Restored)";
    c.cpu = "0.5%";
  });

  infraState.nodes.forEach(n => {
    n.status = "online";
  });

  infraState.systemLogs.unshift({
    timestamp: new Date().toISOString(),
    type: "info",
    source: "CONTROL PLANE CORE",
    message: "Global infrastructure recovery triggered. All nodes re-connected and state machines normalized."
  });

  res.json({ success: true, state: infraState });
});

// Cloudflare integration DNS simulation
app.post("/api/cloudflare/dns", (req, res) => {
  if (infraState.emergencyKillTriggered) {
    return res.status(400).json({ error: "Forbidden: Control Plane in isolated lock mode." });
  }

  const { name, type, content, zone, proxy } = req.body;
  if (!name || !type || !content || !zone) {
    return res.status(400).json({ error: "Missing required DNS specification properties." });
  }

  const newRecord = {
    id: "dns-" + (infraState.dnsRecords.length + 1).toString().padStart(2, "0"),
    zone,
    name,
    type,
    content,
    proxy: !!proxy,
    ttl: "Auto"
  };

  infraState.dnsRecords.unshift(newRecord);

  infraState.systemLogs.unshift({
    timestamp: new Date().toISOString(),
    type: "info",
    source: "CLOUDFLARE ENGINE",
    message: `Registered DNS Record: ${name} [${type}] pointing to ${content} (Proxy: ${newRecord.proxy})`
  });

  res.json({ success: true, record: newRecord });
});

app.delete("/api/cloudflare/dns/:id", (req, res) => {
  const index = infraState.dnsRecords.findIndex(r => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "DNS Record not found" });
  }

  const record = infraState.dnsRecords[index];
  infraState.dnsRecords.splice(index, 1);

  infraState.systemLogs.unshift({
    timestamp: new Date().toISOString(),
    type: "warning",
    source: "CLOUDFLARE ENGINE",
    message: `Removed Cloudflare DNS record setting: ${record.name} (${record.type})`
  });

  res.json({ success: true });
});

// AI Copilot operations endpoint
app.post("/api/gemini/diagnose", async (req, res) => {
  try {
    const { prompt, logs, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required for analysis." });
    }

    const ai = getAi();
    
    // Construct rich system prompt with knowledge of BuildOS Infra, acting as an experienced Site Reliability Specialist
    const systemPrompt = `You are the BuildOS AI Operations Co-Pilot, an elite Site Reliability Engineer and Senior Systems Architect expert.
You possess complete knowledge of:
- Docker systems, API controls, remote agent operations with Docker SDK
- Proxmox virtualizer networks (QEMU, LXC, bridge tunnels)
- Cloudflare API pipelines, Cloudflare Tunnels (cloudflared), DNS configurations
- Fast, minimalist, high-reliability Python remote agents
- Multi-node secure server setups

Analyze the user's input, logs, and query regarding BuildOS Infra.
Be extremely practical, and production-driven. Avoid fluff, unnecessary complexity, or suggesting complex setups like Kubernetes unless absolutely essential (prefer lightweight solutions). Provide ready-to-run configurations (Docker composed files, systemd services, short clean Python snippets, or curl queries) where appropriate.

Format your response in beautiful Markdown, using bold terms for headings, clear tables, and well-commented syntax blocks.`;

    const userMessage = `User Query: ${prompt}
${logs ? `\n\nActive System/Container Logs Context:\n${logs}` : ""}
${context ? `\n\nPlatform context: ${JSON.stringify(context)}` : ""}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt
      }
    });

    res.json({ response: response.text });
  } catch (error: any) {
    console.error("Gemini diagnose backend error:", error);
    res.status(500).json({ 
      error: "Could not execute AI Co-Pilot pipeline.", 
      message: error.message || "An unknown error occured."
    });
  }
});


// Serve files in Production vs Dev
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BuildOS Infra Core Server] Server successfully started and listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

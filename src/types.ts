export interface InfraNode {
  id: string;
  name: string;
  type: string;
  provider: string;
  ip: string;
  region: string;
  status: string; // "online" | "isolated" | "offline"
  cpuUsage: number;
  ramUsage: number;
  dockerStatus: string;
  agentVersion: string;
  lastPing: string;
}

export interface DockerContainer {
  id: string;
  nodeId: string;
  name: string;
  image: string;
  state: "running" | "stopped" | "restarting" | string;
  status: string;
  ports: string;
  cpu: string;
  memory: string;
  domain: string;
  cfTunnel: boolean;
}

export interface DNSRecord {
  id: string;
  zone: string;
  name: string;
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX" | string;
  content: string;
  proxy: boolean;
  ttl: string;
}

export interface CFTunnel {
  id: string;
  name: string;
  node: string;
  status: "healthy" | "inactive" | "degraded";
  connections: number;
  dataTransferred: string;
}

export interface SystemLog {
  timestamp: string;
  type: "info" | "warning" | "error";
  source: string;
  message: string;
}

export interface SystemState {
  nodes: InfraNode[];
  containers: DockerContainer[];
  dnsRecords: DNSRecord[];
  tunnels: CFTunnel[];
  systemLogs: SystemLog[];
  emergencyKillTriggered: boolean;
}

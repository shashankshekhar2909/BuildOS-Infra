import React, { useState, useEffect, useRef } from "react";
import {
  Server,
  Cpu,
  Database,
  ShieldAlert,
  RefreshCw,
  Play,
  Square,
  FileText,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  Activity,
  Network,
  AlertTriangle,
  Lock,
  Unlock,
  Sliders,
  Search,
  Filter,
  Send,
  Sparkles,
  X,
  PlusCircle,
  HelpCircle,
  Terminal,
  ShieldCheck,
  Zap,
  Check
} from "lucide-react";
import { SystemState, DockerContainer, DNSRecord, InfraNode } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"nodes" | "containers" | "dns" | "copilot">("nodes");
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Terminal event logs search/filter controls
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState<string>("");

  // AI Copilot operations state
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<string | null>(null);
  
  // Custom quick prompts for the AI
  const presetQueries = [
    { label: "Draft Python docker agent code", prompt: "Write a high-performance Python script that uses the Docker SDK to control local containers on standard remote VPS ports." },
    { label: "Cloudflare tunnel systemd setup", prompt: "Explain how to install cloudflared as a systemd background service on Debian and associate it with an active zone tunnel key." },
    { label: "OOM panic mitigation recipe", prompt: "Explain how to configure memory limits on Docker containers to prevent kernel OOM killer panics on small Hetzner cloud servers." },
    { label: "Proxmox API credentials config", prompt: "Provide secure environment configurations to safely query local Proxmox PVE node stats without exposing root system shell accounts." }
  ];

  // DNS form states
  const [dnsName, setDnsName] = useState("");
  const [dnsType, setDnsType] = useState("CNAME");
  const [dnsContent, setDnsContent] = useState("cf-tunnel-prod-01.cfargotunnel.com");
  const [dnsZone, setDnsZone] = useState("buildos.dev");
  const [dnsProxy, setDnsProxy] = useState(true);

  // Container search/filter inside Node explorer or Container workspace Views
  const [containerSearch, setContainerSearch] = useState("");
  const [containerNodeFilter, setContainerNodeFilter] = useState("all");

  // Safeguard flow states
  const [emergencyUnlockStep, setEmergencyUnlockStep] = useState(0); // 0=idle, 1=checkbox verified, 2=typed auth
  const [isAckChecked, setIsAckChecked] = useState(false);
  const [authKeyphrase, setAuthKeyphrase] = useState("");

  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  // Load infrastructure state from Express API
  const fetchState = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/infra/state");
      if (!res.ok) {
        throw new Error(`API returned HTTP status ${res.status}`);
      }
      const data = await res.json();
      setSystemState(data);
      setErrorMessage(null);
    } catch (err: any) {
      console.error("Failed to load infrastructure system state:", err);
      setErrorMessage("Could not connect to controller instance. Verify backend service port status.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    // Keep agent properties state synced in background
    const interval = setInterval(fetchState, 6000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom of logs on state changes
  useEffect(() => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [systemState?.systemLogs]);

  // Handle Container remote start/stop/restart
  const handleContainerControl = async (id: string, action: "start" | "stop" | "restart") => {
    try {
      const res = await fetch(`/api/infra/containers/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to execute container instructions");
        return;
      }
      await fetchState();
    } catch (err) {
      console.error(err);
      alert("Operational command timed out.");
    }
  };

  // Handle Add DNS record
  const handleAddDns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dnsName || !dnsContent) return;
    try {
      const res = await fetch("/api/cloudflare/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dnsName,
          type: dnsType,
          content: dnsContent,
          zone: dnsZone,
          proxy: dnsProxy
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to sync DNS entry changes.");
        return;
      }
      setDnsName("");
      await fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete DNS record
  const handleDeleteDns = async (id: string) => {
    try {
      const res = await fetch(`/api/cloudflare/dns/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger Emergency Kill switch
  const handleTriggerEmergencyKill = async () => {
    if (authKeyphrase.trim().toUpperCase() !== "FORCE KILL") {
      alert("Authorization keyphrase is incorrect.");
      return;
    }
    try {
      const res = await fetch("/api/infra/emergency-kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true })
      });
      if (res.ok) {
        setEmergencyUnlockStep(0);
        setIsAckChecked(false);
        setAuthKeyphrase("");
        await fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reset Emergency lockdown state
  const handleResetEmergency = async () => {
    try {
      const res = await fetch("/api/infra/emergency-reset", {
        method: "POST"
      });
      if (res.ok) {
        await fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Query AI Co-Pilot
  const handleQueryCopilot = async (selectedPrompt?: string) => {
    const activePrompt = selectedPrompt || copilotPrompt;
    if (!activePrompt.trim()) return;

    setIsCopilotThinking(true);
    setCopilotResponse(null);
    try {
      const res = await fetch("/api/gemini/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt,
          logs: systemState?.systemLogs.map(l => `[${l.timestamp}] ${l.source} - ${l.type.toUpperCase()}: ${l.message}`).join("\n"),
          context: {
            nodeCount: systemState?.nodes.length,
            containerCount: systemState?.containers.length,
            isLockedDown: systemState?.emergencyKillTriggered,
            tunnels: systemState?.tunnels
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setCopilotResponse(`**Error from copilot pipeline:**\n${data.error || "Unknown server response issue"}`);
      } else {
        setCopilotResponse(data.response);
      }
    } catch (err: any) {
      console.error(err);
      setCopilotResponse("**Communication error:** Could not reach the server-side Gemini endpoint. Check API key settings.");
    } finally {
      setIsCopilotThinking(false);
      if (!selectedPrompt) {
        setCopilotPrompt("");
      }
    }
  };

  // Calculations for KPI overhead bar
  const totalNodesCount = systemState?.nodes.length || 0;
  const runningContainersCount = systemState?.containers.filter(c => c.state === "running").length || 0;
  const activeTunnelsCount = systemState?.tunnels.filter(t => t.status === "healthy").length || 0;
  const totalEgressText = "91.7 GB";

  // Filter logs based on search criteria
  const getFilteredLogs = () => {
    if (!systemState) return [];
    return systemState.systemLogs.filter(log => {
      const matchesType = logFilter === "all" || log.type === logFilter;
      const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase()) || 
                            log.source.toLowerCase().includes(logSearch.toLowerCase());
      return matchesType && matchesSearch;
    });
  };

  // Filter containers for UI List
  const getFilteredContainers = () => {
    if (!systemState) return [];
    return systemState.containers.filter(c => {
      const matchesNode = containerNodeFilter === "all" || c.nodeId === containerNodeFilter;
      const matchesSearch = c.name.toLowerCase().includes(containerSearch.toLowerCase()) ||
                            c.image.toLowerCase().includes(containerSearch.toLowerCase()) ||
                            c.domain.toLowerCase().includes(containerSearch.toLowerCase());
      return matchesNode && matchesSearch;
    });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#09090b] text-[#fafafa] font-sans overflow-hidden">
      
      {/* Fallback Style declarations matching theme guidelines */}
      <style>{`
        .status-glow-green { box-shadow: 0 0 10px rgba(16, 185, 129, 0.35); }
        .status-glow-blue { box-shadow: 0 0 10px rgba(59, 130, 246, 0.35); }
        .status-glow-red { box-shadow: 0 0 10px rgba(239, 68, 68, 0.45); }
        .glass-card { background: #111113; border: 1px solid #222225; border-radius: 12px; }
        .glass-card-hover:hover { border-color: #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.05); }
        .terminal-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .terminal-scroll::-webkit-scrollbar-track { background: #0c0c0d; }
        .terminal-scroll::-webkit-scrollbar-thumb { background: #222225; border-radius: 3px; }
        .terminal-scroll::-webkit-scrollbar-thumb:hover { background: #2d2d30; }
        .infra-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; }
      `}</style>

      {/* TOP NAVIGATION BAR */}
      <nav className="h-14 border-b border-[#27272a] px-6 flex items-center justify-between bg-[#09090b] shrink-0" id="top-navbar-control">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-black text-white shrink-0 shadow-md shadow-blue-900/40 font-mono">B</div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-bold tracking-tight">BuildOS <span className="text-blue-500">Infra</span></h1>
            <span className="text-[10px] font-mono font-semibold text-zinc-400 bg-zinc-900/80 px-2 py-0.5 border border-zinc-800 rounded">v1.1.2-ALPHA</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${systemState?.emergencyKillTriggered ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider">
              Control Plane Status: <span className={systemState?.emergencyKillTriggered ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{systemState?.emergencyKillTriggered ? 'lockdown' : 'nominal'}</span>
            </span>
          </div>
          
          <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block" />

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 font-mono hidden md:inline">SYSTEM OVERVIEW UPTIME: <span className="text-white font-bold">99.982%</span></span>
            <button 
              onClick={fetchState} 
              disabled={isLoading}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer border border-zinc-800"
              title="Synch Agent Heartbeats"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* EMERGENCY LOCK BANNERS */}
      {systemState?.emergencyKillTriggered && (
        <div className="bg-red-950/40 border-b border-red-500/50 px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shadow-lg shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500 animate-bounce" />
            <span className="text-xs text-red-300 font-medium">
              <strong>Emergency Isolation Actuated:</strong> Container operations are locked. CF Tunnels closed to prevent egress traffic.
            </span>
          </div>
          <button 
            onClick={handleResetEmergency}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow border border-emerald-500/50 shrink-0 font-mono"
            style={{ touchAction: "manipulation" }}
          >
            <Unlock className="w-3 h-3" />
            DE-ACTIVATE LOCKDOWN MODE
          </button>
        </div>
      )}

      {/* METRIC OVERHEAD COMPONENT */}
      <div className="px-6 pt-5 pb-1 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 flex flex-col relative overflow-hidden">
            <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase font-mono">Connected Nodes</span>
            <span className="text-2xl font-bold mt-1 text-white flex items-baseline gap-2">
              {totalNodesCount}
              <span className="text-xs text-zinc-500 font-normal">Registered Nodes</span>
            </span>
            <span className="text-[10px] text-emerald-500 mt-1.5 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Heartbeats Responding
            </span>
          </div>

          <div className="glass-card p-4 flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase font-mono">Containers Active</span>
            <span className="text-2xl font-bold mt-1 text-white flex items-baseline gap-2">
              {runningContainersCount}
              <span className="text-xs text-zinc-500 font-normal">Running</span>
            </span>
            <span className="text-[10px] text-[#3b82f6] mt-1.5 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              Across Node Clusters
            </span>
          </div>

          <div className="glass-card p-4 flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase font-mono">Egress Tunnel Volume</span>
            <span className="text-2xl font-bold mt-1 text-white flex items-baseline gap-1.5 font-mono">
              {activeTunnelsCount} <span className="text-xs text-zinc-500 font-normal font-sans">Active Tunnels</span>
            </span>
            <span className="text-[10px] text-zinc-500 mt-1.5 font-mono">
              Total Traffic: {totalEgressText}
            </span>
          </div>

          <div className="glass-card p-4 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase font-mono">Control Mode</span>
              <div className="text-sm font-bold mt-1 text-zinc-300 flex items-center gap-1 tracking-tight">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                AI Ops Co-Pilot Enabled
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono italic mt-1 leading-none">
              Gemini-3.5-Flash Core Live
            </span>
          </div>
        </div>
      </div>

      {/* CORE WORKSPACE INTERFACE */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6" id="workspace-layout-core">
        
        {/* LEFT NAV SIDEBAR */}
        <aside className="w-56 glass-card p-4 flex flex-col gap-6 shrink-0 hidden md:flex" id="sidebar-layout">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3.5 font-mono">Infrastructure</p>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setActiveTab("nodes")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === "nodes"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-900/30"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  Nodes Clusters Explore
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveTab("containers")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === "containers"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-900/30"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Container Matrix
                </button>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3.5 font-mono">Connectivity Map</p>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setActiveTab("dns")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === "dns"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-900/30"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  Cloudflare Gateway
                </button>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3.5 font-mono">Operations</p>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setActiveTab("copilot")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-bold cursor-pointer transition-all ${
                    activeTab === "copilot"
                      ? "bg-indigo-600/20 text-indigo-400 border border-indigo-900/30 font-bold"
                      : "text-zinc-400 hover:text-[#fafafa] hover:bg-indigo-950/10 hover:border hover:border-indigo-950/30"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  AI Ops Co-Pilot
                </button>
              </li>
            </ul>
          </div>

          {/* SAFETIES & KILL SWITCH SAFEGUARD WIZARD */}
          <div className="mt-auto">
            <div className="p-3 bg-red-950/10 border border-red-900/30 rounded-lg space-y-2">
              <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider font-mono">Emergency Control</p>
              
              {!systemState?.emergencyKillTriggered ? (
                <>
                  {emergencyUnlockStep === 0 ? (
                    <button
                      onClick={() => setEmergencyUnlockStep(1)}
                      className="w-full bg-red-950/50 hover:bg-red-900/60 border border-red-800/40 text-red-400 text-[10px] font-bold py-2 px-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer text-center block font-mono"
                    >
                      AirLock Force Kill
                    </button>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-red-900/30">
                      {emergencyUnlockStep === 1 ? (
                        <div className="space-y-2">
                          <label className="flex items-start gap-1.5 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={isAckChecked}
                              onChange={e => setIsAckChecked(e.target.checked)}
                              className="accent-red-500 mt-0.5"
                            />
                            <span className="text-[9px] text-zinc-400 leading-tight">Confirm VPS & Local node isolation</span>
                          </label>
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => { setEmergencyUnlockStep(0); setIsAckChecked(false); }}
                              className="w-12 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[9px] py-1 rounded cursor-pointer font-mono"
                            >
                              Cancel
                            </button>
                            <button 
                              disabled={!isAckChecked}
                              onClick={() => setEmergencyUnlockStep(2)}
                              className="flex-1 bg-red-950 hover:bg-red-900 text-red-400 text-[9px] font-bold py-1 rounded cursor-pointer font-mono disabled:opacity-30"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[9px] text-zinc-400 leading-tight">Type keyphrase &quot;FORCE KILL&quot;:</p>
                          <input 
                            type="text"
                            placeholder="Type keyword..."
                            value={authKeyphrase}
                            onChange={e => setAuthKeyphrase(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 text-red-400 text-[10px] p-1 font-mono uppercase focus:outline-none focus:border-red-500 rounded"
                          />
                          <div className="flex gap-1">
                            <button 
                              onClick={() => { setEmergencyUnlockStep(0); setAuthKeyphrase(""); }}
                              className="w-10 bg-zinc-900 text-zinc-400 text-[9px] py-1 rounded cursor-pointer font-mono"
                            >
                              Reset
                            </button>
                            <button 
                              disabled={authKeyphrase.trim().toUpperCase() !== "FORCE KILL"}
                              onClick={handleTriggerEmergencyKill}
                              className="flex-1 bg-red-600 hover:bg-red-500 text-white text-[9px] font-bold py-1 rounded cursor-pointer font-mono"
                            >
                              ACTUATE KILL!
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <span className="block text-[9px] bg-red-950 border border-red-500/30 text-red-400 text-center py-1 font-mono uppercase font-bold tracking-wider animate-pulse rounded">
                    locked isolated
                  </span>
                  <button 
                    onClick={handleResetEmergency}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold py-1 px-1 rounded uppercase tracking-wider transition-colors cursor-pointer text-center font-mono"
                  >
                    RESTORE STATE
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* WORKSPACE CENTRAL COLUMN AREA */}
        <main className="flex-1 flex flex-col gap-6 overflow-hidden">
          
          {/* MOBILE NAVIGATION BAR (REPLACES ASIDE FOR NARROW SCREENS) */}
          <div className="md:hidden flex flex-wrap gap-1 bg-zinc-950 border border-zinc-800 p-1.5 rounded-lg shrink-0">
            <button
              onClick={() => setActiveTab("nodes")}
              className={`flex-1 py-1 text-center text-[10px] font-mono rounded ${
                activeTab === "nodes" ? "bg-zinc-900 border border-zinc-800 text-blue-400" : "text-zinc-400"
              }`}
            >
              Nodes Explorer
            </button>
            <button
              onClick={() => setActiveTab("containers")}
              className={`flex-1 py-1 text-center text-[10px] font-mono rounded ${
                activeTab === "containers" ? "bg-zinc-900 border border-zinc-800 text-blue-400" : "text-zinc-400"
              }`}
            >
              Containers
            </button>
            <button
              onClick={() => setActiveTab("dns")}
              className={`flex-1 py-1 text-center text-[10px] font-mono rounded ${
                activeTab === "dns" ? "bg-zinc-900 border border-zinc-800 text-blue-400" : "text-zinc-400"
              }`}
            >
              Cloudflare
            </button>
            <button
              onClick={() => setActiveTab("copilot")}
              className={`flex-1 py-1 text-center text-[10px] font-mono rounded ${
                activeTab === "copilot" ? "bg-zinc-900 border border-zinc-800 text-indigo-400" : "text-zinc-400"
              }`}
            >
              AI Co-Pilot
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 terminal-scroll space-y-6">
            
            {/* TAB VIEW 1: ACTIVE SERVER NODES (Proxmox/VPS) */}
            {activeTab === "nodes" && (
              <div className="space-y-4" id="view-nodes-section">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-200">Server Nodes & Virtualization Platforms</h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Physical hardware, Cloud VMs, and Proxmox clustered hypervisors</p>
                  </div>
                  <span className="text-[10px] bg-emerald-950/40 text-emerald-400 font-mono border border-emerald-900/20 px-2 py-0.5 rounded font-semibold uppercase">
                    All Agents Online
                  </span>
                </div>

                <div className="infra-grid">
                  {systemState?.nodes.map((node) => {
                    const isIsolated = node.status === "isolated" || systemState.emergencyKillTriggered;
                    const isHomelab = node.type.includes("Proxmox") || node.name.includes("homelab");
                    
                    return (
                      <div
                        key={node.id}
                        className={`glass-card p-4 border-l-4 relative overflow-hidden transition-all duration-300 ${
                          isIsolated 
                            ? "border-l-red-500" 
                            : isHomelab 
                              ? "border-l-blue-500" 
                              : "border-l-emerald-500"
                        }`}
                        id={`node-elem-${node.id}`}
                      >
                        {/* Status indicators */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5">
                          <span className={`text-[9px] font-mono uppercase font-bold tracking-wider ${
                            isIsolated ? "text-red-400" : "text-emerald-400"
                          }`}>
                            {isIsolated ? "isolated" : "online"}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${
                            isIsolated ? "bg-red-500 status-glow-red" : "bg-emerald-500 status-glow-green"
                          }`} />
                        </div>

                        {/* Title and Provider metadata */}
                        <div className="mb-4">
                          <h3 className="font-mono text-sm font-bold text-[#fafafa] flex items-center gap-1.5">
                            {node.name}
                          </h3>
                          <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                            {node.provider} • IP: {node.ip} • Region: {node.region}
                          </p>
                        </div>

                        {/* Telemetry charts */}
                        <div className="space-y-3 mb-4">
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-zinc-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                <Cpu className="w-3 h-3 text-zinc-600" />
                                CPU LOAD
                              </span>
                              <span className="text-zinc-300 font-bold">{isIsolated ? "0.0%" : `${node.cpuUsage}%`}</span>
                            </div>
                            <div className="w-full bg-[#0c0c0d] border border-[#222225] h-2 rounded overflow-hidden p-[1px]">
                              <div
                                className={`h-full rounded-sm transition-all duration-500 ${
                                  isIsolated ? "bg-zinc-800" : node.cpuUsage > 75 ? "bg-red-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${isIsolated ? 0 : node.cpuUsage}%` }}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-zinc-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                <Database className="w-3 h-3 text-zinc-600" />
                                RAM UTILIZATION
                              </span>
                              <span className="text-zinc-300 font-semibold">
                                {isIsolated ? "0.0 GB" : isHomelab ? `${((node.ramUsage / 100) * 64).toFixed(1)}/64 GB` : `${((node.ramUsage / 100) * 4).toFixed(1)}/4 GB`}
                              </span>
                            </div>
                            <div className="w-full bg-[#0c0c0d] border border-[#222225] h-2 rounded overflow-hidden p-[1px]">
                              <div
                                className={`h-full rounded-sm transition-all duration-500 ${
                                  isIsolated ? "bg-zinc-800" : "bg-blue-500"
                                }`}
                                style={{ width: `${isIsolated ? 0 : node.ramUsage}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Node Metadata Footer details */}
                        <div className="flex justify-between items-center pt-3 border-t border-[#1e1e21] text-[10px] font-mono">
                          <span className="text-zinc-500">
                            Agent: <strong className="text-zinc-300 font-semibold">{node.agentVersion}</strong>
                          </span>
                          <button
                            onClick={() => {
                              setContainerNodeFilter(node.id);
                              setActiveTab("containers");
                            }}
                            className="text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-tight text-[9px] font-bold cursor-pointer"
                          >
                            Inspect Docker SDK →
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Provision Server Node Card placeholder */}
                  <div className="border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20 p-6 flex flex-col justify-center items-center text-center group cursor-pointer hover:bg-zinc-950/40 hover:border-zinc-700 transition-all duration-300">
                    <div className="w-9 h-9 border border-dashed border-zinc-700 rounded-full flex items-center justify-center text-zinc-500 group-hover:text-blue-400 group-hover:border-blue-400 group-hover:scale-105 transition-all">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-3 group-hover:text-zinc-300">
                      Register Remote Agent
                    </span>
                    <p className="text-[9px] text-zinc-600 mt-1 max-w-[180px] font-serif leading-tight">
                      Deploy Python lightweight agent daemon on any fresh cloud host in one click
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB VIEW 2: ACTIVE CONTAINER MATRIX */}
            {activeTab === "containers" && (
              <div className="space-y-4" id="view-containers-section">
                
                {/* Search, Filter panel */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#111113] border border-[#222225] p-4 rounded-xl shrink-0">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-zinc-200">Active Container Control Center</h2>
                    <p className="text-[11px] text-zinc-500 leading-none">Stop, start, and restart cloud Docker container structures remotely</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 pointer-events-none">
                        <Search className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        placeholder="Filter containers..."
                        value={containerSearch}
                        onChange={e => setContainerSearch(e.target.value)}
                        className="w-full sm:w-48 pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                      />
                    </div>

                    <select
                      value={containerNodeFilter}
                      onChange={e => setContainerNodeFilter(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 text-xs font-mono rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="all">Filter Node: All</option>
                      {systemState?.nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>

                    {containerNodeFilter !== "all" && (
                      <button
                        onClick={() => setContainerNodeFilter("all")}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline font-mono cursor-pointer"
                      >
                        Reset node filter
                      </button>
                    )}
                  </div>
                </div>

                {/* Table representation */}
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-900/60 text-zinc-500 font-mono text-[10px] uppercase tracking-wider border-b border-[#222225]">
                          <th className="py-3 px-4 font-bold">Container Name & Image</th>
                          <th className="py-3 px-3 font-bold">Host Cluster Node</th>
                          <th className="py-3 px-3 font-bold text-center">Power Status</th>
                          <th className="py-3 px-3 font-bold">Proxy Mapping Route</th>
                          <th className="py-3 px-4 text-right font-bold">Signals Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#18181b] font-sans">
                        {getFilteredContainers().length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-zinc-500 font-mono text-xs">
                              No running or inactive container processes found matching filters.
                            </td>
                          </tr>
                        ) : (
                          getFilteredContainers().map(container => {
                            const isRunning = container.state === "running";
                            const hostNodeName = systemState?.nodes.find(n => n.id === container.nodeId)?.name || "unknown";
                            const isIsolated = systemState?.emergencyKillTriggered;

                            return (
                              <tr 
                                key={container.id} 
                                className={`hover:bg-zinc-900/20 transition-all ${
                                  !isRunning ? "opacity-60" : ""
                                }`}
                                id={`row-cont-${container.id}`}
                              >
                                <td className="py-3.5 px-4">
                                  <div className="font-mono font-bold text-white text-xs">{container.name}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate max-w-[220px]" title={container.image}>
                                    {container.image}
                                  </div>
                                </td>
                                
                                <td className="py-3.5 px-3">
                                  <span className="font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                                    {hostNodeName}
                                  </span>
                                </td>

                                <td className="py-3.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                      isIsolated ? "bg-red-500 status-glow-red" : isRunning ? "bg-emerald-500 status-glow-green" : "bg-zinc-500"
                                    }`} />
                                    <span className={`font-mono text-[10px] uppercase font-semibold ${
                                      isIsolated ? "text-red-400" : isRunning ? "text-emerald-400" : "text-zinc-500"
                                    }`}>
                                      {isIsolated ? "Terminated (Emergency)" : container.state}
                                    </span>
                                  </div>
                                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">{container.status}</div>
                                </td>

                                <td className="py-3.5 px-3">
                                  {container.domain !== "N/A (Internal Only)" ? (
                                    <div className="space-y-1">
                                      <a
                                        href={`https://${container.domain}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-blue-400 hover:underline hover:text-blue-300 font-mono flex items-center gap-1"
                                      >
                                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                                        {container.domain}
                                      </a>
                                      {container.cfTunnel && (
                                        <span className="text-[9px] bg-sky-950/20 text-sky-400 border border-sky-900/30 px-1.5 py-0.5 font-mono rounded inline-block leading-none uppercase font-bold">
                                          Cloudflare Tunnel
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono text-zinc-600">Localhost Isolated</span>
                                  )}
                                </td>

                                <td className="py-3.5 px-4 text-right">
                                  {isIsolated ? (
                                    <span className="text-[10px] text-red-500 font-mono italic">Locked Down</span>
                                  ) : (
                                    <div className="inline-flex gap-1.5">
                                      {isRunning ? (
                                        <>
                                          <button
                                            onClick={() => handleContainerControl(container.id, "restart")}
                                            className="p-1 px-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900 rounded transition-colors cursor-pointer"
                                            title="Soft Reload process"
                                          >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleContainerControl(container.id, "stop")}
                                            className="p-1 px-1.5 bg-zinc-950 border border-red-950/60 text-red-500/80 hover:text-white hover:bg-red-900 rounded transition-colors cursor-pointer"
                                            title="SIGTERM Kill process"
                                          >
                                            <Square className="w-3.5 h-3.5 fill-current" />
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => handleContainerControl(container.id, "start")}
                                          className="p-1.5 px-3 bg-zinc-950 border border-emerald-900 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded text-[10px] font-mono font-bold tracking-wide transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                          <Play className="w-3 h-3 fill-current" />
                                          START
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB VIEW 3: CLOUDFLARE DNS & TUNNELS */}
            {activeTab === "dns" && (
              <div className="space-y-6" id="view-dns-section">
                
                {/* Cloudflare Tunnel status headers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {systemState?.tunnels.map(tunnel => (
                    <div key={tunnel.id} className="glass-card p-4 relative overflow-hidden bg-zinc-950/40">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-mono text-xs font-bold text-zinc-200">{tunnel.name}</span>
                        <span className="text-[9px] bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 rounded px-1.5 py-0.5 font-mono uppercase font-bold">
                          {tunnel.status}
                        </span>
                      </div>
                      
                      <div className="space-y-1 pt-3 border-t border-[#1e1e21] text-[10px] font-mono text-zinc-500">
                        <div className="flex justify-between">
                          <span>Origin Node Context:</span>
                          <span className="text-zinc-300 font-bold">{tunnel.node}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Active Routing Paths:</span>
                          <span className="text-zinc-300 font-bold">{tunnel.connections} active connections</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Bandwidth Volume (Rx/Tx):</span>
                          <span className="text-zinc-300 font-bold">{tunnel.dataTransferred}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Register New Record Form (Takes 2 cols) */}
                  <div className="lg:col-span-2 glass-card p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">Register Gateway Mapping</h3>
                    </div>

                    <form onSubmit={handleAddDns} className="space-y-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">DNS Subdomain Name</label>
                        <input
                          type="text"
                          required
                          disabled={systemState?.emergencyKillTriggered}
                          placeholder="e.g. core-api, home-automation"
                          value={dnsName}
                          onChange={e => setDnsName(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:outline-none focus:border-blue-500 rounded text-xs text-zinc-300 font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Zone Route Selection</label>
                          <select
                            value={dnsZone}
                            onChange={e => setDnsZone(e.target.value)}
                            disabled={systemState?.emergencyKillTriggered}
                            className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 font-mono cursor-pointer focus:outline-none"
                          >
                            <option value="buildos.dev">buildos.dev</option>
                            <option value="myhomelab.net">myhomelab.net</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Record Mapping Type</label>
                          <select
                            value={dnsType}
                            onChange={e => setDnsType(e.target.value)}
                            disabled={systemState?.emergencyKillTriggered}
                            className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 font-mono cursor-pointer focus:outline-none"
                          >
                            <option value="CNAME">CNAME (Tunnel Alias)</option>
                            <option value="A">A (Static IPv4)</option>
                            <option value="TXT">TXT (Verification File)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Target Host Connection (IP/Tunnel URL)</label>
                        <input
                          type="text"
                          required
                          disabled={systemState?.emergencyKillTriggered}
                          placeholder="cf-tunnel-prod-01.cfargotunnel.com"
                          value={dnsContent}
                          onChange={e => setDnsContent(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:outline-none focus:border-blue-500 rounded text-xs text-zinc-300 font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1 pb-2">
                        <input
                          type="checkbox"
                          id="cf-proxy-checkbox"
                          checked={dnsProxy}
                          onChange={e => setDnsProxy(e.target.checked)}
                          disabled={systemState?.emergencyKillTriggered}
                          className="accent-blue-500 cursor-pointer"
                        />
                        <label htmlFor="cf-proxy-checkbox" className="text-[10px] font-mono text-zinc-400 select-none uppercase tracking-wider flex items-center gap-2 cursor-pointer">
                          Proxy traffic through Cloudflare (orange-cloud protection)
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={systemState?.emergencyKillTriggered}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-25 disabled:bg-zinc-900 text-white font-mono text-xs font-bold tracking-wider rounded uppercase cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow border border-blue-500/50"
                      >
                        <PlusCircle className="w-4 h-4" />
                        SYNC CLOUDFLARE DNS GATEWAY
                      </button>
                    </form>
                  </div>

                  {/* Active DNS record grids (Takes 3 cols) */}
                  <div className="lg:col-span-3 glass-card p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#222225] pb-3">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-zinc-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">Sync Grid Zone Records</h3>
                      </div>
                      <span className="text-[10px] bg-zinc-900 text-zinc-500 px-2 py-0.5 font-mono border border-zinc-800 rounded">
                        Active records: {systemState?.dnsRecords.length}
                      </span>
                    </div>

                    <div className="overflow-hidden border border-zinc-900 rounded-lg">
                      <div className="overflow-x-auto max-h-[380px] overflow-y-auto terminal-scroll">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#0c0c0d] font-mono text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-900">
                            <tr>
                              <th className="py-2.5 px-3">Subdomain name</th>
                              <th className="py-2.5 px-2">Type</th>
                              <th className="py-2.5 px-2 text-center">Proxy</th>
                              <th className="py-2.5 px-3">Target / Proxy Target Source</th>
                              <th className="py-2.5 px-3 text-right">Delete</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#131316] font-mono text-[11px] text-zinc-300">
                            {systemState?.dnsRecords.map(rec => (
                              <tr key={rec.id} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 px-3 font-semibold text-white">{rec.name}</td>
                                <td className="py-2.5 px-2">
                                  <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded leading-none text-[9px]">
                                    {rec.type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  {rec.proxy ? (
                                    <span className="text-amber-500 text-[10px] font-bold" title="Proxied through Cloudflare network">
                                      オレンジ cloud
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600">Bypassed</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[150px]" title={rec.content}>
                                  {rec.content}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={() => handleDeleteDns(rec.id)}
                                    disabled={systemState?.emergencyKillTriggered}
                                    className="text-zinc-600 hover:text-red-400 p-1 cursor-pointer transition-colors disabled:opacity-25"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB VIEW 4: AI OPERATIONS COPILOT (GEMINI POWERED) */}
            {activeTab === "copilot" && (
              <div className="space-y-4" id="view-copilot-section">
                
                {/* Intro banner */}
                <div className="bg-[#111113] border border-indigo-900/30 p-5 rounded-xl flex items-start gap-4">
                  <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-lg shrink-0">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      BuildOS AI-Native Infrastructure Assistant
                      <span className="text-[10px] font-mono tracking-wider text-indigo-400 bg-indigo-950/50 border border-indigo-900/40 px-2 py-0.5 rounded uppercase font-semibold">
                        Gemini-3.5-Flash Core
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Consult your Site Reliability Engineer Co-pilot with automated system intelligence payload injections. Let it inspect telemetry loads on your custom Python remote agents, diagnose container errors, draft Docker configs, or help adjust Cloudflare tunnel routing setups securely.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Left preset prompts library */}
                  <div className="lg:col-span-1 glass-card p-4 space-y-3.5">
                    <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">Operations Playground Presets</h3>
                    <div className="space-y-2">
                      {presetQueries.map((preset, idx) => (
                        <button
                          key={idx}
                          role="button"
                          onClick={() => handleQueryCopilot(preset.prompt)}
                          disabled={isCopilotThinking}
                          className="w-full text-left p-2.5 bg-zinc-950/60 border border-zinc-900 hover:border-indigo-950 hover:bg-slate-900/10 rounded-md transition-all text-[11px] font-mono text-zinc-300 hover:text-[#fafafa] leading-normal cursor-pointer block disabled:opacity-50"
                        >
                          <span className="text-indigo-400 font-bold flex items-center gap-1 mb-1">
                            <Zap className="w-3 h-3 text-indigo-400 inline" />
                            {preset.label}
                          </span>
                          <span className="text-zinc-500 text-[10px] truncate block">{preset.prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chat interface panel */}
                  <div className="lg:col-span-3 glass-card flex flex-col min-h-[460px] overflow-hidden">
                    <div className="p-3.5 border-b border-[#222225] bg-zinc-900/30 flex justify-between items-center text-xs">
                      <span className="text-zinc-400 font-mono font-bold flex items-center gap-1.5 rounded">
                        <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />
                        Interactive AI SRE Operations Terminal
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Automatically embeds active system logs context
                      </span>
                    </div>

                    {/* Chat view area */}
                    <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs tracking-normal font-sans leading-relaxed">
                      {/* AI Copilot greeting */}
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded bg-indigo-600/10 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 uppercase border border-indigo-900/20">
                          AI
                        </div>
                        <div className="bg-zinc-950 border border-zinc-900 p-3 rounded-lg max-w-[85%] text-zinc-300">
                          <p className="font-semibold text-white mb-1">BuildOS SRE Co-Pilot</p>
                          <p>
                            Hello, User! I am prepared to analyze your server matrix or suggest lightweight configurations. You can select one of the presets on the left or type your own question below.
                          </p>
                        </div>
                      </div>

                      {/* Display response */}
                      {copilotResponse && (
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded bg-indigo-600/10 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 uppercase border border-indigo-900/20">
                            AI
                          </div>
                          <div className="bg-zinc-900/50 border border-[#222225] p-4 rounded-lg max-w-[85%] text-zinc-200">
                            <p className="font-bold text-[#fafafa] flex items-center gap-1 border-b border-[#222225] pb-1.5 mb-2.5 font-mono text-[11px] uppercase tracking-wider">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              Copilot Diagnostics Result
                            </p>
                            
                            <div className="prose prose-invert prose-xs font-sans text-zinc-300 space-y-3 max-w-none">
                              {copilotResponse.split("\n").map((line, idx) => {
                                // Formatting check helper for code/bold formatting
                                if (line.startsWith("```")) {
                                  return null; // hide the raw ticks
                                }
                                if (line.startsWith("- ") || line.startsWith("* ")) {
                                  return (
                                    <ul key={idx} className="list-disc pl-4 space-y-1">
                                      <li>{line.substring(2)}</li>
                                    </ul>
                                  );
                                }
                                if (line.startsWith("#")) {
                                  return (
                                    <h4 key={idx} className="text-zinc-200 font-bold font-mono text-[11px] uppercase tracking-wider mt-2.5 mb-1.5">
                                      {line.replace(/#/g, "").trim()}
                                    </h4>
                                  );
                                }
                                return <p key={idx} className="leading-relaxed whitespace-pre-wrap">{line}</p>;
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Loading state indicator */}
                      {isCopilotThinking && (
                        <div className="flex items-start gap-3 animate-pulse">
                          <div className="w-7 h-7 rounded bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 uppercase">
                            AI
                          </div>
                          <div className="bg-indigo-950/15 border border-indigo-900/40 p-3.5 rounded-lg max-w-[80%] text-indigo-400 font-mono text-[10px]">
                            <span className="inline-block animate-spin mr-2">◷</span>
                            Ingesting server state matrices and orchestrating diagnostics. Please wait...
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat input box */}
                    <div className="p-3.5 border-t border-[#222225] bg-zinc-950">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ask AI Operations Co-Pilot (e.g. Write Python remote docker connector agent systemd recipe)..."
                          value={copilotPrompt}
                          onChange={e => setCopilotPrompt(e.target.value)}
                          disabled={isCopilotThinking}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleQueryCopilot();
                          }}
                          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleQueryCopilot()}
                          disabled={isCopilotThinking || !copilotPrompt.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:bg-zinc-900 text-white font-mono text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1 inline-flex shrink-0 shadow border border-indigo-500/50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Consult
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* PERSISTENT LIVE LOGS EVENT TERM WINDOW AT BOTTOM */}
          <div className="h-40 glass-card bg-black border-t-2 border-t-blue-500/50 flex flex-col overflow-hidden shrink-0 mt-auto" id="logs-terminal-view">
            <div className="h-8 border-b border-[#222225] flex items-center px-4 justify-between bg-[#0e0e10]/80">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${systemState?.emergencyKillTriggered ? 'bg-red-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">Realtime Operations Logs Feed</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-zinc-600 font-mono hidden sm:inline">BuildOS-Relay Heartbeat: OK</span>
                
                {/* Minimal search to grep inside the persistent bar */}
                <input
                  type="text"
                  placeholder="Grep logs..."
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-300 placeholder-zinc-600 w-24 focus:outline-none focus:border-blue-500 text-end"
                />

                <select
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-[9px] px-1 py-0.5 rounded select-none text-zinc-400 font-mono cursor-pointer focus:outline-none"
                >
                  <option value="all">DEBUG / ALL</option>
                  <option value="info">INFO</option>
                  <option value="warning">WARNING</option>
                  <option value="error">ERROR</option>
                </select>
              </div>
            </div>

            <div 
              ref={logsScrollRef}
              className="flex-1 p-3.5 overflow-y-auto terminal-scroll font-mono text-[11px] leading-relaxed space-y-1 bg-black text-zinc-300"
            >
              {getFilteredLogs().length === 0 ? (
                <p className="text-zinc-600 italic text-center py-5">No corresponding log events matched criteria.</p>
              ) : (
                getFilteredLogs().map((log, idx) => {
                  let typeColor = "text-sky-400";
                  if (log.type === "warning") typeColor = "text-amber-500";
                  if (log.type === "error") typeColor = "text-red-500 font-bold";

                  return (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline gap-1 py-0.5 border-b border-[#0c0c0d] last:border-0 hover:bg-zinc-950">
                      <span className="text-zinc-600 text-[10px]">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={`${typeColor} uppercase font-bold text-[9px] tracking-wider shrink-0 w-12 sm:text-center`}>
                        {log.type}
                      </span>
                      <span className="text-zinc-500 text-[10px] font-semibold uppercase">{log.source}:</span>
                      <span className="text-zinc-300 select-text flex-1">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </main>

        {/* RIGHT PANEL - CLOUDFLARE SYNC & AI DEPLOYMENT INSIGHTS (VISIBLE ON LARGER WIDTHS) */}
        <aside className="w-64 border-l border-[#27272a] pl-6 flex flex-col gap-6 shrink-0 hidden lg:flex" id="right-aside-layout">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 font-mono">Cloudflare Gateway Status</p>
            <div className="space-y-3">
              {systemState?.tunnels.map(tun => (
                <div key={tun.id} className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-900">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold font-mono text-zinc-200">{tun.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900/40 rounded uppercase font-bold tracking-wider font-mono">
                      {tun.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate mt-1">Origin cluster: {tun.node}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 font-mono">AI Deployment Analytics</p>
            <div className="p-4 glass-card bg-blue-950/10 border-blue-900/30">
              <p className="text-[11px] text-blue-300 italic mb-2.5 leading-relaxed font-serif">
                &quot;Resource optimization recommended on VPS node prod-vps-us-02. Transferring postgres-db container to the local homelab environment could reduce egress cost by up to 22%.&quot;
              </p>
              <button
                onClick={() => {
                  setActiveTab("copilot");
                  setCopilotPrompt("How do I migrate postgres-db to the homelab environment safely with backups?");
                }}
                className="w-full py-1.5 bg-blue-600/25 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold uppercase transition-colors hover:bg-blue-600/40 cursor-pointer"
              >
                Draft Migration Plan
              </button>
            </div>
          </div>

          <div className="mt-auto border-t border-zinc-900 pt-4 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="w-3.5 h-3.5 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-center font-bold text-emerald-400 text-[10px]">✓</div>
              <span className="text-[11px] text-zinc-500 font-mono">Auto-Scaling: <span className="text-white font-bold uppercase tracking-wide">Enabled</span></span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <div className="w-3.5 h-3.5 bg-indigo-600 rounded flex items-center justify-center font-bold text-white text-[8px] animate-pulse">★</div>
              <span className="text-[11px] text-zinc-500 font-mono">AI Governance: <span className="text-indigo-400 font-bold uppercase tracking-wide">Active</span></span>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}

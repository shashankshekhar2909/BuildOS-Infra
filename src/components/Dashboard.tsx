import React, { useState } from "react";
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
  CheckCircle, 
  Activity, 
  Network, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Sliders, 
  Search,
  Filter
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SystemState, DockerContainer, DNSRecord, InfraNode } from "../types";

interface DashboardProps {
  systemState: SystemState;
  actions: {
    controlContainer: (id: string, action: "start" | "stop" | "restart") => Promise<void>;
    addDnsRecord: (record: Partial<DNSRecord>) => Promise<void>;
    deleteDnsRecord: (id: string) => Promise<void>;
    triggerEmergencyKill: () => Promise<void>;
    resetEmergencyState: () => Promise<void>;
    refreshState: () => Promise<void>;
  };
  isLoading: boolean;
}

export default function Dashboard({ systemState, actions, isLoading }: DashboardProps) {
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string>("all");
  const [containerSearch, setContainerSearch] = useState<string>("");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState<string>("");
  
  // DNS form state
  const [newDnsName, setNewDnsName] = useState("");
  const [newDnsType, setNewDnsType] = useState("CNAME");
  const [newDnsContent, setNewDnsContent] = useState("cf-tunnel-prod-01.cfargotunnel.com");
  const [newDnsZone, setNewDnsZone] = useState("buildos.dev");
  const [newDnsProxy, setNewDnsProxy] = useState(true);
  
  // Emergency Wizard Step State
  const [emergencyStep, setEmergencyStep] = useState(0); // 0 = default, 1 = check acknowledgment, 2 = typed confirmation
  const [chkAck, setChkAck] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");

  const filteredNodes = systemState.nodes;
  const filteredContainers = systemState.containers.filter(c => {
    const matchesNode = selectedNodeFilter === "all" || c.nodeId === selectedNodeFilter;
    const matchesSearch = c.name.toLowerCase().includes(containerSearch.toLowerCase()) || 
                          c.image.toLowerCase().includes(containerSearch.toLowerCase()) ||
                          c.domain.toLowerCase().includes(containerSearch.toLowerCase());
    return matchesNode && matchesSearch;
  });

  const filteredLogs = systemState.systemLogs.filter(log => {
    const matchesType = logFilter === "all" || log.type === logFilter;
    const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase()) || 
                          log.source.toLowerCase().includes(logSearch.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleCreateDns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDnsName || !newDnsContent || !newDnsZone) return;
    await actions.addDnsRecord({
      name: newDnsName,
      type: newDnsType,
      content: newDnsContent,
      zone: newDnsZone,
      proxy: newDnsProxy
    });
    setNewDnsName("");
  };

  const handleEmergencyTrigger = async () => {
    if (chkAck && typedConfirmation.trim().toUpperCase() === "FORCE KILL") {
      await actions.triggerEmergencyKill();
      setEmergencyStep(0);
      setChkAck(false);
      setTypedConfirmation("");
    }
  };

  const handleResetEmergency = async () => {
    await actions.resetEmergencyState();
    setEmergencyStep(0);
    setChkAck(false);
    setTypedConfirmation("");
  };

  return (
    <div className="space-y-6" id="buildos-dashboard-view">
      {/* State Notice Banner */}
      {systemState.emergencyKillTriggered && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-950/40 border border-red-500/50 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg shadow-red-950/20"
          id="emergency-alert-banner"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/20 text-red-400 rounded-lg shrink-0 animate-pulse">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-red-400 font-bold tracking-tight text-sm">GLOBAL EMERGENCY ISOLATION TRIGGERED</h4>
              <p className="text-red-300 text-xs mt-0.5 max-w-2xl leading-relaxed">
                All cloud servers and homelab nodes are currently under locked-down, isolated modes. Outgoing traffic tunnels through Cloudflare are blocked, and operational agent container processes have been terminated (Exit Code 137). Admin controls are restricted.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetEmergency}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-1.5 cursor-pointer shadow-md inline-flex shrink-0 border border-emerald-500/50"
            id="emergency-reset-btn"
          >
            <Unlock className="w-4.5 h-4.5" />
            Restore Node Controls
          </button>
        </motion.div>
      )}

      {/* Grid of Nodes */}
      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-100 tracking-tight">Active Operations Nodes</h2>
            <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full font-mono font-medium">
              {systemState.nodes.length} Connected
            </span>
          </div>
          <button 
            onClick={actions.refreshState} 
            disabled={isLoading}
            className="p-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded-lg transition-colors cursor-pointer"
            title="Refresh State"
            id="refresh-nodes-btn"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="nodes-status-grid">
          {filteredNodes.map((node) => {
            const isIsolated = node.status === "isolated" || systemState.emergencyKillTriggered;
            return (
              <div 
                key={node.id} 
                className={`bg-gray-950 border rounded-xl p-4 relative overflow-hidden transition-all duration-300 ${
                  isIsolated 
                    ? 'border-red-950 shadow-md shadow-red-950/5' 
                    : 'border-gray-800/80 hover:border-gray-700 hover:shadow-lg'
                }`}
                id={`node-card-${node.id}`}
              >
                {/* Node type corner badge */}
                <div className="absolute top-0 right-0 py-1 px-3 text-[10px] font-mono tracking-wider font-semibold rounded-bl-lg bg-gray-900 text-gray-400 border-l border-b border-gray-800/60 uppercase">
                  {node.type.includes("Proxmox") ? "Homelab" : "VPS"}
                </div>

                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${isIsolated ? 'bg-red-500/10 text-red-400' : 'bg-gray-900 text-emerald-400'}`}>
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2 tracking-tight">
                      {node.name}
                      <span className={`inline-block w-2 bg-current h-2 rounded-full ${isIsolated ? 'text-red-500 animate-pulse' : 'text-emerald-500 animate-pulse'}`} />
                    </h3>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5">{node.ip} • {node.region}</p>
                  </div>
                </div>

                {/* Telemetry Stats */}
                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-gray-900">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-gray-600" />
                      CPU Load
                    </span>
                    <p className="text-sm font-mono font-bold text-gray-200">
                      {isIsolated ? "0.0%" : `${node.cpuUsage}%`}
                    </p>
                    <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${isIsolated ? 'bg-red-600' : 'bg-emerald-500'}`}
                        style={{ width: isIsolated ? "0%" : `${node.cpuUsage}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1">
                      <Database className="w-3 h-3 text-gray-600" />
                      RAM Utilization
                    </span>
                    <p className="text-sm font-mono font-bold text-gray-200">
                      {isIsolated ? "0.0%" : `${node.ramUsage}%`}
                    </p>
                    <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${isIsolated ? 'bg-red-600' : 'bg-blue-500'}`}
                        style={{ width: isIsolated ? "0%" : `${node.ramUsage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Agent Detail Footer */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-900 text-[10px] font-mono text-gray-500">
                  <span>agent: <strong className="text-gray-400">{node.agentVersion}</strong></span>
                  <span>status: 
                    <strong className={isIsolated ? "text-red-400 ml-1 uppercase" : "text-emerald-400 ml-1 uppercase"}>
                      {isIsolated ? "isolated" : "online"}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Container / Operations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Container Management & Domain Map (Take 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Container Management Interface */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Active Containers Matrix</h2>
              </div>
              
              {/* Search + Node Selection Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-gray-500">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Filter containers..."
                    value={containerSearch}
                    onChange={(e) => setContainerSearch(e.target.value)}
                    className="pl-8 pr-2.5 py-1 text-xs bg-gray-900 border border-gray-800 focus:border-emerald-500 focus:outline-none rounded-lg text-gray-200 placeholder-gray-500 font-mono w-40 transition-colors"
                  />
                </div>
                
                <select
                  value={selectedNodeFilter}
                  onChange={(e) => setSelectedNodeFilter(e.target.value)}
                  className="bg-gray-900 border border-gray-800 px-2.5 py-1 text-xs rounded-lg text-gray-300 font-mono focus:border-emerald-500 focus:outline-none transition-colors"
                >
                  <option value="all">All Nodes</option>
                  {systemState.nodes.map(node => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Container Grid Table */}
            <div className="overflow-x-auto border border-gray-900 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-900/60 text-gray-400 font-mono text-[10px] uppercase tracking-wider border-b border-gray-900">
                    <th className="py-2.5 px-4 font-semibold">Container Name & Image</th>
                    <th className="py-2.5 px-3 font-semibold">Host Node</th>
                    <th className="py-2.5 px-3 font-semibold">Docker Status</th>
                    <th className="py-2.5 px-3 font-semibold">Route & Tunnel</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Remote Signal Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900" id="containers-table-body">
                  {filteredContainers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 font-mono">
                        No containers matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredContainers.map(container => {
                      const hostNode = systemState.nodes.find(n => n.id === container.nodeId);
                      const isRunning = container.state === "running";
                      const isEmergency = systemState.emergencyKillTriggered;

                      return (
                        <tr 
                          key={container.id} 
                          className="hover:bg-gray-900/30 transition-colors"
                          id={`container-row-${container.id}`}
                        >
                          {/* Name & Image */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-100 flex items-center gap-1.5">
                              {container.name}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-[200px]" title={container.image}>
                              {container.image}
                            </div>
                          </td>

                          {/* Node ID */}
                          <td className="py-3 px-3 text-gray-400 font-mono text-[11px]">
                            {hostNode ? hostNode.name : "Unknown"}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono leading-none font-medium capitalize ${
                              isEmergency 
                                ? 'bg-red-500/10 text-red-400 border border-red-900/30' 
                                : isRunning 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-950/30' 
                                  : 'bg-gray-800 text-gray-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isEmergency ? 'bg-red-500' : isRunning ? 'bg-emerald-500' : 'bg-gray-500'}`} />
                              {isEmergency ? "Emergency Killed" : container.state}
                            </span>
                            <div className="text-[9px] text-gray-500 font-mono mt-1 max-w-[140px] truncate">{container.status}</div>
                          </td>

                          {/* Cloudflare Tunnel Route Mapping */}
                          <td className="py-3 px-3">
                            {container.domain !== "N/A (Internal Only)" ? (
                              <div className="space-y-1">
                                <span className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-mono">
                                  <Globe className="w-3 h-3 shrink-0 text-blue-500" />
                                  {container.domain}
                                </span>
                                {container.cfTunnel && (
                                  <span className="inline-flex text-[9px] bg-sky-950/40 text-sky-400 font-mono border border-sky-900/30 px-1 py-0.5 rounded leading-none shrink-0">
                                    Cloudflare Tunnel
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] font-mono text-gray-600">Local Only</span>
                            )}
                          </td>

                          {/* Container remote buttons */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              {isRunning && !isEmergency ? (
                                <>
                                  <button
                                    onClick={() => actions.controlContainer(container.id, "restart")}
                                    className="p-1 px-1.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                                    title="Restart Container Instance"
                                    id={`restart-btn-${container.id}`}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => actions.controlContainer(container.id, "stop")}
                                    className="p-1 px-1.5 bg-gray-900 border border-red-950 text-red-500/80 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors cursor-pointer"
                                    title="Stop Container"
                                    id={`stop-btn-${container.id}`}
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                </>
                              ) : !isEmergency ? (
                                <button
                                  onClick={() => actions.controlContainer(container.id, "start")}
                                  className="p-1 px-2.5 bg-gray-900 border border-emerald-950 text-emerald-500 hover:text-white hover:bg-emerald-600 rounded flex items-center gap-1 text-[10px] font-mono font-medium transition-colors cursor-pointer"
                                  id={`start-btn-${container.id}`}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  START
                                </button>
                              ) : (
                                <span className="text-[10px] text-red-500 font-mono italic flex items-center gap-1">
                                  <Lock className="w-3 h-3" /> Locked
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cloudflare DNS Integrations Map */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Cloudflare Tunnel & DNS Sync Pipeline</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-1">
              {systemState.tunnels.map(tunnel => (
                <div key={tunnel.id} className="bg-gray-900/60 border border-gray-800/80 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-200 font-mono">{tunnel.name}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-900/20 uppercase font-mono font-bold font-semibold">
                      {tunnel.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-2.5 pt-2 border-t border-gray-800/60 text-[10px] font-mono text-gray-500">
                    <div>Node: <strong className="text-gray-400">{tunnel.node}</strong></div>
                    <div>Paths: <strong className="text-gray-400">{tunnel.connections} Active</strong></div>
                    <div className="col-span-2">Telemetry Rx/Tx: <strong className="text-gray-400">{tunnel.dataTransferred}</strong></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 pt-2">
              {/* Add New DNS Register Form */}
              <div className="md:col-span-2 border-t md:border-t-0 md:border-r border-gray-900 md:pr-6 pt-4 md:pt-0">
                <form onSubmit={handleCreateDns} className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest font-mono">Register DNS mapping</h3>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-gray-500 uppercase">DNS Subdomain Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. preview-api"
                      value={newDnsName}
                      onChange={e => setNewDnsName(e.target.value)}
                      disabled={systemState.emergencyKillTriggered}
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded focus:outline-none focus:border-blue-500 font-mono text-gray-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-gray-500 uppercase">Zone Domain</label>
                      <select 
                        value={newDnsZone} 
                        onChange={e => setNewDnsZone(e.target.value)}
                        disabled={systemState.emergencyKillTriggered}
                        className="w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded focus:outline-none focus:border-blue-500 font-mono text-gray-300 cursor-pointer"
                      >
                        <option value="buildos.dev">buildos.dev</option>
                        <option value="myhomelab.net">myhomelab.net</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-gray-500 uppercase">Record Type</label>
                      <select 
                        value={newDnsType} 
                        onChange={e => setNewDnsType(e.target.value)}
                        disabled={systemState.emergencyKillTriggered}
                        className="w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded focus:outline-none focus:border-blue-500 font-mono text-gray-300 cursor-pointer"
                      >
                        <option value="CNAME">CNAME</option>
                        <option value="A">A (IPv4)</option>
                        <option value="TXT">TXT</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-gray-500 uppercase">Target (CNAME/Tunnel Point)</label>
                    <input
                      type="text"
                      required
                      placeholder="cf-tunnel-prod-01.cfargotunnel.com"
                      value={newDnsContent}
                      onChange={e => setNewDnsContent(e.target.value)}
                      disabled={systemState.emergencyKillTriggered}
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded focus:outline-none focus:border-blue-500 font-mono text-gray-300"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input 
                      type="checkbox" 
                      id="proxy-flag" 
                      checked={newDnsProxy}
                      onChange={e => setNewDnsProxy(e.target.checked)}
                      disabled={systemState.emergencyKillTriggered}
                      className="accent-blue-500"
                    />
                    <label htmlFor="proxy-flag" className="text-[10px] font-mono text-gray-400 uppercase select-none cursor-pointer flex items-center gap-1">
                      Proxy through Cloudflare
                      <span className="w-2.5 h-2.5 bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center font-bold font-sans text-[8px]" title="Cloudflare orange cloud proxy features active">orange</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={systemState.emergencyKillTriggered}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-900 disabled:text-gray-700 text-white rounded font-mono text-xs font-semibold tracking-wide transition-colors cursor-pointer flex items-center justify-center gap-1 border border-blue-500/50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    SYNC CLOUDFLARE DNS
                  </button>
                </form>
              </div>

              {/* DNS Mapping Matrix View */}
              <div className="md:col-span-3 space-y-2">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest font-mono">Sync Grid Zone Records</h3>
                <div className="border border-gray-900 rounded-lg overflow-hidden max-h-[290px] overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-gray-900/60 font-mono text-[9px] uppercase tracking-wider text-gray-500 border-b border-gray-900">
                      <tr>
                        <th className="py-2 px-3">Subdomain</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2 text-center">Proxy</th>
                        <th className="py-2 px-3">Content</th>
                        <th className="py-2 px-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-900 font-mono" id="dns-matrix-tbody">
                      {systemState.dnsRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-gray-900/20" id={`dns-row-${rec.id}`}>
                          <td className="py-2 px-3 text-gray-200 font-bold">{rec.name}</td>
                          <td className="py-2 px-2"><span className="bg-gray-900 text-gray-400 px-1 py-0.5 rounded leading-none text-[9px]">{rec.type}</span></td>
                          <td className="py-2 px-2 text-center">
                            {rec.proxy ? (
                              <span className="text-amber-500" title="Proxied through Cloudflare">オレンジ cloud</span>
                            ) : (
                              <span className="text-gray-600">gray bypass</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-500 truncate max-w-[120px]" title={rec.content}>{rec.content}</td>
                          <td className="py-2 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => actions.deleteDnsRecord(rec.id)}
                              disabled={systemState.emergencyKillTriggered}
                              className="text-gray-600 hover:text-red-400 p-0.5 cursor-pointer disabled:opacity-25"
                              id={`delete-dns-btn-${rec.id}`}
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

        {/* Emergency Kill Switches & Realtime Observability Logs (Take 1 col) */}
        <div className="space-y-6">
          
          {/* Emergency Kill Switches Panel */}
          <div className="bg-gray-950 border border-red-950/60 rounded-xl p-5 relative overflow-hidden space-y-4">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-950/10 blur-2xl rounded-full" />
            
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Emergency Kill Switches</h2>
            </div>
            <p className="text-xs text-red-300/80 leading-normal">
              Immediately triggers localized agent Docker socket terminations, isolated container mappings, and kills active edge Cloudflare Tunnel configurations. Keep safeguards locked.
            </p>

            {!systemState.emergencyKillTriggered ? (
              <div className="space-y-3 pt-1">
                {emergencyStep === 0 ? (
                  <button
                    onClick={() => setEmergencyStep(1)}
                    className="w-full py-3 bg-red-950/60 hover:bg-red-900/60 border border-red-500/50 text-red-400 rounded-xl font-mono text-xs font-bold tracking-widest transition-all cursor-pointer shadow-lg hover:shadow-red-950/50 flex items-center justify-center gap-1.5"
                    id="initiate-kill-btn"
                  >
                    <ShieldAlert className="w-4 h-4 animate-pulse text-red-500" />
                    INITIATE AIRLock KILL
                  </button>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-gray-900 border border-red-500/40 rounded-lg p-3.5 space-y-3.5"
                  >
                    <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <span className="text-[10px] font-bold text-red-400 font-mono">SAFEGUARD STEP {emergencyStep} OF 2</span>
                      <button 
                        onClick={() => { setEmergencyStep(0); setChkAck(false); setTypedConfirmation(""); }}
                        className="text-gray-500 hover:text-gray-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    {emergencyStep === 1 ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id="chk-ack-emergency"
                            checked={chkAck}
                            onChange={(e) => setChkAck(e.target.checked)}
                            className="accent-red-500 mt-0.5 shrink-0"
                          />
                          <label htmlFor="chk-ack-emergency" className="text-[10px] font-mono text-gray-400 leading-normal select-none cursor-pointer">
                            I verify that triggering this will terminate all running apps, shutdown VPS Docker agents, isolate the local homelab, and remove public web domains.
                          </label>
                        </div>
                        <button
                          disabled={!chkAck}
                          onClick={() => setEmergencyStep(2)}
                          className="w-full py-2 bg-red-900/40 disabled:bg-gray-950 hover:bg-red-800/40 disabled:text-gray-700 text-red-400 rounded font-mono text-[10px] font-semibold tracking-wider transition-all border border-red-500/20 cursor-pointer"
                        >
                          PROCEED TO FINAL LOCKED STEP
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-gray-500 uppercase">Type keyphrase &quot;<span className="text-red-400 font-bold select-all font-mono">FORCE KILL</span>&quot; to authorize:</label>
                          <input
                            type="text"
                            placeholder="Type to authorize..."
                            value={typedConfirmation}
                            onChange={(e) => setTypedConfirmation(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-gray-950 border border-gray-800 rounded focus:outline-none focus:border-red-500 uppercase font-mono text-red-400 placeholder-red-900/50"
                          />
                        </div>
                        <button
                          disabled={typedConfirmation.trim().toUpperCase() !== "FORCE KILL"}
                          onClick={handleEmergencyTrigger}
                          className="w-full py-2 bg-red-600 disabled:bg-gray-950 hover:bg-red-500 disabled:text-gray-700 text-white rounded font-mono text-[10px] font-bold tracking-widest transition-all border border-red-500 cursor-pointer"
                          id="confirm-kill-act-btn"
                        >
                          EXECUTE CRITICAL ENTIRE KILL
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="bg-red-950/20 border border-red-500/40 rounded-xl p-3.5 space-y-3 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto animate-pulse" />
                <h3 className="text-xs font-bold text-red-400 font-mono uppercase">Infra Safeties Actuated</h3>
                <p className="text-[10px] font-mono text-red-300">All nodes are isolated manually. Agent callbacks rejected.</p>
                <button
                  onClick={handleResetEmergency}
                  className="w-full py-1.5 bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 rounded font-mono text-[10px] tracking-wider transition-colors cursor-pointer"
                >
                  DE-ACTIVATE LOCKOUT MODE
                </button>
              </div>
            )}
          </div>

          {/* Observability System Logs Pipeline */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-900 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Active Terminal Event logs</h2>
              </div>
            </div>

            {/* Filter and Log search controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-gray-500">
                  <Search className="w-3 h-3" />
                </span>
                <input
                  type="text"
                  placeholder="Grep events..."
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="pl-7 pr-2 py-1 bg-gray-900 border border-gray-800 focus:outline-none focus:border-emerald-500 rounded text-[11px] font-mono text-gray-300 placeholder-gray-600 w-full"
                />
              </div>

              <select
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                className="bg-gray-900 border border-gray-800 px-2 py-1 text-[11px] rounded text-gray-400 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">DEBUG / ALL</option>
                <option value="info">INFO</option>
                <option value="warning">WARNING</option>
                <option value="error">ERROR</option>
              </select>
            </div>

            {/* Logs Window */}
            <div className="bg-black/80 border border-gray-900 rounded-xl p-3 font-mono text-[10px] space-y-2 h-[340px] overflow-y-auto overflow-x-hidden leading-relaxed">
              {filteredLogs.length === 0 ? (
                <p className="text-gray-600 italic text-center py-10">No matching infrastructure log events recorded.</p>
              ) : (
                filteredLogs.map((log, idx) => {
                  let colorClass = "text-sky-400";
                  if (log.type === "warning") colorClass = "text-amber-400";
                  if (log.type === "error") colorClass = "text-red-400";

                  return (
                    <div 
                      key={idx} 
                      className="border-b border-gray-950 pb-1.5 last:border-0 hover:bg-gray-900/40 p-1 rounded"
                    >
                      <div className="flex justify-between text-gray-600 text-[9px] mb-0.5">
                        <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className="font-semibold uppercase text-gray-500">{log.source}</span>
                      </div>
                      <p className="text-gray-300">
                        <strong className={`${colorClass} mr-1 text-[9px] font-bold uppercase`}>{log.type}:</strong>
                        {log.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

"use client";

import { Activity } from "lucide-react";
import { useControlPlaneWs } from "@/hooks/use-control-plane-ws";
import { useNodeMetrics } from "@/hooks/use-node-metrics";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";

function NodeSparklines({ nodeId }: { nodeId: string }) {
  const points = useNodeMetrics(nodeId, "1h", 15_000);
  if (points.length === 0) return null;
  const cpu = points.map((p) => p.cpu_pct);
  const ram = points.map((p) => p.ram_pct);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-cyan-200">
      <Sparkline values={cpu} label="CPU" stroke="#67e8f9" />
      <Sparkline values={ram} label="RAM" stroke="#a5f3fc" />
    </div>
  );
}

export function LiveFleetCard() {
  const { status, nodes } = useControlPlaneWs();
  const entries = Object.entries(nodes);
  const onlineCount = entries.filter(([, n]) => n.online).length;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Live fleet</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Real-time agent telemetry
          </h2>
        </div>
        <Badge variant={status === "open" ? "success" : "warning"}>
          {status === "open" ? `connected · ${onlineCount} online` : status}
        </Badge>
      </div>

      <div className="mt-6">
        {entries.length === 0 ? (
          <p className="text-sm leading-7 text-[var(--muted-foreground)]">
            No agents reporting yet. Install the agent on a node and it will appear here within seconds.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map(([nodeId, n]) => (
              <li
                key={nodeId}
                className="rounded-2xl border border-white/10 bg-[#08101d] p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Activity
                        className={`size-4 ${n.online ? "text-emerald-400" : "text-amber-400"}`}
                      />
                      {nodeId}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {n.containersRunning}/{n.containersTotal} containers · last seen{" "}
                      {new Date(n.lastSeen).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-cyan-200/80">
                    <span>CPU {n.cpu.toFixed(1)}%</span>
                    <span>RAM {n.ram.toFixed(1)}%</span>
                    <span>Disk {n.disk.toFixed(1)}%</span>
                  </div>
                </div>
                <NodeSparklines nodeId={nodeId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

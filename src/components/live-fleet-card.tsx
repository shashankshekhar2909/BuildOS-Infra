"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useControlPlaneWs } from "@/hooks/use-control-plane-ws";
import { useNodeMetrics } from "@/hooks/use-node-metrics";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";

type Node = {
  id: string;
  name: string;
  type: string;
  status: string;
};

function MeterBar({ value, accent }: { value: number; accent: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-full ${accent} transition-[width] duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function severityFor(value: number) {
  if (value >= 90) return "bg-red-500";
  if (value >= 75) return "bg-amber-400";
  return "bg-cyan-400";
}

function NodeCard({
  nodeId,
  meta,
  status,
  containersRunning,
  containersTotal,
  cpu,
  ram,
  disk,
  lastSeen
}: {
  nodeId: string;
  meta?: Node;
  status: boolean;
  containersRunning: number;
  containersTotal: number;
  cpu: number;
  ram: number;
  disk: number;
  lastSeen: string;
}) {
  const points = useNodeMetrics(nodeId, "1h", 15_000);
  const cpuSeries = points.map((p) => p.cpu_pct);
  const ramSeries = points.map((p) => p.ram_pct);
  const displayName = meta?.name ?? nodeId;
  const subText = meta ? meta.type : "unknown";

  return (
    <Link
      href={`/containers?node=${encodeURIComponent(nodeId)}`}
      className="group block min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#08101d] p-4 transition-colors hover:border-cyan-400/30 hover:bg-[#0a1424]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity
              className={`size-4 shrink-0 ${status ? "text-emerald-400" : "text-amber-400"}`}
            />
            <span className="truncate">{displayName}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-cyan-200/60">
            {subText} · {nodeId}
          </div>
        </div>
        <div className="text-right">
          <Badge variant={status ? "success" : "warning"}>
            {status ? "online" : "offline"}
          </Badge>
          <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
            {new Date(lastSeen).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-[var(--muted-foreground)]">
        <span className="font-[family-name:var(--font-mono)] text-cyan-200">
          {containersRunning}
        </span>
        /{containersTotal} containers running
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <Cpu className="size-3.5 text-cyan-200/80" /> CPU
            </span>
            <span className="font-[family-name:var(--font-mono)] text-slate-200">
              {cpu.toFixed(1)}%
            </span>
          </div>
          <MeterBar value={cpu} accent={severityFor(cpu)} />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <MemoryStick className="size-3.5 text-cyan-200/80" /> RAM
            </span>
            <span className="font-[family-name:var(--font-mono)] text-slate-200">
              {ram.toFixed(1)}%
            </span>
          </div>
          <MeterBar value={ram} accent={severityFor(ram)} />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <HardDrive className="size-3.5 text-cyan-200/80" /> DISK
            </span>
            <span className="font-[family-name:var(--font-mono)] text-slate-200">
              {disk.toFixed(1)}%
            </span>
          </div>
          <MeterBar value={disk} accent={severityFor(disk)} />
        </div>
      </div>

      {cpuSeries.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <span className="text-[10px] uppercase tracking-wider text-cyan-200/50">cpu</span>
            <Sparkline values={cpuSeries} width={90} height={20} stroke="#67e8f9" />
          </div>
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <span className="text-[10px] uppercase tracking-wider text-cyan-200/50">ram</span>
            <Sparkline values={ramSeries} width={90} height={20} stroke="#a5f3fc" />
          </div>
          <span className="hidden text-[10px] uppercase tracking-wider text-cyan-200/50 sm:inline">
            1h
          </span>
        </div>
      )}
    </Link>
  );
}

export function LiveFleetCard() {
  const { status, nodes } = useControlPlaneWs();
  const { token } = useAppAuth();
  const [meta, setMeta] = useState<Record<string, Node>>({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<Node[]>("/api/infra/nodes", { token });
        if (cancelled) return;
        const map: Record<string, Node> = {};
        for (const n of data) map[n.id] = n;
        setMeta(map);
      } catch {
        // ignore — meta is best-effort
      }
    }
    void load();
    const i = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [token]);

  const entries = Object.entries(nodes);
  const onlineCount = entries.filter(([, n]) => n.online).length;

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70 sm:text-xs">
            Live fleet
          </div>
          <h2 className="mt-1 text-lg font-semibold text-white sm:mt-2 sm:text-2xl">
            Real-time agent telemetry
          </h2>
        </div>
        <Badge variant={status === "open" ? "success" : "warning"}>
          {status === "open" ? `${onlineCount} online · ${entries.length} total` : status}
        </Badge>
      </div>

      <div className="mt-6">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#08101d] p-6 text-center">
            <p className="text-sm leading-7 text-[var(--muted-foreground)]">
              No agents reporting yet.
            </p>
            <Link
              href="/servers"
              className="mt-3 inline-flex items-center gap-1 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              Register a node →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map(([nodeId, n]) => (
              <NodeCard
                key={nodeId}
                nodeId={nodeId}
                meta={meta[nodeId]}
                status={n.online}
                containersRunning={n.containersRunning}
                containersTotal={n.containersTotal}
                cpu={n.cpu}
                ram={n.ram}
                disk={n.disk}
                lastSeen={n.lastSeen}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import {
  ContainerDetailDrawer,
  type ContainerRecord
} from "@/components/container-detail-drawer";

type Node = {
  id: string;
  name: string;
  status: string;
};

const STATE_GROUPS: { id: string; label: string; states: string[] }[] = [
  { id: "all", label: "All", states: [] },
  { id: "running", label: "Running", states: ["running"] },
  { id: "stopped", label: "Stopped", states: ["exited", "stopped", "dead"] },
  { id: "issues", label: "Issues", states: ["restarting", "error", "missing", "created"] }
];

export default function ContainersPage() {
  const { token } = useAppAuth();
  const searchParams = useSearchParams();
  const initialNode = searchParams?.get("node") ?? "all";
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [nodeFilter, setNodeFilter] = useState<string>(initialNode);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [groupByNode, setGroupByNode] = useState<boolean>(initialNode === "all");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [c, n] = await Promise.all([
        apiFetch<ContainerRecord[]>("/api/infra/containers", { token }),
        apiFetch<Node[]>("/api/infra/nodes", { token })
      ]);
      setContainers(c);
      setNodes(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const stateSet = new Set(
      STATE_GROUPS.find((g) => g.id === stateFilter)?.states ?? []
    );
    return containers.filter((c) => {
      if (nodeFilter !== "all" && c.node_id !== nodeFilter) return false;
      if (stateSet.size > 0 && !stateSet.has(c.state)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.node_id.toLowerCase().includes(q)
      );
    });
  }, [containers, filter, nodeFilter, stateFilter]);

  const grouped = useMemo(() => {
    if (!groupByNode) return null;
    const map = new Map<string, ContainerRecord[]>();
    for (const c of filtered) {
      const arr = map.get(c.node_id) ?? [];
      arr.push(c);
      map.set(c.node_id, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupByNode]);

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const selected = containers.find((c) => c.id === selectedId) ?? null;

  function renderCard(c: ContainerRecord) {
    return (
      <li key={c.id} className="min-w-0">
        <button
          type="button"
          onClick={() => setSelectedId(c.id)}
          className="block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#08101d] p-4 text-left transition-colors hover:border-cyan-400/30 hover:bg-[#0a1424]"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1 truncate text-base font-semibold text-white">
              {c.name}
            </div>
            <Badge
              variant={
                c.state === "running"
                  ? "success"
                  : c.state === "restarting"
                    ? "warning"
                    : "danger"
              }
              className="shrink-0"
            >
              {c.state}
            </Badge>
          </div>
          <div className="mt-1 truncate text-xs text-cyan-200/70 font-[family-name:var(--font-mono)]">
            {nodeName(c.node_id)}
          </div>
          <div className="mt-2 truncate font-[family-name:var(--font-mono)] text-xs text-[var(--muted-foreground)]">
            {c.image}
          </div>
          <div className="mt-3 flex min-w-0 items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
            {c.auto_heal === 1 ? (
              <span className="truncate text-emerald-400">auto-heal</span>
            ) : (
              <span className="truncate text-[var(--muted-foreground)]">manual</span>
            )}
            <span className="shrink-0 text-cyan-200/70">open →</span>
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Containers</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {filtered.length} of {containers.length} · refreshes every 5s
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={groupByNode}
              onChange={(e) => setGroupByNode(e.target.checked)}
              className="size-4"
            />
            group by server
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <Select value={nodeFilter} onValueChange={setNodeFilter}>
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-[var(--surface-2)] text-sm text-white">
              <SelectValue placeholder="All servers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All servers ({nodes.length})</SelectItem>
              {nodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name} · {n.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-[var(--surface-2)] text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, image, or node…"
          className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Flat grid (no grouping) */}
        {!groupByNode && (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(renderCard)}
            {filtered.length === 0 && (
              <li className="col-span-full rounded-2xl border border-white/10 bg-[#08101d] p-6 text-center text-sm text-[var(--muted-foreground)]">
                No containers match.
              </li>
            )}
          </ul>
        )}

        {/* Grouped by server */}
        {groupByNode && grouped && (
          <div className="mt-6 space-y-6">
            {grouped.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#08101d] p-6 text-center text-sm text-[var(--muted-foreground)]">
                No containers match.
              </div>
            )}
            {grouped.map(([nodeId, rows]) => {
              const node = nodes.find((n) => n.id === nodeId);
              const runningCount = rows.filter((r) => r.state === "running").length;
              return (
                <section key={nodeId}>
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-200">
                        {node?.name ?? nodeId}
                      </h3>
                      <Badge variant={node?.status === "online" ? "success" : "warning"}>
                        {node?.status ?? "?"}
                      </Badge>
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {runningCount}/{rows.length} running
                    </span>
                  </header>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map(renderCard)}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ContainerDetailDrawer
        container={selected}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    </div>
  );
}

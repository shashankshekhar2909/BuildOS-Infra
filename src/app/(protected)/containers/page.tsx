"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import {
  ContainerDetailDrawer,
  type ContainerRecord
} from "@/components/container-detail-drawer";

export default function ContainersPage() {
  const { token } = useAppAuth();
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ContainerRecord[]>("/api/infra/containers", { token });
      setContainers(data);
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
    if (!q) return containers;
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.node_id.toLowerCase().includes(q)
    );
  }, [containers, filter]);

  const selected = containers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Containers</h2>
          <span className="text-xs text-[var(--muted-foreground)]">refreshes every 5s</span>
        </div>

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, image, or node…"
          className="mt-4 h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="block w-full rounded-2xl border border-white/10 bg-[#08101d] p-4 text-left transition-colors hover:border-cyan-400/30 hover:bg-[#0a1424]"
              >
                <div className="flex items-start justify-between gap-2">
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
                  >
                    {c.state}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-xs text-cyan-200/70 font-[family-name:var(--font-mono)]">
                  {c.node_id}
                </div>
                <div className="mt-2 truncate font-[family-name:var(--font-mono)] text-xs text-[var(--muted-foreground)]">
                  {c.image}
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider">
                  {c.auto_heal === 1 ? (
                    <span className="text-emerald-400">auto-heal</span>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">manual</span>
                  )}
                  <span className="text-cyan-200/70">open →</span>
                </div>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="col-span-full rounded-2xl border border-white/10 bg-[#08101d] p-6 text-center text-sm text-[var(--muted-foreground)]">
              No containers match.
            </li>
          )}
        </ul>
      </div>

      <ContainerDetailDrawer
        container={selected}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    </div>
  );
}

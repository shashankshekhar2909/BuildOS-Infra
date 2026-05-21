"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import { ContainerLogTail } from "@/components/container-log-tail";

type Container = {
  id: string;
  node_id: string;
  name: string;
  image: string;
  state: string;
  status_text: string | null;
  auto_heal: number;
};

export default function ContainersPage() {
  const { token, user } = useAppAuth();
  const [containers, setContainers] = useState<Container[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Container[]>("/api/infra/containers", { token });
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

  async function control(id: string, action: "start" | "stop" | "restart") {
    try {
      await apiFetch(`/api/infra/containers/${id}/control`, {
        token,
        method: "POST",
        body: { action }
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "control failed");
    }
  }

  async function toggleHeal(id: string, enabled: boolean) {
    try {
      await apiFetch(`/api/infra/containers/${id}/auto-heal`, {
        token,
        method: "POST",
        body: { enabled }
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "toggle failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Containers</h2>
          <span className="text-xs text-[var(--muted-foreground)]">refreshes every 5s</span>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {containers.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-white">{c.name}</div>
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
              <div className="mt-1 text-xs text-cyan-200/70">{c.node_id}</div>
              <div className="mt-2 font-[family-name:var(--font-mono)] text-xs text-[var(--muted-foreground)]">
                {c.image}
              </div>
              {c.status_text && (
                <div className="mt-1 text-xs text-[var(--muted-foreground)]">{c.status_text}</div>
              )}

              {isAdmin && (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => control(c.id, "start")}>
                      start
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => control(c.id, "stop")}>
                      stop
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => control(c.id, "restart")}>
                      restart
                    </Button>
                    <Button
                      size="sm"
                      variant={expanded === c.id ? "secondary" : "outline"}
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    >
                      {expanded === c.id ? "hide logs" : "tail logs"}
                    </Button>
                  </div>
                  <label className="mt-4 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <input
                      type="checkbox"
                      checked={c.auto_heal === 1}
                      onChange={(e) => toggleHeal(c.id, e.target.checked)}
                    />
                    auto-heal on failure
                  </label>
                </>
              )}
              {expanded === c.id && (
                <ContainerLogTail
                  containerId={c.id}
                  nodeId={c.node_id}
                  containerName={c.name}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

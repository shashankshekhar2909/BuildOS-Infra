"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type PveGuest = {
  id: string;
  node_id: string;
  vmid: number;
  kind: "lxc" | "qemu";
  name: string;
  state: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  uptime_seconds: number;
};

export function PveGuestsPanel({ nodeId }: { nodeId: string }) {
  const { token, user } = useAppAuth();
  const [guests, setGuests] = useState<PveGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PveGuest[]>(
        `/api/infra/nodes/${nodeId}/pve-guests`,
        { token }
      );
      setGuests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [token, nodeId]);

  useEffect(() => {
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [load]);

  async function control(g: PveGuest, signal: "start" | "stop" | "reboot" | "shutdown") {
    if (signal === "stop" || signal === "shutdown") {
      if (!confirm(`${signal.toUpperCase()} ${g.kind} ${g.vmid} (${g.name})?`)) return;
    }
    setBusy(`${g.id}-${signal}`);
    setError(null);
    try {
      await apiFetch(
        `/api/infra/nodes/${nodeId}/pve-guests/${g.kind}/${g.vmid}/control`,
        { token, method: "POST", body: { signal } }
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "control failed");
    } finally {
      setBusy(null);
    }
  }

  if (guests.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">
          Proxmox guests ({guests.length})
        </div>
        <Badge variant="success">PVE</Badge>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {guests.map((g) => (
          <div key={g.id} className="rounded-xl border border-white/10 bg-[#08101d] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">
                    {g.kind}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-cyan-200">
                    {g.vmid}
                  </span>
                  <span className="truncate">{g.name}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                  CPU {g.cpu_pct.toFixed(0)}% · MEM {g.mem_pct.toFixed(0)}%
                  {g.kind === "lxc" ? ` · DISK ${g.disk_pct.toFixed(0)}%` : ""}
                  {g.uptime_seconds > 0
                    ? ` · up ${Math.floor(g.uptime_seconds / 3600)}h`
                    : ""}
                </div>
              </div>
              <Badge
                variant={
                  g.state === "running"
                    ? "success"
                    : g.state === "missing"
                      ? "warning"
                      : "danger"
                }
              >
                {g.state}
              </Badge>
            </div>
            {isAdmin && g.state !== "missing" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {g.state !== "running" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => control(g, "start")}
                  >
                    start
                  </Button>
                )}
                {g.state === "running" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => control(g, "reboot")}
                    >
                      reboot
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => control(g, "shutdown")}
                    >
                      shutdown
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => control(g, "stop")}
                    >
                      stop
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

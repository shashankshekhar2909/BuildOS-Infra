"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import { ContainerLogTail } from "@/components/container-log-tail";

export type ContainerRecord = {
  id: string;
  node_id: string;
  name: string;
  image: string;
  state: string;
  status_text: string | null;
  auto_heal: number;
};

type Props = {
  container: ContainerRecord | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export function ContainerDetailDrawer({ container, onClose, onChanged }: Props) {
  const { token, user } = useAppAuth();
  const isAdmin = user?.role === "admin";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  if (!container) {
    return <Drawer open={false} onClose={onClose} title="" />;
  }

  async function control(action: "start" | "stop" | "restart") {
    if (!container) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/infra/containers/${container.id}/control`, {
        token,
        method: "POST",
        body: { action }
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "control failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHeal(enabled: boolean) {
    if (!container) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/infra/containers/${container.id}/auto-heal`, {
        token,
        method: "POST",
        body: { enabled }
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "toggle failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{container.name}</span>
          <Badge
            variant={
              container.state === "running"
                ? "success"
                : container.state === "restarting"
                  ? "warning"
                  : "danger"
            }
          >
            {container.state}
          </Badge>
        </span>
      }
      subtitle={
        <span className="font-[family-name:var(--font-mono)]">
          {container.node_id} · {container.id.slice(0, 12)}
        </span>
      }
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Image</dt>
          <dd className="mt-0.5 break-all font-[family-name:var(--font-mono)] text-slate-200">
            {container.image}
          </dd>
        </div>
        {container.status_text && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Status</dt>
            <dd className="mt-0.5 text-slate-200">{container.status_text}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Node</dt>
          <dd className="mt-0.5 font-[family-name:var(--font-mono)] text-slate-200">
            {container.node_id}
          </dd>
        </div>
      </dl>

      {isAdmin && (
        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="text-xs uppercase tracking-wider text-cyan-200/60">Controls</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => control("start")} disabled={busy}>
              start
            </Button>
            <Button size="sm" variant="outline" onClick={() => control("stop")} disabled={busy}>
              stop
            </Button>
            <Button size="sm" variant="outline" onClick={() => control("restart")} disabled={busy}>
              restart
            </Button>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={container.auto_heal === 1}
              onChange={(e) => toggleHeal(e.target.checked)}
              className="size-4"
            />
            auto-heal on failure
          </label>
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-cyan-200/60">Live log tail</div>
          <Button
            size="sm"
            variant={showLogs ? "secondary" : "outline"}
            onClick={() => setShowLogs((s) => !s)}
          >
            {showLogs ? "stop" : "start"}
          </Button>
        </div>
        {showLogs && (
          <ContainerLogTail
            containerId={container.id}
            nodeId={container.node_id}
            containerName={container.name}
          />
        )}
      </div>
    </Drawer>
  );
}

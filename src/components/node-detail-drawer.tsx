"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import { PveGuestsPanel } from "@/components/pve-guests-panel";

export type NodeRecord = {
  id: string;
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
  status: string;
  agent_version: string;
  last_ping: string;
};

type NodeForm = {
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
};

type RegisterResponse = {
  success: true;
  node_id: string;
  secure_token: string;
  download_installer_cmd: string;
  ssh_installer_cmd: string;
};

type Props = {
  node: NodeRecord | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export function NodeDetailDrawer({ node, onClose, onChanged }: Props) {
  const { token, user } = useAppAuth();
  const isAdmin = user?.role === "admin";
  const [form, setForm] = useState<NodeForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<RegisterResponse | null>(null);

  useEffect(() => {
    if (!node) {
      setForm(null);
      setEditing(false);
      setRotated(null);
      setError(null);
      return;
    }
    setForm({
      name: node.name,
      type: node.type,
      provider: node.provider,
      ip_address: node.ip_address,
      region: node.region
    });
  }, [node]);

  if (!node || !form) {
    return <Drawer open={false} onClose={onClose} title="" />;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!node || !form) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/infra/nodes/${node.id}`, {
        token,
        method: "PATCH",
        body: form
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!node) return;
    if (!confirm(`Rotate token for ${node.id}? Current agent will be locked out until restarted.`))
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<RegisterResponse>(
        `/api/infra/nodes/${node.id}/regenerate-token`,
        { token, method: "POST" }
      );
      setRotated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "rotate failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!node) return;
    if (!confirm(`Delete node ${node.id}? This removes the node and its attached data.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/infra/nodes/${node.id}`, { token, method: "DELETE" });
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
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
          <span className="truncate">{node.name}</span>
          <Badge variant={node.status === "online" ? "success" : "warning"}>
            {node.status}
          </Badge>
        </span>
      }
      subtitle={
        <span className="font-[family-name:var(--font-mono)]">{node.id}</span>
      }
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!editing && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Type</dt>
            <dd className="mt-0.5 text-slate-200">{node.type}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Provider</dt>
            <dd className="mt-0.5 text-slate-200">{node.provider}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">IP</dt>
            <dd className="mt-0.5 font-[family-name:var(--font-mono)] text-slate-200">
              {node.ip_address}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Region</dt>
            <dd className="mt-0.5 text-slate-200">{node.region}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Agent version</dt>
            <dd className="mt-0.5 text-slate-200">{node.agent_version}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-cyan-200/60">Last ping</dt>
            <dd className="mt-0.5 text-slate-200">
              {new Date(node.last_ping).toLocaleString()}
            </dd>
          </div>
        </dl>
      )}

      {editing && (
        <form onSubmit={save} className="space-y-3">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          >
            <option>VPS</option>
            <option>HOMELAB</option>
            <option>PROXMOX</option>
          </select>
          <input
            required
            placeholder="Provider"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          <input
            required
            placeholder="IP address"
            value={form.ip_address}
            onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          <input
            required
            placeholder="Region"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isAdmin && !editing && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            edit
          </Button>
          <Button size="sm" variant="outline" onClick={rotate} disabled={busy}>
            rotate token
          </Button>
          <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
            delete
          </Button>
        </div>
      )}

      {rotated && (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs">
          <div className="font-semibold text-white">New token (shown once)</div>
          <code className="mt-2 block break-all font-[family-name:var(--font-mono)] text-emerald-100">
            {rotated.secure_token}
          </code>
          <div className="mt-3 break-all rounded-xl border border-emerald-400/30 bg-[#04140d] p-2 font-[family-name:var(--font-mono)] text-emerald-100">
            {rotated.download_installer_cmd}
          </div>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(rotated.download_installer_cmd)}
          >
            Copy install command
          </Button>
        </div>
      )}

      {node.type === "PROXMOX" && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <PveGuestsPanel nodeId={node.id} />
        </div>
      )}
    </Drawer>
  );
}

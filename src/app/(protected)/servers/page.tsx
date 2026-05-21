"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";
import { NodeDetailDrawer, type NodeRecord } from "@/components/node-detail-drawer";

type RegisterResponse = {
  success: true;
  node_id: string;
  secure_token: string;
  download_installer_cmd: string;
  ssh_installer_cmd: string;
};

type NodeForm = {
  name: string;
  type: string;
  provider: string;
  ip_address: string;
  region: string;
};

export default function ServersPage() {
  const { token, user } = useAppAuth();
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NodeForm>({
    name: "",
    type: "VPS",
    provider: "DigitalOcean",
    ip_address: "",
    region: ""
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<RegisterResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<NodeRecord[]>("/api/infra/nodes", { token });
      setNodes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [load, token]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await apiFetch<RegisterResponse>("/api/infra/nodes/register", {
        token,
        method: "POST",
        body: form
      });
      setCreated(res);
      setForm({ name: "", type: "VPS", provider: "DigitalOcean", ip_address: "", region: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "register failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Servers</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {nodes.length} node{nodes.length === 1 ? "" : "s"} · tap a row for details
            </p>
          </div>
          <Badge>fleet</Badge>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setSelectedId(n.id)}
                className="block w-full rounded-2xl border border-white/10 bg-[#08101d] p-4 text-left transition-colors hover:border-cyan-400/30 hover:bg-[#0a1424]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{n.name}</div>
                    <div className="truncate text-xs text-cyan-200/60 font-[family-name:var(--font-mono)]">
                      {n.id}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs uppercase tracking-wider text-cyan-200/60 sm:inline">
                      {n.type}
                    </span>
                    <Badge variant={n.status === "online" ? "success" : "warning"}>
                      {n.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)] sm:grid-cols-4">
                  <div className="truncate">{n.provider}</div>
                  <div className="truncate font-[family-name:var(--font-mono)]">{n.ip_address}</div>
                  <div className="truncate">{n.region}</div>
                  <div className="truncate">v{n.agent_version}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
        <form
          onSubmit={register}
          className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h3 className="text-lg font-semibold text-white">Register new node</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Name (e.g., vps-nyc-02)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
            />
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-[var(--surface-2)] text-sm text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VPS">VPS</SelectItem>
                <SelectItem value="HOMELAB">HOMELAB</SelectItem>
                <SelectItem value="PROXMOX">PROXMOX</SelectItem>
              </SelectContent>
            </Select>
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
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white sm:col-span-2"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? "Registering…" : "Register"}
          </Button>
        </form>
      )}

      {created && (
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white">Node registered: {created.node_id}</h3>
          <p className="mt-2 text-sm text-emerald-100">
            Copy the install command below. The token will not be shown again.
          </p>
          <div className="mt-3 break-all rounded-2xl border border-emerald-400/30 bg-[#04140d] p-3 font-[family-name:var(--font-mono)] text-xs text-emerald-100">
            {created.download_installer_cmd}
          </div>
          <p className="mt-4 text-xs text-emerald-200/80">SSH paste:</p>
          <div className="mt-2 break-all rounded-2xl border border-emerald-400/30 bg-[#04140d] p-3 font-[family-name:var(--font-mono)] text-xs text-emerald-100">
            {created.ssh_installer_cmd}
          </div>
          <p className="mt-2 text-xs text-emerald-200/80">
            Token: <code>{created.secure_token}</code>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(created.download_installer_cmd)}
            >
              Copy local command
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(created.ssh_installer_cmd)}
            >
              Copy SSH command
            </Button>
          </div>
        </div>
      )}

      <NodeDetailDrawer
        node={selected}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    </div>
  );
}

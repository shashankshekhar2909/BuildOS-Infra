"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type Node = {
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

type RegisterResponse = {
  success: true;
  node_id: string;
  secure_token: string;
  download_installer_cmd: string;
};

export default function ServersPage() {
  const { token, user } = useAppAuth();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "VPS",
    provider: "DigitalOcean",
    ip_address: "",
    region: ""
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<RegisterResponse | null>(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Node[]>("/api/infra/nodes", { token });
      setNodes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const i = setInterval(load, 5_000);
    return () => clearInterval(i);
  }, [load]);

  async function rotateToken(id: string) {
    if (!confirm(`Rotate token for ${id}? The current agent will be locked out until it is restarted with the new token.`)) return;
    setError(null);
    try {
      const res = await apiFetch<RegisterResponse>(
        `/api/infra/nodes/${id}/regenerate-token`,
        { token, method: "POST" }
      );
      setCreated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "rotate failed");
    }
  }

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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Servers</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {nodes.length} node{nodes.length === 1 ? "" : "s"} · refreshes every 5s
            </p>
          </div>
          <Badge>fleet</Badge>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {nodes.map((n) => (
            <div
              key={n.id}
              className="grid gap-3 rounded-2xl border border-white/10 bg-[#08101d] p-4 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto_auto]"
            >
              <div>
                <div className="font-medium text-white">{n.name}</div>
                <div className="text-xs text-cyan-200/60 font-[family-name:var(--font-mono)]">{n.id}</div>
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {n.provider} · {n.type}
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">{n.ip_address}</div>
              <div className="text-sm text-[var(--muted-foreground)]">{n.region}</div>
              <div className="md:text-right">
                <Badge variant={n.status === "online" ? "success" : "warning"}>{n.status}</Badge>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => rotateToken(n.id)}>
                  rotate token
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <form
          onSubmit={register}
          className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h3 className="text-lg font-semibold text-white">Register new node</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              placeholder="Name (e.g., vps-nyc-02)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            >
              <option>VPS</option>
              <option>HOMELAB</option>
              <option>PROXMOX</option>
            </select>
            <input
              required
              placeholder="Provider (DigitalOcean, Hetzner, Self-Hosted…)"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
            <input
              required
              placeholder="IP address"
              value={form.ip_address}
              onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
            <input
              required
              placeholder="Region (e.g., us-east, home-office)"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Registering…" : "Register"}
          </Button>
        </form>
      )}

      {created && (
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-6">
          <h3 className="text-lg font-semibold text-white">Node registered: {created.node_id}</h3>
          <p className="mt-2 text-sm text-emerald-100">
            Copy the install command below. The token will not be shown again.
          </p>
          <div className="mt-3 break-all rounded-2xl border border-emerald-400/30 bg-[#04140d] p-3 font-[family-name:var(--font-mono)] text-xs text-emerald-100">
            {created.download_installer_cmd}
          </div>
          <p className="mt-2 text-xs text-emerald-200/80">
            Token: <code>{created.secure_token}</code>
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(created.download_installer_cmd)}
          >
            Copy install command
          </Button>
        </div>
      )}
    </div>
  );
}

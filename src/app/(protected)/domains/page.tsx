"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type DnsRecord = {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxied: number;
  ttl: number;
  updated_at: string;
};

type DnsResponse = {
  source: "cloudflare" | "cache";
  configured: boolean;
  records: DnsRecord[];
};

export default function DomainsPage() {
  const { token, user } = useAppAuth();
  const [data, setData] = useState<DnsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", type: "CNAME", content: "", proxied: true });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DnsResponse>("/api/cloudflare/dns", { token });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/cloudflare/dns", { token, method: "POST", body: form });
      setForm({ name: "", type: "CNAME", content: "", proxied: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete DNS record ${id}?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/cloudflare/dns/${id}`, { token, method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Domains</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Cloudflare DNS records synced through the master backend.
            </p>
          </div>
          <Badge variant={data?.source === "cloudflare" ? "success" : "warning"}>
            {data?.configured ? data.source : "unconfigured"}
          </Badge>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          {loading && <div className="bg-[#08101d] px-4 py-4 text-sm text-[var(--muted-foreground)]">Loading…</div>}
          {!loading && (data?.records.length ?? 0) === 0 && (
            <div className="bg-[#08101d] px-4 py-4 text-sm text-[var(--muted-foreground)]">
              No records.
            </div>
          )}
          {!loading &&
            data?.records.map((r) => (
              <div
                key={r.id}
                className="grid gap-3 border-b border-white/10 bg-[#08101d] px-4 py-4 last:border-b-0 md:grid-cols-[1.3fr_0.6fr_1.2fr_auto_auto]"
              >
                <div className="font-medium text-white">{r.name}</div>
                <div className="text-xs uppercase text-cyan-200/80">{r.type}</div>
                <div className="font-[family-name:var(--font-mono)] text-sm text-[var(--muted-foreground)]">
                  {r.content}
                </div>
                <Badge variant={r.proxied ? "success" : "warning"}>
                  {r.proxied ? "proxied" : "dns-only"}
                </Badge>
                {isAdmin && (
                  <Button variant="outline" onClick={() => handleDelete(r.id)}>
                    delete
                  </Button>
                )}
              </div>
            ))}
        </div>
      </div>

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6"
        >
          <h3 className="text-lg font-semibold text-white">Add DNS record</h3>
          <div className="grid gap-3 md:grid-cols-[1.5fr_0.6fr_1.5fr_auto]">
            <input
              required
              placeholder="api.example.com"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            >
              <option>CNAME</option>
              <option>A</option>
              <option>AAAA</option>
              <option>TXT</option>
            </select>
            <input
              required
              placeholder="tunnel.cfargotunnel.com"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={form.proxied}
                onChange={(e) => setForm({ ...form, proxied: e.target.checked })}
              />
              proxied
            </label>
          </div>
          <Button type="submit" disabled={submitting || !data?.configured}>
            {submitting ? "Creating…" : "Create record"}
          </Button>
          {!data?.configured && (
            <p className="text-xs text-amber-300">
              Set <code>CLOUDFLARE_API_TOKEN</code> + <code>CLOUDFLARE_ZONE_ID</code> in the backend
              env to enable writes.
            </p>
          )}
        </form>
      )}
    </div>
  );
}

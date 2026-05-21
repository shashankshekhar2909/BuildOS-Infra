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
  zones: Zone[];
  active_zone?: Zone;
  records: DnsRecord[];
};

type Zone = {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type ZonesResponse = {
  configured: boolean;
  zones: Zone[];
};

type ZoneCheckResult = {
  success: true;
  zone: Zone;
};

type ZoneStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "accessible" }
  | { state: "blocked"; message: string }
  | { state: "error"; message: string };

export default function DomainsPage() {
  const { token, user } = useAppAuth();
  const [data, setData] = useState<DnsResponse | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [zoneStatus, setZoneStatus] = useState<Record<string, ZoneStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ id: "", name: "" });
  const [form, setForm] = useState({ name: "", type: "CNAME", content: "", proxied: true });
  const [submitting, setSubmitting] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  const isAdmin = user?.role === "admin";

  function setZoneState(zoneId: string, next: ZoneStatus) {
    setZoneStatus((current) => ({ ...current, [zoneId]: next }));
  }

  const checkZone = useCallback(
    async (zoneId: string) => {
      if (!token || !zoneId) return;
      setZoneState(zoneId, { state: "checking" });
      try {
        await apiFetch<ZoneCheckResult>(`/api/cloudflare/zones/${zoneId}/check`, { token });
        setZoneState(zoneId, { state: "accessible" });
      } catch (e) {
        const status = e instanceof Error ? (e as Error & { status?: number }).status : undefined;
        const message = e instanceof Error ? e.message : "Zone check failed";
        if (status === 401 || status === 403) {
          setZoneState(zoneId, {
            state: "blocked",
            message: "Cloudflare token cannot access this zone"
          });
        } else {
          setZoneState(zoneId, { state: "error", message });
        }
      }
    },
    [token]
  );

  const loadZones = useCallback(async () => {
    if (!token) return;
    setZoneError(null);
    try {
      const res = await apiFetch<ZonesResponse>("/api/cloudflare/zones", { token });
      setZones(res.zones);
      for (const zone of res.zones) {
        setZoneState(zone.id, { state: "idle" });
      }
      if (!selectedZoneId && res.zones[0]?.id) {
        setSelectedZoneId(res.zones[0].id);
      }
      void Promise.all(res.zones.map((zone) => checkZone(zone.id)));
    } catch (e) {
      setZoneError(e instanceof Error ? e.message : "Failed to load zones");
    }
  }, [checkZone, selectedZoneId, token]);

  const load = useCallback(async (zoneId: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : "";
      const res = await apiFetch<DnsResponse>(`/api/cloudflare/dns${query}`, { token });
      setData(res);
      setZones(res.zones);
      if (!selectedZoneId && res.active_zone?.id) {
        setSelectedZoneId(res.active_zone.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, token]);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  useEffect(() => {
    if (!token) return;
    if (!selectedZoneId) return;
    void load(selectedZoneId);
  }, [load, selectedZoneId, token]);

  async function handleAddZone(e: React.FormEvent) {
    e.preventDefault();
    setSavingZone(true);
    setZoneError(null);
    try {
      await apiFetch("/api/cloudflare/zones", {
        token,
        method: "POST",
        body: zoneForm
      });
      setZoneForm({ id: "", name: "" });
      await loadZones();
      await checkZone(zoneForm.id);
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : "Save zone failed");
    } finally {
      setSavingZone(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/cloudflare/dns", {
        token,
        method: "POST",
        body: { ...form, zone_id: selectedZoneId }
      });
      setForm({ name: "", type: "CNAME", content: "", proxied: true });
      await load(selectedZoneId);
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
      await load(selectedZoneId);
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
              Cloudflare DNS records synced through the master backend. Pick a zone, then add or
              edit records.
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

        {zoneError && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {zoneError}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedZoneId}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          >
            {zones.length === 0 && <option value="">No zones configured</option>}
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} · {zone.id}
              </option>
            ))}
          </select>
          {selectedZoneId && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08101d] px-3 text-xs text-cyan-100">
              <span>
                Active zone: {zones.find((zone) => zone.id === selectedZoneId)?.name ?? selectedZoneId}
              </span>
              <Button
                size="sm"
                variant="outline"
              onClick={() => void checkZone(selectedZoneId)}
              className="h-8 px-2 text-[11px]"
              type="button"
            >
                check
              </Button>
            </div>
          )}
        </div>

        {!token && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Login required. Refresh after sign-in if the page loaded before auth was ready.
          </div>
        )}

        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-[#08101d] p-3">
            <div className="mb-2 text-xs uppercase tracking-wider text-cyan-200/70">
              Cloudflare access
            </div>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => {
                const status = zoneStatus[zone.id] ?? { state: "idle" };
                const label =
                  status.state === "checking"
                    ? "checking"
                    : status.state === "accessible"
                      ? "accessible"
                      : status.state === "blocked"
                        ? "blocked"
                        : status.state === "error"
                          ? "error"
                          : "idle";
                const variant =
                  status.state === "accessible"
                    ? "success"
                    : status.state === "blocked" || status.state === "error"
                      ? "warning"
                      : "default";
                return (
                  <Badge key={zone.id} variant={variant}>
                    {zone.name}: {label}
                  </Badge>
                );
              })}
              {zones.length === 0 && <Badge variant="warning">no zones</Badge>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10">
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
                className="border-b border-white/10 bg-[#08101d] px-4 py-4 last:border-b-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{r.name}</span>
                      <span className="text-xs uppercase text-cyan-200/80">{r.type}</span>
                    </div>
                    <div className="mt-1 break-all font-[family-name:var(--font-mono)] text-xs text-[var(--muted-foreground)]">
                      {r.content}
                    </div>
                  </div>
                  <Badge variant={r.proxied ? "success" : "warning"}>
                    {r.proxied ? "proxied" : "dns-only"}
                  </Badge>
                </div>
                {isAdmin && (
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => handleDelete(r.id)}>
                      delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h3 className="text-lg font-semibold text-white">Add DNS record</h3>
          {!selectedZoneId && (
            <p className="text-xs text-amber-300">
              Add a zone first, or seed one in `.env`.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="api.example.com"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
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
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] sm:col-span-2">
              <input
                type="checkbox"
                checked={form.proxied}
                onChange={(e) => setForm({ ...form, proxied: e.target.checked })}
                className="size-4"
              />
              proxied through Cloudflare
            </label>
          </div>
          <Button
            type="submit"
            disabled={submitting || !selectedZoneId || !data?.configured}
            className="w-full sm:w-auto"
          >
            {submitting ? "Creating…" : "Create record"}
          </Button>
          {!data?.configured && (
            <p className="text-xs text-amber-300">
              Set <code>CLOUDFLARE_API_TOKEN</code> and at least one zone in the backend env to
              enable writes.
            </p>
          )}
        </form>
      )}

      {isAdmin && (
        <form
          onSubmit={handleAddZone}
          className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h3 className="text-lg font-semibold text-white">Add zone later</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Add another Cloudflare zone without redeploying. Token must already have access.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Zone name, e.g. example.com"
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
            />
            <input
              required
              placeholder="Zone ID"
              value={zoneForm.id}
              onChange={(e) => setZoneForm({ ...zoneForm, id: e.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
            />
          </div>
          <Button type="submit" disabled={savingZone} className="w-full sm:w-auto">
            {savingZone ? "Saving…" : "Save zone"}
          </Button>
          <div className="text-xs text-[var(--muted-foreground)]">
            After save, status will switch to accessible, blocked, or error.
          </div>
        </form>
      )}
    </div>
  );
}

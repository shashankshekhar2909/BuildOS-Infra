"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type HealthResponse = {
  status: string;
  phase: string;
  emergency_lockdown: boolean;
  cloudflare: string;
};

export default function EmergencyPage() {
  const { token, user } = useAppAuth();
  const [locked, setLocked] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"idle" | "confirm" | "keyphrase">("idle");
  const [keyphrase, setKeyphrase] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      const h = await apiFetch<HealthResponse>("/api/status", { token });
      setLocked(h.emergency_lockdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : "health failed");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function trigger() {
    if (!checked || keyphrase !== "FORCE KILL") {
      setError("Confirm checkbox + type 'FORCE KILL' exactly.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/infra/emergency-kill", {
        token,
        method: "POST",
        body: { confirmed: true, auth_keyphrase: "FORCE KILL" }
      });
      setPhase("idle");
      setKeyphrase("");
      setChecked(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lockdown failed");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!confirm("Release emergency lockdown?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/infra/emergency-reset", { token, method: "POST" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section
        className={`rounded-3xl border p-6 ${
          locked ? "border-red-500/40 bg-red-500/10" : "border-red-400/20 bg-red-500/[0.05]"
        }`}
      >
        <Badge variant={locked ? "danger" : "warning"}>
          {locked ? "LOCKED" : "armed"}
        </Badge>
        <h2 className="mt-4 text-2xl font-semibold text-white">Emergency controls</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          Triggering this rejects all container start/stop/restart commands and Cloudflare DNS
          mutations until an admin releases the lock.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!isAdmin && <p className="mt-6 text-sm text-amber-300">Admin role required.</p>}

        {isAdmin && locked && (
          <div className="mt-6">
            <Button variant="secondary" onClick={release} disabled={busy}>
              {busy ? "Releasing…" : "Release lockdown"}
            </Button>
          </div>
        )}

        {isAdmin && !locked && phase === "idle" && (
          <div className="mt-6">
            <Button variant="destructive" onClick={() => setPhase("confirm")}>
              Trigger emergency kill
            </Button>
          </div>
        )}

        {isAdmin && !locked && phase === "confirm" && (
          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1"
              />
              <span>
                I verify that triggering this will reject container control and DNS changes until I
                manually release the lock.
              </span>
            </label>
            <div className="flex gap-3">
              <Button variant="destructive" disabled={!checked} onClick={() => setPhase("keyphrase")}>
                Continue
              </Button>
              <Button variant="outline" onClick={() => setPhase("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isAdmin && !locked && phase === "keyphrase" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-200">
              Type <code className="text-red-300">FORCE KILL</code> exactly.
            </p>
            <input
              autoFocus
              value={keyphrase}
              onChange={(e) => setKeyphrase(e.target.value)}
              placeholder="FORCE KILL"
              className="w-full rounded-xl border border-red-400/40 bg-[#08101d] px-3 py-2 text-sm font-mono text-white"
            />
            <div className="flex gap-3">
              <Button variant="destructive" disabled={busy || keyphrase !== "FORCE KILL"} onClick={trigger}>
                {busy ? "Locking down…" : "Engage lockdown"}
              </Button>
              <Button variant="outline" onClick={() => setPhase("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h3 className="text-lg font-semibold text-white">What lockdown does</h3>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-foreground)]">
          <li>Rejects all container start/stop/restart commands (HTTP 423).</li>
          <li>Rejects Cloudflare DNS create/delete operations.</li>
          <li>Broadcasts <code>EMERGENCY_LOCKDOWN</code> over the control-plane WebSocket.</li>
          <li>Persisted in <code>system_state</code>; survives backend restart.</li>
          <li>Only an admin can release it.</li>
        </ul>
      </section>
    </div>
  );
}

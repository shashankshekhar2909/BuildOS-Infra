"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { useLogStream } from "@/hooks/use-log-stream";
import { apiFetch } from "@/lib/api";

const TYPE_COLOR: Record<string, string> = {
  info: "text-cyan-200/80",
  warning: "text-amber-300",
  error: "text-red-300",
  critical: "text-red-200 font-semibold"
};

export function LogStreamCard() {
  const { token } = useAppAuth();
  const rows = useLogStream();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [diagnose, setDiagnose] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  async function diagnoseRecent() {
    setBusy(true);
    setError(null);
    setDiagnose(null);
    try {
      const recent = rows.slice(-50).map((r) =>
        `${r.timestamp} [${r.log_type.toUpperCase()}] ${r.source}: ${r.message}`
      ).join("\n");
      const res = await apiFetch<{ response: string }>("/api/gemini/diagnose", {
        token,
        method: "POST",
        body: {
          prompt: "Diagnose the most recent control-plane events. Flag anomalies + next actions.",
          logs: recent
        }
      });
      setDiagnose(res.response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Live logs</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Control-plane event stream</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success">{rows.length} events</Badge>
          <Button size="sm" onClick={diagnoseRecent} disabled={busy || rows.length === 0}>
            {busy ? "Diagnosing…" : "Diagnose last 50"}
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 h-80 overflow-y-auto rounded-2xl border border-white/10 bg-[#040810] p-3 font-[family-name:var(--font-mono)] text-xs"
      >
        {rows.length === 0 ? (
          <div className="text-[var(--muted-foreground)]">Waiting for events…</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className={`whitespace-pre-wrap ${TYPE_COLOR[r.log_type] ?? "text-slate-200"}`}>
              <span className="text-[var(--muted-foreground)]">
                {new Date(r.timestamp).toLocaleTimeString()}
              </span>{" "}
              <span className="uppercase">[{r.log_type}]</span>{" "}
              <span className="text-cyan-300/80">{r.source}</span>: {r.message}
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {diagnose && (
        <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm leading-7 whitespace-pre-wrap text-slate-100">
          <div className="mb-2 text-xs uppercase tracking-[0.24em] text-cyan-200/70">
            Gemini diagnosis
          </div>
          {diagnose}
        </div>
      )}
    </div>
  );
}

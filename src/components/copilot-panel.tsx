"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type DiagnoseResponse = {
  success: boolean;
  response: string;
};

export function CopilotPanel() {
  const { token } = useAppAuth();
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const res = await apiFetch<DiagnoseResponse>("/api/gemini/diagnose", {
        token,
        method: "POST",
        body: { prompt, logs: logs || undefined }
      });
      setReply(res.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnose failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70 sm:text-xs">AI co-pilot</div>
          <h2 className="mt-1 text-lg font-semibold text-white sm:mt-2 sm:text-2xl">Diagnose with Gemini</h2>
        </div>
        <Badge variant="success">server-side</Badge>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3 sm:mt-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What's wrong with the cluster?"
          rows={3}
          maxLength={4000}
          className="w-full rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 text-sm text-white"
        />
        <textarea
          value={logs}
          onChange={(e) => setLogs(e.target.value)}
          placeholder="Paste recent logs (optional, max ~8 KB used)"
          rows={4}
          className="w-full rounded-xl border border-white/10 bg-[#08101d] px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-[var(--muted-foreground)]"
        />
        <Button type="submit" disabled={busy || !prompt.trim()} className="w-full sm:w-auto">
          {busy ? "Diagnosing…" : "Ask Gemini"}
        </Button>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {reply && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#08101d] p-4 text-sm leading-7 text-slate-100 whitespace-pre-wrap">
          {reply}
        </div>
      )}
    </div>
  );
}

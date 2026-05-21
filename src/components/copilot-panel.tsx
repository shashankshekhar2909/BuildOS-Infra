"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type DiagnoseResponse = {
  success: boolean;
  response: string;
};

const QUICK_PROMPTS = [
  { label: "What's broken?", value: "What's currently broken or degraded across the fleet? Cite the offending node/container." },
  { label: "Why offline?", value: "Why is a node offline? Look at recent heartbeats and disconnect events." },
  { label: "Restart loop?", value: "Find containers in a restart loop. Suggest root cause." },
  { label: "Resource hot spots", value: "Which nodes are CPU/RAM/disk saturated? Recommend rebalancing." }
];

export function CopilotPanel() {
  const { token } = useAppAuth();
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runDiagnose(promptText: string) {
    if (!promptText.trim()) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const res = await apiFetch<DiagnoseResponse>("/api/gemini/diagnose", {
        token,
        method: "POST",
        body: { prompt: promptText, logs: logs || undefined }
      });
      setReply(res.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnose failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    await runDiagnose(prompt);
  }

  function runQuick(value: string) {
    setPrompt(value);
    void runDiagnose(value);
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-cyan-200" />
        <h2 className="text-base font-semibold text-white sm:text-lg">AI co-pilot</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Ask Gemini about the cluster. Logs are auto-attached server-side.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => runQuick(q.value)}
            disabled={busy}
            className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10 disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-cyan-200/70">
            Your question
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. why is vps-01 spiking CPU?"
            rows={3}
            maxLength={4000}
            className="block w-full min-w-0 max-w-full resize-y rounded-xl border border-white/10 bg-[var(--surface-2)] px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[var(--surface-2)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)] hover:text-white"
        >
          <span>{showLogs ? "Hide" : "Add"} extra log context (optional)</span>
          {showLogs ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showLogs && (
          <textarea
            value={logs}
            onChange={(e) => setLogs(e.target.value)}
            placeholder="Paste recent logs (max ~8 KB used)"
            rows={5}
            className="block w-full min-w-0 max-w-full resize-y rounded-xl border border-white/10 bg-[var(--surface-2)] px-3 py-2.5 font-[family-name:var(--font-mono)] text-xs text-slate-300 placeholder:text-slate-600 focus:border-cyan-300/40 focus:outline-none"
          />
        )}

        <Button
          type="submit"
          disabled={busy || !prompt.trim()}
          size="lg"
          className="w-full"
        >
          {busy ? "Diagnosing…" : "Ask Gemini"}
        </Button>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {reply && (
        <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm leading-7 text-slate-100">
          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {reply}
          </div>
        </div>
      )}
    </div>
  );
}

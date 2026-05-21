"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type User = {
  id: number;
  username: string;
  role: "admin" | "viewer";
  created_at: string;
  updated_at: string;
};

export default function AccountPage() {
  const { token, user, signOut } = useAppAuth();
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    if (!token) return;
    apiFetch<User>("/api/auth/me", { token })
      .then((u) => setMe(u))
      .catch(() => undefined);
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (form.next !== form.confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (form.next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (!me?.id) {
      setError("User id unknown; ask an admin to set it.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/users/${me.id}/password`, {
        token,
        method: "PATCH",
        body: { current_password: form.current, new_password: form.next }
      });
      setDone(true);
      setForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-white">Account</h2>
        {user && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-200">
            <span className="font-[family-name:var(--font-mono)]">{user.id}</span>
            <Badge variant={user.role === "admin" ? "success" : "warning"}>
              {user.role}
            </Badge>
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
      >
        <h3 className="text-lg font-semibold text-white">Change password</h3>
        {!me && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Loading your account…
          </div>
        )}
        <input
          required
          type="password"
          placeholder="current password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />
        <input
          required
          minLength={8}
          type="password"
          placeholder="new password (>=8 chars)"
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />
        <input
          required
          minLength={8}
          type="password"
          placeholder="confirm new password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            Password updated. Your current session stays valid until expiry; sign out + back in
            anyway to test.
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !me}>
            {busy ? "Updating…" : "Update password"}
          </Button>
          <Button type="button" variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}

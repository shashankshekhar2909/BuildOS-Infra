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
  const { token, user, replaceSession, signOut } = useAppAuth();
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);
  const [usernameDone, setUsernameDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ next: "", confirm: "" });
  const [usernameForm, setUsernameForm] = useState({ next: "" });

  useEffect(() => {
    if (!token) return;
    apiFetch<User>("/api/auth/me", { token })
      .then((u) => setMe(u))
      .catch(() => undefined);
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordDone(false);
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
        body: { new_password: form.next }
      });
      setPasswordDone(true);
      setForm({ next: "", confirm: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUsernameDone(false);
    if (usernameForm.next.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!me?.id) {
      setError("User id unknown; ask an admin to set it.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch<{
        success: boolean;
        token?: string;
        token_type?: string;
        expires_in?: number;
        user?: {
          id: string;
          name: string;
          email: string;
          role: "admin" | "viewer";
          roles: Array<"admin" | "viewer">;
        };
      }>(`/api/users/${me.id}/username`, {
        token,
        method: "PATCH",
        body: { username: usernameForm.next }
      });
      if (response.token && response.user && response.expires_in) {
        replaceSession({
          token: response.token,
          tokenType: "Bearer",
          expiresAt: Date.now() + response.expires_in * 1000,
          user: {
            ...response.user,
            initials: response.user.name
              ? response.user.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              : response.user.email.slice(0, 2).toUpperCase()
          }
        });
      }
      setUsernameDone(true);
      setUsernameForm({ next: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-6">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={submitUsername}
          className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h3 className="text-lg font-semibold text-white">Change username</h3>
          {!me && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Loading your account…
            </div>
          )}
          <input
            required
            minLength={3}
            maxLength={64}
            type="text"
            placeholder="new username"
            value={usernameForm.next}
            onChange={(e) => setUsernameForm({ next: e.target.value })}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          {usernameDone && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Username updated. Session refreshed.
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !me}>
              {busy ? "Updating…" : "Update username"}
            </Button>
          </div>
        </form>

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
            minLength={8}
            type="password"
            placeholder="new password (>=8 chars)"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          <input
            required
            minLength={8}
            type="password"
            placeholder="confirm new password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          {passwordDone && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Password updated. Sign out + back in to verify.
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

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

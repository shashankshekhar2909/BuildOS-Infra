"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useAppAuth } from "@/components/auth/auth-provider";
import { apiFetch } from "@/lib/api";

type User = {
  id: number;
  username: string;
  role: "admin" | "viewer";
  created_at: string;
  updated_at: string;
};

type DrawerMode =
  | { kind: "create" }
  | { kind: "edit"; user: User }
  | { kind: "password"; user: User };

export default function UsersPage() {
  const { token, user: me } = useAppAuth();
  const isAdmin = me?.role === "admin";
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<User[]>("/api/users", { token });
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [token]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [load, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-6">
        <h2 className="text-xl font-semibold text-white">Users</h2>
        <p className="mt-2 text-sm text-amber-200">
          Admin role required to view user management.
        </p>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Change your own password at <Link className="text-cyan-300 underline" href="/account">/account</Link>.
        </p>
      </div>
    );
  }

  async function changeRole(u: User, role: "admin" | "viewer") {
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}/role`, {
        token,
        method: "PATCH",
        body: { role }
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "role update failed");
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete user '${u.username}'?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/users/${u.id}`, { token, method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Users</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {users.length} operator{users.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button onClick={() => setDrawer({ kind: "create" })}>+ Add user</Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="rounded-2xl border border-white/10 bg-[#08101d] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <span className="truncate">{u.username}</span>
                    <Badge variant={u.role === "admin" ? "success" : "warning"}>
                      {u.role}
                    </Badge>
                    {me?.id === u.username && (
                      <Badge variant="default">you</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                    created {new Date(u.created_at).toLocaleDateString()} · updated{" "}
                    {new Date(u.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDrawer({ kind: "password", user: u })}
                  >
                    set password
                  </Button>
                  {u.role === "viewer" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeRole(u, "admin")}
                    >
                      promote → admin
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeRole(u, "viewer")}
                    >
                      demote → viewer
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => remove(u)}>
                    delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {drawer?.kind === "create" && (
        <CreateUserDrawer
          onClose={() => setDrawer(null)}
          onDone={async () => {
            setDrawer(null);
            await load();
          }}
          token={token}
        />
      )}

      {drawer?.kind === "password" && (
        <SetPasswordDrawer
          user={drawer.user}
          onClose={() => setDrawer(null)}
          onDone={() => setDrawer(null)}
          token={token}
        />
      )}
    </div>
  );
}

function CreateUserDrawer({
  onClose,
  onDone,
  token
}: {
  onClose: () => void;
  onDone: () => Promise<void> | void;
  token: string | null;
}) {
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: "admin" | "viewer";
  }>({ username: "", password: "", role: "viewer" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/users", { token, method: "POST", body: form });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={true} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-3">
        <input
          required
          minLength={3}
          maxLength={64}
          placeholder="username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />
        <input
          required
          minLength={8}
          type="password"
          placeholder="password (>=8 chars)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        />
        <select
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as "admin" | "viewer" })
          }
          className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
        >
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function SetPasswordDrawer({
  user,
  onClose,
  onDone,
  token
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
  token: string | null;
}) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/users/${user.id}/password`, {
        token,
        method: "PATCH",
        body: { new_password: pwd }
      });
      setDone(true);
      setTimeout(onDone, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={true} onClose={onClose} title={`Set password — ${user.username}`}>
      {done ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Password updated.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            required
            minLength={8}
            type="password"
            placeholder="new password (>=8 chars)"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoFocus
            className="h-11 w-full rounded-xl border border-white/10 bg-[#08101d] px-3 text-sm text-white"
          />
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-amber-300">
            User's existing JWT remains valid until expiry (default 1h). They will need the new
            password on next login.
          </p>
        </form>
      )}
    </Drawer>
  );
}

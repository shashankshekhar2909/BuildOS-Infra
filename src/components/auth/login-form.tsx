"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppRole, APP_ROLES } from "@/lib/auth/roles";
import { useAppAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type LoginFormProps = {
  returnTo?: string;
};

export function LoginForm({ returnTo = "/dashboard" }: LoginFormProps) {
  const router = useRouter();
  const { signIn, isLoading, isAuthenticated } = useAppAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [role, setRole] = useState<AppRole>("admin");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, returnTo, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await signIn({ username, password, role });
      router.replace(returnTo);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Login failed");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">Role</span>
          <select
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole)}
          >
            {APP_ROLES.map((value) => (
              <option key={value} value={value} className="bg-slate-950">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm text-slate-300">Username</span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={role === "admin" ? "admin" : "viewer"}
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-slate-300">Password</span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <Button className="w-full justify-center" disabled={isLoading} size="lg" type="submit">
        {isLoading ? "Signing in..." : `Continue as ${role}`}
      </Button>
    </form>
  );
}

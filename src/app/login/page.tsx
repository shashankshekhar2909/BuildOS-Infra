"use client";

import { Cpu, ShieldCheck, Workflow } from "lucide-react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LoginForm } from "@/components/auth/login-form";
import { useAppAuth } from "@/components/auth/auth-provider";

const securitySignals = [
  {
    icon: ShieldCheck,
    title: "First-party tokens",
    description: "The app issues and stores JWT sessions itself, so no external identity provider is required."
  },
  {
    icon: Workflow,
    title: "Role-aware access",
    description: "Admin and viewer sessions are encoded at sign-in and can be expanded into RBAC later."
  },
  {
    icon: Cpu,
    title: "Docker-native setup",
    description: "The frontend proxies login calls to the bundled backend service through the same origin."
  }
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAppAuth();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, returnTo, router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.18),transparent_32%),linear-gradient(180deg,#020617_0%,#020617_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-14 lg:flex-row lg:items-center lg:gap-16">
        <section className="max-w-2xl">
          <Badge className="mb-5 w-fit" variant="success">
            BuildOS Infra
          </Badge>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white md:text-6xl">
            Secure infrastructure control without external auth dependencies.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 md:text-lg">
            Sign in with a first-party JWT session. Admin and viewer roles are available now, and the session can be extended into stricter RBAC later without changing the route structure.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {securitySignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <div key={signal.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/90">{signal.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{signal.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12 w-full max-w-md rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.94))] p-8 shadow-2xl shadow-cyan-950/20 backdrop-blur lg:mt-0">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Operator access</div>
              <div className="text-2xl font-semibold text-white">Sign in</div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-7 text-slate-400">
            Use the internal token login to enter the BuildOS control plane. The backend issues a signed session for `admin` or `viewer`, and protected routes remain inaccessible until that session exists.
          </p>

          <div className="mt-8 space-y-4">
            <LoginForm returnTo={returnTo} />
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              Callback URL: <span className="font-[family-name:var(--font-mono)] text-slate-200">/login?returnTo=...</span>
              <br />
              API login: <span className="font-[family-name:var(--font-mono)] text-slate-200">/api/auth/login</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

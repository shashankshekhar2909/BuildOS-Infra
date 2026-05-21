import { Activity, Globe, Shield, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LiveFleetCard } from "@/components/live-fleet-card";
import { CopilotPanel } from "@/components/copilot-panel";
import { LogStreamCard } from "@/components/log-stream-card";

const topMetrics = [
  { label: "Active nodes", value: "12", delta: "+2 this week" },
  { label: "Running containers", value: "47", delta: "5 queued changes" },
  { label: "Protected routes", value: "5", delta: "all guarded" }
];

const activityFeed = [
  { title: "Auth boundary enabled", detail: "Middleware now shields every protected route group before render.", state: "healthy" },
  { title: "Operator sessions centralized", detail: "The app now issues its own signed JWT sessions for admin and viewer users.", state: "healthy" },
  { title: "RBAC preparation wired", detail: "Role metadata is stored with the session and ready for enforcement hooks.", state: "prepared" }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <LiveFleetCard />
      <LogStreamCard />
      <CopilotPanel />

      <section className="grid gap-4 md:grid-cols-3">
        {topMetrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">{metric.label}</div>
            <div className="mt-4 text-4xl font-semibold text-white">{metric.value}</div>
            <div className="mt-3 text-sm text-[var(--muted-foreground)]">{metric.delta}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Operational posture</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Frontend auth rollout</h2>
            </div>
            <Badge variant="success">secured</Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <Shield className="size-5 text-cyan-200" />
              <div className="mt-4 text-sm font-medium text-white">Protected route groups</div>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                `/dashboard`, `/servers`, `/containers`, `/domains`, and `/emergency` redirect cleanly when no session exists.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <Globe className="size-5 text-cyan-200" />
              <div className="mt-4 text-sm font-medium text-white">Token login</div>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                The `/login` page remains public and issues a local JWT session against the bundled backend.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
              <TimerReset className="size-5 text-cyan-200" />
              <div className="mt-4 text-sm font-medium text-white">Session-aware shell</div>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                The app header and dropdown consume the same session state and keep loading behavior explicit.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3">
            <Activity className="size-5 text-cyan-200" />
            <h2 className="text-xl font-semibold text-white">Change feed</h2>
          </div>
          <div className="mt-6 space-y-4">
            {activityFeed.map((entry) => (
              <div key={entry.title} className="rounded-2xl border border-white/10 bg-[#08101d] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{entry.title}</div>
                  <Badge variant={entry.state === "healthy" ? "success" : "warning"}>{entry.state}</Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{entry.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

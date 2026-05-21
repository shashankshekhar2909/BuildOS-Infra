import { LiveFleetCard } from "@/components/live-fleet-card";
import { CopilotPanel } from "@/components/copilot-panel";
import { LogStreamCard } from "@/components/log-stream-card";

export default function DashboardPage() {
  return (
    <div className="min-w-0 max-w-full space-y-6">
      <LiveFleetCard />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <LogStreamCard />
        </div>
        <div className="min-w-0">
          <CopilotPanel />
        </div>
      </div>
    </div>
  );
}

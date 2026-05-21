import { Bell, Search } from "lucide-react";
import { ProfileDropdown } from "@/components/auth/profile-dropdown";
import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  title: string;
  subtitle: string;
};

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(2,6,23,0.82)] px-4 py-4 backdrop-blur xl:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Authenticated session</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 md:flex">
            <Search className="size-4 text-[var(--muted-foreground)]" />
            <span className="text-sm text-[var(--muted-foreground)]">Search nodes, domains, incidents</span>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full border border-white/10 bg-white/5">
            <Bell className="size-4" />
          </Button>
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
}

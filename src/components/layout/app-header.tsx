import { Search } from "lucide-react";
import { ProfileDropdown } from "@/components/auth/profile-dropdown";

type AppHeaderProps = {
  title: string;
  subtitle: string;
};

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(2,6,23,0.82)] px-3 py-3 backdrop-blur sm:px-4 sm:py-4 xl:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="hidden text-[10px] uppercase tracking-[0.28em] text-cyan-200/70 sm:block">
            Authenticated session
          </div>
          <h1 className="truncate text-lg font-semibold tracking-tight text-white sm:text-2xl">
            {title}
          </h1>
          <p className="hidden truncate text-sm text-[var(--muted-foreground)] sm:block">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 xl:flex">
            <Search className="size-4 text-[var(--muted-foreground)]" />
            <span className="text-sm text-[var(--muted-foreground)]">
              Search nodes, domains, incidents
            </span>
          </div>
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
}

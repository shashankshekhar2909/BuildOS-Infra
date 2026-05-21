"use client";

import Link from "next/link";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type MobileNavProps = {
  pathname: string;
};

export function MobileNav({ pathname }: MobileNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[rgba(2,6,23,0.92)] backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-6">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium",
                  isActive ? "text-cyan-200" : "text-[var(--muted-foreground)]"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-colors",
                    isActive ? "bg-cyan-400/15" : ""
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="uppercase tracking-wider">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

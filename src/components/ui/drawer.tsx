"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
};

export function Drawer({ open, onClose, title, subtitle, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <aside
        className="relative flex h-full w-full flex-col border-l border-white/10 bg-[#040810] shadow-2xl
                   animate-[drawerSlideIn_180ms_ease-out]
                   sm:w-[28rem] lg:w-[32rem] xl:w-[36rem]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[rgba(2,6,23,0.85)] px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-white">{title}</div>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-[var(--muted-foreground)] hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

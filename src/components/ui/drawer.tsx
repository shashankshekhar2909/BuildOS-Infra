"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
};

/**
 * Compat shim — keeps the legacy <Drawer> API while delegating to the
 * Radix-backed shadcn <Sheet>. Provides focus trap, ARIA, esc-to-close,
 * and animated entry/exit out of the box.
 */
export function Drawer({ open, onClose, title, subtitle, children }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-white/10 bg-[var(--surface-3)] p-0 sm:max-w-[28rem] lg:max-w-[32rem] xl:max-w-[36rem]"
      >
        <SheetHeader className="border-b border-white/10 bg-[rgba(2,6,23,0.85)] px-5 py-4 backdrop-blur">
          <SheetTitle className="truncate text-base font-semibold text-white">
            {title}
          </SheetTitle>
          {subtitle && (
            <SheetDescription className="truncate text-xs text-[var(--muted-foreground)]">
              {subtitle}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

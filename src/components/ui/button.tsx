import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:brightness-110 focus-visible:ring-[var(--ring)]",
        secondary: "bg-white/5 text-white hover:bg-white/10 focus-visible:ring-white/30",
        ghost: "text-[var(--muted-foreground)] hover:bg-white/5 hover:text-white focus-visible:ring-white/20",
        outline: "border border-white/10 bg-transparent text-white hover:bg-white/5 focus-visible:ring-white/20",
        destructive: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-300"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        icon: "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

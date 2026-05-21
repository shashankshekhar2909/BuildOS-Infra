"use client";

import { useRouter } from "next/navigation";
import { useAppAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type LogoutLinkProps = {
  label?: string;
  variant?: "default" | "secondary" | "ghost" | "outline";
  className?: string;
};

export function LogoutLink({
  label = "Logout",
  variant = "ghost",
  className
}: LogoutLinkProps) {
  const router = useRouter();
  const { signOut } = useAppAuth();

  return (
    <Button
      className={className}
      onClick={() => {
        signOut();
        router.replace("/login");
      }}
      variant={variant}
    >
      {label}
    </Button>
  );
}

"use client";

import { ChevronDown, LogOut, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppUser } from "@/hooks/use-app-user";
import { useAppAuth } from "@/components/auth/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ProfileDropdown() {
  const router = useRouter();
  const { signOut } = useAppAuth();
  const { user, isLoading } = useAppUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
        <Skeleton className="size-8 rounded-full" />
        <div className="hidden space-y-1 md:block">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const primaryRole = user.role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto rounded-full border border-white/10 bg-white/5 px-2 py-1.5 text-left">
          <Avatar className="size-8">
            <AvatarImage alt={user.name} src={user.picture ?? ""} />
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="truncate text-sm font-medium text-white">{user.name}</div>
            <div className="truncate text-xs text-[var(--muted-foreground)]">{user.email}</div>
          </div>
          <ChevronDown className="hidden size-4 text-[var(--muted-foreground)] md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage alt={user.name} src={user.picture ?? ""} />
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs font-normal text-[var(--muted-foreground)]">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{primaryRole}</Badge>
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              Role metadata ready for future RBAC.
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard" className="flex w-full items-center">
            <Shield className="size-4" />
            Account Session
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-200"
          onClick={() => {
            signOut();
            router.replace("/login");
          }}
        >
          <span className="flex w-full items-center gap-2">
            <LogOut className="size-4" />
            Logout
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

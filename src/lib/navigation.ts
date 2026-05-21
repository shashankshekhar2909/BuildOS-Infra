import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Boxes,
  Globe,
  LayoutDashboard,
  Server,
  Users
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const protectedRoutes = [
  "/dashboard",
  "/servers",
  "/containers",
  "/domains",
  "/users",
  "/emergency"
] as const;

export const navigationItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "System overview and live posture."
  },
  {
    href: "/servers",
    label: "Servers",
    icon: Server,
    description: "Fleet inventory and node health."
  },
  {
    href: "/containers",
    label: "Containers",
    icon: Boxes,
    description: "Runtime workloads and lifecycle control."
  },
  {
    href: "/domains",
    label: "Domains",
    icon: Globe,
    description: "Public edge routing and DNS mappings."
  },
  {
    href: "/users",
    label: "Users",
    icon: Users,
    description: "Operator accounts and password management."
  },
  {
    href: "/emergency",
    label: "Emergency",
    icon: AlertTriangle,
    description: "Lockdown and incident response actions."
  }
];

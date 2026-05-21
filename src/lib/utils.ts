import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() ?? "")
      .join("");
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return "BO";
}

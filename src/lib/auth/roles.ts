export type AppRole = "admin" | "viewer";

export const APP_ROLES: AppRole[] = ["admin", "viewer"];

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "viewer";
}

export function canManageInfrastructure(role: AppRole): boolean {
  return role === "admin";
}

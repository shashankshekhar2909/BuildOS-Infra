import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { findUserByUsername, verifyPassword } from "./database.js";

export type AppRole = "admin" | "viewer";

type JwtPayload = {
  sub: string;
  role: AppRole;
  name: string;
  email: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(input: string): string {
  return base64UrlEncode(crypto.createHmac("sha256", config.jwtSecret).update(input).digest());
}

function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function issueAuthToken(input: { username: string; role: AppRole }): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: input.username,
    role: input.role,
    name: input.role === "admin" ? "BuildOS Admin" : "BuildOS Viewer",
    email: `${input.username}@buildos.local`,
    iat: issuedAt,
    exp: issuedAt + config.jwtExpiresInSeconds
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const expectedSignature = sign(`${header}.${body}`);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as JwtPayload;
    if (
      payload.exp <= Math.floor(Date.now() / 1000) ||
      (payload.role !== "admin" && payload.role !== "viewer")
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// `role` is now informational: DB-stored user's actual role overrides the request's
// declared role. Returns the user's true role on success, null on failure.
export function verifyCredentials(
  _requestedRole: AppRole,
  username: string,
  password: string
): { role: AppRole; userId: number } | null {
  if (typeof username !== "string" || typeof password !== "string") return null;
  const user = findUserByUsername(username);
  if (!user) {
    // Constant-time-ish dummy hash to avoid revealing user existence via timing.
    verifyPassword(password, "$argon2id$v=19$m=19456,t=2,p=1$YWJjZGVmZ2hpamtsbW5vcA$dummy");
    return null;
  }
  if (!verifyPassword(password, user.password_hash)) return null;
  return { role: user.role, userId: user.id };
}

// Backwards-compat helper for legacy safeEqual usage on creds (kept exported in case).
export { safeEqualString };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const payload = verifyAuthToken(token);

  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.locals.auth = payload;
  next();
}

export function requireRole(role: AppRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const auth = res.locals.auth as JwtPayload | undefined;
      if (!auth || auth.role !== role) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      next();
    });
  };
}

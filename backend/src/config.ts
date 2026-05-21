import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_APP_URL = `http://localhost:${DEFAULT_PORT}`;

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? DEFAULT_APP_URL,
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 3600),
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin",
  viewerUsername: process.env.VIEWER_USERNAME ?? "viewer",
  viewerPassword: process.env.VIEWER_PASSWORD ?? "viewer",
  databasePath: process.env.DATABASE_PATH ?? "./data/buildos-infra.sqlite",
  defaultAgentVersion: process.env.DEFAULT_AGENT_VERSION ?? "v1.0.0",
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID ?? "",
  cloudflareApiBase: process.env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
} as const;

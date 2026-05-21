import { spawn } from "child_process";

const sharedEnv = {
  ...process.env,
  APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:4235",
  APP_URL: process.env.APP_URL ?? "http://localhost:4235",
  BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8016",
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/buildos-infra.sqlite",
  NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:4235"
};

const backend = spawn("node", ["--import", "tsx/esm", "backend/src/server.ts"], {
  env: {
    ...sharedEnv,
    PORT: process.env.LIVE_BACKEND_PORT ?? process.env.PORT ?? "8016"
  },
  stdio: "inherit"
});

const frontend = spawn("npm", ["run", "dev"], {
  env: {
    ...sharedEnv,
    PORT: process.env.LIVE_FRONTEND_PORT ?? process.env.PORT ?? "4235"
  },
  stdio: "inherit"
});

const children = [backend, frontend];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
    shutdown(exitCode);
  });
  child.on("error", () => shutdown(1));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

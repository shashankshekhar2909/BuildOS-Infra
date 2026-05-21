import { spawn } from "child_process";

const port = process.env.PORT ?? "4225";

const child = spawn("next", ["dev", "--port", port], {
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  process.exit(typeof code === "number" ? code : signal ? 1 : 0);
});

child.on("error", () => {
  process.exit(1);
});

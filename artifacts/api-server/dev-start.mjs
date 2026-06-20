import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

const VITE_PORT = process.env.VITE_PORT || "5173";
const API_PORT = process.env.PORT || "3000";

function startProcess(cmd, args, env = {}) {
  const proc = spawn(cmd, args, {
    cwd: workspaceRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });

  proc.on("error", (err) => {
    console.error(`Process ${cmd} error:`, err);
  });

  return proc;
}

const viteProcess = startProcess("pnpm", ["--filter", "@workspace/cooperative", "run", "dev"], {
  PORT: VITE_PORT,
  BASE_PATH: "/",
  NODE_ENV: "development",
});

const apiProcess = startProcess(
  "node",
  ["--enable-source-maps", path.resolve(__dirname, "dist/index.mjs")],
  {
    NODE_ENV: "development",
    VITE_PORT,
    PORT: API_PORT,
  },
);

function cleanup() {
  viteProcess.kill("SIGTERM");
  apiProcess.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

apiProcess.on("exit", (code) => {
  console.error("API server exited with code", code);
  viteProcess.kill("SIGTERM");
  process.exit(code ?? 1);
});

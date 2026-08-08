import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children: ChildProcess[] = [];

function startProcess(label: string, args: string[]): ChildProcess {
  const child = spawn("npx", ["tsx", ...args], {
    cwd: backendDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${label} stopped (${signal})`);
    } else if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
    }

    shutdown(code ?? 0);
  });

  children.push(child);
  console.log(`Started ${label}`);
  return child;
}

let shuttingDown = false;

function shutdown(exitCode = 0): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 100);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startProcess("API", ["watch", "src/server.ts"]);
startProcess("workers", ["scripts/run-workers-watch.ts"]);

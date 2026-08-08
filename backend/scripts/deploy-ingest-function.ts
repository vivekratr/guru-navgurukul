import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendDir, "..");
const PROJECT_REF = "wvieukxkfwrotoecpvua";

config({ path: path.join(backendDir, ".env") });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  return value;
}

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: repoRoot,
    env: process.env,
    shell: true,
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");
const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");

process.env.SUPABASE_ACCESS_TOKEN = accessToken;

const secretStatus = run("npx", [
  "supabase@latest",
  "secrets",
  "set",
  `OPENROUTER_API_KEY=${openRouterApiKey}`,
  "--project-ref",
  PROJECT_REF,
]);

if (secretStatus !== 0) {
  process.exit(secretStatus);
}

const deployStatus = run("npx", [
  "supabase@latest",
  "functions",
  "deploy",
  "process-ingest-queue",
  "--project-ref",
  PROJECT_REF,
  "--use-api",
]);

process.exit(deployStatus);

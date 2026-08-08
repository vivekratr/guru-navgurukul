import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendDir, "..");
const PROJECT_REF = "wvieukxkfwrotoecpvua";
const FUNCTION_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/process-ingest-queue`;

config({ path: path.join(backendDir, ".env") });

function normalizeDatabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");

  if (!trimmed.startsWith("postgresql://") && !trimmed.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must start with postgresql:// or postgres://");
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.password) {
      parsed.password = encodeURIComponent(decodeURIComponent(parsed.password));
    }
    return parsed.toString();
  } catch {
    const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (!match) {
      throw new Error("DATABASE_URL could not be parsed.");
    }

    const [, protocol, user, password, hostAndPath] = match;
    const encodedPassword = encodeURIComponent(decodeURIComponent(password));
    return `${protocol}${user}:${encodedPassword}@${hostAndPath}`;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in backend/.env`);
  }
  return value;
}

function runQuery(databaseUrl: string, sql: string): number {
  const tempDir = mkdtempSync(path.join(tmpdir(), "navgurukul-cron-"));
  const sqlFile = path.join(tempDir, "query.sql");

  try {
    writeFileSync(sqlFile, sql, "utf8");

    const result = spawnSync(
      "npx",
      ["supabase@latest", "db", "query", "--db-url", databaseUrl, "-f", sqlFile],
      {
        stdio: "inherit",
        cwd: repoRoot,
        shell: true,
      },
    );

    if (result.error) {
      console.error(result.error.message);
      return 1;
    }

    return result.status ?? 1;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runStatements(databaseUrl: string, statements: string[]): number {
  for (const sql of statements) {
    const status = runQuery(databaseUrl, sql);
    if (status !== 0) {
      return status;
    }
  }
  return 0;
}

const databaseUrl = normalizeDatabaseUrl(requireEnv("DATABASE_URL"));
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const escapedKey = serviceRoleKey.replace(/'/g, "''");

const scheduleSql = [
  `select cron.unschedule(jobid)
from cron.job
where jobname = 'tick-ingest';`,
  `select cron.schedule(
  'tick-ingest',
  '10 seconds',
  $$
  select net.http_post(
    url := '${FUNCTION_URL}',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${escapedKey}',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);`,
  `select jobid, jobname, schedule, active
from cron.job
where jobname = 'tick-ingest';`,
];

const status = runStatements(databaseUrl, scheduleSql);
process.exit(status);

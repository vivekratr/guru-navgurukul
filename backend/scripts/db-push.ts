import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendDir, "..");

config({ path: path.join(backendDir, ".env") });

function normalizeDatabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");

  if (trimmed.includes("[") || trimmed.includes("]")) {
    throw new Error(
      "DATABASE_URL still contains placeholder brackets. Replace [YOUR-PASSWORD] with your real database password.",
    );
  }

  if (!trimmed.startsWith("postgresql://") && !trimmed.startsWith("postgres://")) {
    throw new Error(
      "DATABASE_URL must start with postgresql:// or postgres://",
    );
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.password) {
      parsed.password = encodeURIComponent(
        decodeURIComponent(parsed.password),
      );
    }
    return parsed.toString();
  } catch {
    const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (!match) {
      throw new Error(
        "DATABASE_URL could not be parsed. Copy the URI from Supabase Dashboard and URL-encode special characters in the password.",
      );
    }

    const [, protocol, user, password, hostAndPath] = match;
    const encodedPassword = encodeURIComponent(decodeURIComponent(password));
    return `${protocol}${user}:${encodedPassword}@${hostAndPath}`;
  }
}

let databaseUrl: string;
try {
  if (!process.env.DATABASE_URL) {
    throw new Error("missing");
  }
  databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
} catch (error) {
  console.error(
    error instanceof Error && error.message !== "missing"
      ? error.message
      : "DATABASE_URL is required in backend/.env to push migrations.\n" +
          "Get it from Supabase Dashboard → Settings → Database → Connection string (URI, port 5432).",
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["supabase", "db", "push", "--db-url", databaseUrl, "--yes"],
  {
    stdio: "inherit",
    cwd: repoRoot,
    env: process.env,
    shell: true,
  },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);

/**
 * Developer job_log inspector (service-role only).
 *
 * Usage:
 *   npm run inspect:jobs
 *   npm run inspect:jobs -- --failed
 *   npm run inspect:jobs -- --queue ingest_source --limit 10
 *   npm run inspect:jobs -- --course-id <uuid>
 *   npm run inspect:jobs -- --source-id <uuid>
 *
 * Payloads are expected to be small IDs only ({ course_id } | { source_id }).
 */
import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

type JobLogRow = {
  id: string;
  queue_name: string;
  msg_id: number | null;
  payload: Record<string, unknown>;
  status: string;
  attempt: number;
  error: string | null;
  model_used: string | null;
  created_at: string;
};

function parseArgs(argv: string[]) {
  const options = {
    failed: false,
    queue: undefined as string | undefined,
    courseId: undefined as string | undefined,
    sourceId: undefined as string | undefined,
    limit: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--failed") {
      options.failed = true;
      continue;
    }

    if (arg === "--queue") {
      options.queue = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--course-id") {
      options.courseId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-id") {
      options.sourceId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function formatRow(row: JobLogRow): string {
  const payload = JSON.stringify(row.payload);
  const error = row.error ? row.error.slice(0, 120) : "";
  return [
    row.created_at,
    row.queue_name.padEnd(18),
    row.status.padEnd(10),
    `attempt=${row.attempt}`,
    row.model_used ?? "-",
    payload,
    error,
  ].join(" | ");
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let query = supabase
  .from("job_log")
  .select("id, queue_name, msg_id, payload, status, attempt, error, model_used, created_at")
  .order("created_at", { ascending: false })
  .limit(options.limit);

if (options.failed) {
  query = query.in("status", ["retrying", "dead"]);
}

if (options.queue) {
  query = query.eq("queue_name", options.queue);
}

if (options.courseId) {
  query = query.contains("payload", { course_id: options.courseId });
}

if (options.sourceId) {
  query = query.contains("payload", { source_id: options.sourceId });
}

const { data, error } = await query;

if (error) {
  console.error("job_log query failed:", error.message);
  process.exit(1);
}

const rows = (data ?? []) as JobLogRow[];

console.log(`job_log rows: ${rows.length}`);
console.log(
  "created_at | queue | status | attempt | model | payload | error",
);

for (const row of rows) {
  console.log(formatRow(row));
}

if (rows.length === 0) {
  console.log("No matching rows.");
}

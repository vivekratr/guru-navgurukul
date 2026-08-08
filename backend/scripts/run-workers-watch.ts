import { env } from "../src/config/index.js";
import { getServiceSupabaseClient } from "../src/lib/supabase.js";
import { runArtifactWorkerTick } from "../src/workers/artifact-worker.js";
import { runIngestWorkerTick } from "../src/workers/ingest-worker.js";
import { runKnowledgeWorkerTick } from "../src/workers/knowledge-worker.js";

const DEFAULT_IDLE_MS = 3_000;
const DEFAULT_BUSY_MS = 250;

type WorkerTickSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required to run workers locally`);
  }

  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function tickWasActive(summary: WorkerTickSummary): boolean {
  return summary.processed > 0;
}

function formatTick(label: string, summary: WorkerTickSummary): string {
  return `${label} processed=${summary.processed} ok=${summary.succeeded} failed=${summary.failed} skipped=${summary.skipped}`;
}

async function runPipelineTick(): Promise<{
  ingest: WorkerTickSummary;
  knowledge: WorkerTickSummary;
  artifacts: WorkerTickSummary;
}> {
  const supabase = getServiceSupabaseClient();

  const ingest = await runIngestWorkerTick(supabase);
  const knowledge = await runKnowledgeWorkerTick(supabase);
  const artifacts = await runArtifactWorkerTick(supabase);

  return { ingest, knowledge, artifacts };
}

async function main(): Promise<void> {
  requireEnv("SUPABASE_URL", env.SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("OPENROUTER_API_KEY", env.OPENROUTER_API_KEY);

  const idleMs = parsePositiveInt(process.env.WORKERS_IDLE_MS, DEFAULT_IDLE_MS);
  const busyMs = parsePositiveInt(process.env.WORKERS_BUSY_MS, DEFAULT_BUSY_MS);

  let running = true;

  const stop = () => {
    running = false;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `Workers watch started (idle=${idleMs}ms, busy=${busyMs}ms). Press Ctrl+C to stop.`,
  );

  while (running) {
    const tick = await runPipelineTick();
    const active =
      tickWasActive(tick.ingest) ||
      tickWasActive(tick.knowledge) ||
      tickWasActive(tick.artifacts);

    if (active) {
      console.log(
        [
          formatTick("ingest", tick.ingest),
          formatTick("knowledge", tick.knowledge),
          formatTick("artifacts", tick.artifacts),
        ].join(" | "),
      );
      await sleep(busyMs);
      continue;
    }

    await sleep(idleMs);
  }

  console.log("Workers watch stopped.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

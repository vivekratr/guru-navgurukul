import { env } from "../config/index.js";
import { AppError } from "../lib/errors.js";
import { getServiceSupabaseClient } from "../lib/supabase.js";
import { runArtifactWorkerTick } from "../workers/artifact-worker.js";
import { runIngestWorkerTick } from "../workers/ingest-worker.js";
import { runKnowledgeWorkerTick } from "../workers/knowledge-worker.js";

export type WorkerTickSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type PipelineTickResult = {
  ingest: WorkerTickSummary;
  knowledge: WorkerTickSummary;
  artifacts: WorkerTickSummary;
};

function requireWorkerEnv(): void {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.OPENROUTER_API_KEY
  ) {
    throw new AppError(
      503,
      "INTERNAL_ERROR",
      "Pipeline workers are not configured on this server",
      false,
    );
  }
}

export async function runPipelineTick(): Promise<PipelineTickResult> {
  requireWorkerEnv();

  const supabase = getServiceSupabaseClient();

  const ingest = await runIngestWorkerTick(supabase);
  const knowledge = await runKnowledgeWorkerTick(supabase);
  const artifacts = await runArtifactWorkerTick(supabase);

  return { ingest, knowledge, artifacts };
}

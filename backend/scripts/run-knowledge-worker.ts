import { env } from "../src/config/index.js";
import { getServiceSupabaseClient } from "../src/lib/supabase.js";
import { runKnowledgeWorkerTick } from "../src/workers/knowledge-worker.js";

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required to run the knowledge worker locally`);
  }

  return value;
}

async function main(): Promise<void> {
  requireEnv("SUPABASE_URL", env.SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("OPENROUTER_API_KEY", env.OPENROUTER_API_KEY);

  const supabase = getServiceSupabaseClient();
  const summary = await runKnowledgeWorkerTick(supabase);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

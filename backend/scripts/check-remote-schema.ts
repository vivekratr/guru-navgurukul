import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "courses",
  "sources",
  "source_chunks",
  "concepts",
  "concept_relationships",
  "flashcards",
  "summaries",
  "artifact_generation_status",
  "job_log",
  "model_roles",
];

for (const table of tables) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  console.log(
    `${table}: ${error ? `missing (${error.code}: ${error.message})` : `ok (${data?.length ?? 0} rows sampled)`}`,
  );
}

const { data: roles, error: rolesError } = await supabase.from("model_roles").select("role");
console.log("model_roles seed:", rolesError ? rolesError.message : roles?.map((r) => r.role).join(", "));

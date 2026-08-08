import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  return value === "" || value === undefined ? undefined : value;
}

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().optional(),
  ),
  SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  OPENROUTER_API_KEY: optionalSecret,
  LLM_CHAT_COMPLETIONS_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().optional(),
  ),
  TEST_FORCE_INGEST_FAILURE_ONCE: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean().default(false),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

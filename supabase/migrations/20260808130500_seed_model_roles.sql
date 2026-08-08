-- Initial role chains from docs/07-SETUP-RUNBOOK.md and docs/03-LLM-ROUTING.md
-- Placeholder model IDs (<qwen-text-model>, <groq-model>) must be verified against OpenRouter before production use.

insert into public.model_roles (role, chain, max_tokens, timeout_ms) values
  (
    'vision_ingest',
    '["google/gemini-2.5-flash:free", "qwen/qwen3.7-flash:free"]'::jsonb,
    4000,
    30000
  ),
  (
    'knowledge_extraction',
    '["google/gemini-2.5-flash:free", "<qwen-text-model>:free"]'::jsonb,
    8000,
    45000
  ),
  (
    'content_generation',
    '["<groq-model>:free", "google/gemini-2.5-flash:free"]'::jsonb,
    6000,
    30000
  );

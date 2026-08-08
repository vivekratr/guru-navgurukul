-- Initial role chains from docs/07-SETUP-RUNBOOK.md and docs/03-LLM-ROUTING.md
-- Placeholder model IDs (<qwen-text-model>, <groq-model>) must be verified against OpenRouter before production use.

insert into public.model_roles (role, chain, max_tokens, timeout_ms) values
  (
    'vision_ingest',
    '["google/gemini-2.5-flash", "qwen/qwen-2.5-7b-instruct"]'::jsonb,
    4000,
    30000
  ),
  (
    'knowledge_extraction',
    '["google/gemini-2.5-flash", "meta-llama/llama-3.1-8b-instruct"]'::jsonb,
    8000,
    45000
  ),
  (
    'content_generation',
    '["google/gemini-2.5-flash", "openai/gpt-4o-mini"]'::jsonb,
    6000,
    30000
  );

-- OpenRouter removed several :free model slugs; use currently available models.
-- See https://openrouter.ai/models

update public.model_roles
set chain = '["google/gemini-2.5-flash", "qwen/qwen-2.5-7b-instruct"]'::jsonb
where role = 'vision_ingest';

update public.model_roles
set chain = '["google/gemini-2.5-flash", "meta-llama/llama-3.1-8b-instruct"]'::jsonb
where role = 'knowledge_extraction';

update public.model_roles
set chain = '["google/gemini-2.5-flash", "openai/gpt-4o-mini"]'::jsonb
where role = 'content_generation';

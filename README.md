# NavGurukul Learning Content Ingestion Platform

Hackathon repository for a resilient course-generation system: users upload learning sources, asynchronous workers process them through an LLM pipeline, and the frontend renders authoritative database state.

## Top-level directories

| Directory | Purpose |
|---|---|
| `client/` | React + TypeScript + Vite frontend (browser) |
| `backend/` | API layer — validation and enqueue only (`/api/v1`) |
| `supabase/functions/` | Edge Function workers — one per pipeline queue |
| `supabase/migrations/` | Infra SQL (extensions, RLS, queues) — Task 2+ |
| `shared/` | Types and schemas shared between client and backend |
| `tests/` | Unit, integration, and e2e tests |
| `docs/` | Architecture and implementation source of truth |
| `.cursor/rules/` | Cursor agent rules aligned with the architecture |

## Architecture

See `docs/00-ARCHITECTURE.md` for the system design. Companion docs cover the state machine, job queue, LLM routing, database schema, API contract, frontend resilience, and setup runbook.

## Development

Implementation follows the numbered project roadmap. Setup instructions will be added in later tasks.

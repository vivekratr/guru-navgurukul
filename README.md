# NavGurukul Learning Content Ingestion Platform

Upload learning sources, async workers run an LLM pipeline, frontend shows authoritative database state (Realtime + polling fallback).

## Architecture (local dev)

```text
Browser (client/)  →  API (backend/)  →  Remote Supabase Postgres + pgmq
                                              ↓
                                    Local Node workers (backend/)
                                              ↓
                                    callRole() → OpenRouter / OmniRoute
```

The API validates and enqueues work. Workers drain queues. The browser never holds processing truth.

## Prerequisites

- **Node.js 20+**
- **Supabase project** (free tier) — [supabase.com](https://supabase.com)
- **OpenRouter API key** (or OmniRoute endpoint) — [openrouter.ai/keys](https://openrouter.ai/keys)
- **Supabase CLI** (for `db push`) — [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli)

## Repository layout

| Path | Purpose |
|------|---------|
| `client/` | React + TypeScript + Vite frontend |
| `backend/` | Express API (`/api/v1`) + local Node workers |
| `supabase/migrations/` | Schema, RLS, pgmq queues, worker RPCs |
| `supabase/functions/` | Edge Function workers (optional; not used in default local flow) |
| `shared/` | Shared TypeScript project references |
| `tests/` | Co-located Vitest suites in `backend/src` and `client/src` |

Install dependencies in `client/` and `backend/` separately.

## 1. Supabase setup

1. Create a Supabase project.
2. Enable **Email** auth (Authentication → Providers).
3. Create a **private** Storage bucket named `source-uploads` with RLS so users only access their own paths.
4. Copy from Project Settings → API: **Project URL**, **anon key**, **service_role key**.
5. Copy **Database connection URI** (direct, port **5432**) for migrations.

Apply migrations from this repo:

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL and Supabase keys (see below)

npm install
npm run db:push
```

`db:push` runs `supabase db push` against `DATABASE_URL`. Migrations include domain tables, RLS, pgmq queues, worker RPCs, and `model_roles` seed.

Optional schema check:

```bash
npm run db:check
```

## 2. Environment variables

### Backend (`backend/.env`)

Copy `backend/.env.example`:

```bash
NODE_ENV=development
PORT=3001

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # never expose to browser

DATABASE_URL=postgresql://postgres.<ref>:<password>@...:5432/postgres

OPENROUTER_API_KEY=<key>

# Optional — OmniRoute or other OpenAI-compatible gateway
# LLM_CHAT_COMPLETIONS_URL=http://localhost:20128/v1/chat/completions
```

### Frontend (`client/.env`)

Copy `client/.env.example`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Default: /api (Vite proxies to backend in dev)
# VITE_API_URL=http://localhost:3001/api
```

**Never** put `SUPABASE_SERVICE_ROLE_KEY` or `OPENROUTER_API_KEY` in client env.

## 3. Install dependencies

```bash
cd backend && npm install
cd ../client && npm install
```

## 4. Run locally

Use **two terminals** for full pipeline (API + workers + UI).

### Terminal 1 — Backend (API + auto workers)

```bash
cd backend
npm run dev:pipeline
```

This starts the API on **http://localhost:3001** and a background worker loop that
automatically processes ingest → knowledge → artifacts queues.

Alternatively, run them separately:

```bash
npm run dev            # API only
npm run workers:watch  # background workers only
```

### Terminal 2 — Frontend

```bash
cd client
npm run dev
```

App on **http://localhost:5173**. Vite proxies `/api` to the backend.

After adding a source, generation starts automatically — you do not need to click
**Generate** manually. Workers pick up queued jobs within a few seconds.

### One-off worker ticks (optional)

Each command below runs **one batch** and then exits:

```bash
cd backend

npm run worker:ingest
npm run worker:knowledge
npm run worker:artifacts
```

Workers need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENROUTER_API_KEY` in `backend/.env`.

## 5. Build & test

Tests use **Vitest**. Integration, worker, RLS, and E2E tests need a real Supabase project configured in `backend/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). LLM calls are mocked in tests — OmniRoute/OpenRouter is not required for the default suite.

### Backend

```bash
cd backend
npm run typecheck
npm run test:unit          # pure logic, schemas, routing, backoff
npm run test:integration   # API routes, workers, RLS
npm run test:e2e           # full pipeline (API + workers + DB)
npm test                   # all backend tests
npm run build
npm start                  # production API (after build)
```

Optional E2E failure injection (ingest fails once, then retry succeeds):

```bash
TEST_FORCE_INGEST_FAILURE_ONCE=true npm run test:e2e
```

### Frontend

```bash
cd client
npm run typecheck
npm run test               # React Testing Library component + resilience tests
npm run build
npm run preview            # preview production build
```

### Test database lifecycle

1. Apply migrations: `cd backend && npm run db:push`
2. `model_roles` is seeded by migrations
3. Integration tests create isolated users/courses and delete them in `afterAll`
4. Worker integration tests purge queue messages between cases

Local Supabase (`supabase start`) works if you point `backend/.env` at the local stack. Do not run destructive integration tests against production user data.

### Job log inspection (development)

```bash
cd backend
npm run inspect:jobs
npm run inspect:failed-jobs
npm run inspect:jobs -- --course-id <uuid>
npm run inspect:jobs -- --source-id <uuid>
```

## 6. Optional: Edge Functions + cron

Default local development uses **Node workers** in `backend/`. The repo also has Supabase Edge Functions under `supabase/functions/` for hosted cron-driven ticks. Deploy with the Supabase CLI and schedule `pg_cron` jobs in the SQL Editor to invoke those functions on a fixed interval.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| API 401 / auth errors | `VITE_*` and backend Supabase keys match same project; user signed up/logged in |
| Upload fails | `source-uploads` bucket exists; Storage RLS allows authenticated user paths |
| Generate stuck on `ingesting` | Run `npm run worker:ingest` in `backend/` |
| Stuck on `extracting_knowledge` / `generating_artifacts` | Run `worker:knowledge` / `worker:artifacts` |
| LLM errors | `OPENROUTER_API_KEY`; `model_roles` table (edit in Supabase if models delisted) |
| Migrations fail | `DATABASE_URL` uses direct port 5432; password URL-encoded if special chars |
| Frontend not updating | Realtime may need table publication; polling fallback runs every 3s while processing |

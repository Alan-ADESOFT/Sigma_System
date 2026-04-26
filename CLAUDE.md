# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SIGMA Marketing** — Next.js (Pages Router) marketing-agency dashboard with an AI-driven 7-agent strategic pipeline (diagnosis → competitors → audience → avatar → positioning) plus an Instagram/Meta publishing scheduler, copy generator, and a public client briefing form. Backend uses Neon serverless Postgres; AI calls are routed across OpenAI and Anthropic. UI is dark-only ("SIGMA" terminal/HUD aesthetic).

The README at `README.md` documents the high-level feature set, env vars, and pipeline flow — read it for context before larger changes.

## Commands

```bash
npm run dev      # Next dev server on port 3002
npm run build    # Production build
npm start        # Production server on port 3002
npm run db:setup # POSTs http://localhost:3002/api/setup to bootstrap the DB
```

There are no tests, no lint script, and no typecheck — `eslint-config-next` is installed but not wired to a script.

To apply schema changes, run `infra/schema.sql` against `DATABASE_URL` (Neon SQL Editor or `psql $DATABASE_URL -f infra/schema.sql`). The file is fully idempotent (`IF NOT EXISTS` + `ALTER ... ADD COLUMN IF NOT EXISTS`) — extend it inline rather than creating new migration files. The `infra/migrations/` directory exists but is empty.

The dev server starts a background scheduler via `server/instrumentation.js` (enabled by `experimental.instrumentationHook` in `next.config.js`), which polls `contents` for posts due to publish via `models/scheduler.service.js`. Long-running `npm run dev` is normal.

## Architecture

### Stack
- Next.js 14 **Pages Router** (`pages/`), CommonJS modules throughout (`require`/`module.exports`) — even React components are written as ES modules but the rest of the codebase is CJS. Do not introduce TS or migrate to App Router.
- React 18, **plain CSS Modules** (`assets/style/*.module.css`) plus a global stylesheet at `assets/style/globals.css` injected once via `pages/_app.js`. **No Tailwind, no Framer Motion, no Lucide React** in `package.json` — ignore those when you see them in `brandbook/05-ai-instructions.md` (the brandbook is aspirational/template prose; the SIGMA classes like `glass-card`, `label-micro`, `section-title`, `neon-red`, `divider-sweep`, `sigma-input` are real and live in `globals.css`).
- Neon serverless Postgres via `@neondatabase/serverless` — single shared `sql` instance from `infra/db.js` exposing `query(text, params)` and `queryOne(text, params)`. No ORM. All SQL is hand-written with `$1, $2` placeholders.
- AI: OpenAI Chat Completions + Responses API (web search), Anthropic Messages API, optional Perplexity Sonar. Routing is automatic by model ID substring (see Completion router below).
- DOCX export uses `docx`, file extraction uses `pdf-parse` + `mammoth`, image optimization uses `sharp`.

### Multi-tenancy (critical)
**Every** query must filter by `tenant_id`. The tenant is resolved per-request via `infra/get-tenant-id.js → resolveTenantId(req)`:
1. `x-tenant-id` header
2. `ADMIN_TENANT_ID` env var
3. Cached lookup/creation of the admin tenant (`models/tenant.model.getOrCreateAdmin`) using `ADMIN_EMAIL` / `ADMIN_NAME`

This is currently a single-admin model; do not assume per-user sessions resolve the tenant. Auth (`lib/auth.js`, `pages/api/auth/*`, `hooks/useAuth.js`) uses scrypt + HMAC-signed cookie tokens — separate concept from the tenant.

### Directory layout (the parts that matter)
```
pages/                      Next.js Pages Router (routes + API)
  api/agentes/pipeline/     run-all.js, status.js — pipeline orchestration
  api/agentes/              generate, apply-modification, improve-text,
                            format-output, stream-log (SSE), search, ...
  api/clients/[id]/         stages, export, reset-database, ...
  api/copy/                 generate, generate-structure, structures, transcribe
  api/form/                 submit, save-draft, validate-token, send-whatsapp
  dashboard/                Authenticated pages (clients, database, copy, ads, ...)
  form/[token].js           Public briefing form (no auth, token-gated)

components/                 Reusable React (plain JS, CSS Modules)
  DashboardLayout.js        Sidebar + topbar wrapper for all dashboard/* pages
  StageModal.js             Per-stage editor (output + "modify with AI")
  PipelineModal.js          7-agent run UI w/ SSE log streaming
  CopyWorkspace.js          Copy generator workspace (chat-like)
  FormWizard.js             Public form multi-step

context/NotificationContext.js   Toast system — useNotification() hook

infra/                      Cross-cutting backend
  db.js                     Neon pool + query / queryOne helpers
  schema.sql                FULL DDL (all 30+ tables, idempotent)
  get-tenant-id.js          resolveTenantId(req) — see above
  rateLimit.js              checkRateLimit() / logRateLimitEvent() (DB-backed)
  pipelineEmitter.js        In-memory jobId → EventEmitter map for SSE
  api/                      External API wrappers (openai, anthropic, perplexity,
                            vision, fileReader, scraper, zapi)

models/                     Domain models (CRUD + business logic, NOT ORM)
  ia/completion.js          UNIFIED router: runCompletion(level, ...) and
                            runCompletionStream() — picks OpenAI vs Anthropic by
                            checking if model ID contains "claude". Levels are
                            'weak'|'medium'|'strong' → AI_MODEL_WEAK/MEDIUM/STRONG.
  ia/deepSearch.js          Web search router (OpenAI Responses ↔ Perplexity)
  ia/markdownHelper.js      withMarkdown() — appends formatting instructions
  agentes/copycreator/      Pipeline implementation
    pipelineConfig.js       Single source of truth for agent order, KB
                            categories, dependencies, prompt placeholders
    agentRunner.js          runAgent() — loads prompt, injects KB+deps,
                            calls completion/search, saves to KB + history
    orchestrator.js         Sequential pipeline driver (search → analysis pairs)
    prompts/                7 prompt files (one per agent)
  copy/                     copyPrompt, copySession, structurePrompt, tokenUsage
  marketing.model.js, client.model.js, content.model.js, ...

assets/
  style/                    globals.css + per-page CSS Modules
  data/                     Static data: formQuestions, pipelineFakePhrases

brandbook/                  Design system docs (foundations, motion, tokens).
                            03-guidelines.md and globals.css are authoritative.
                            05-ai-instructions.md uses Tailwind/Framer/Lucide
                            templates that DO NOT match this codebase — ignore.
```

### AI completion routing
All text generation goes through `models/ia/completion.js`. You pass a semantic level — `'weak'`, `'medium'`, or `'strong'` — and the router resolves it via `process.env.AI_MODEL_{LEVEL}`. If the resolved model ID contains `claude`, it calls `infra/api/anthropic.js`; otherwise `infra/api/openai.js`. `runCompletion` also silently logs token usage to `ai_token_usage` when `opts.tenantId` is provided. `runCompletionStream` is an async generator parsing SSE from either provider — use it for incremental UI updates.

Web search has its own router in `models/ia/deepSearch.js` driven by `AI_SEARCH_PROVIDER` (`openai`|`perplexity`).

### The 7-agent pipeline
`models/agentes/copycreator/pipelineConfig.js` is the **single source of truth** — order, dependencies, prompt placeholders, and where each output is persisted in the `ai_knowledge_base` table. Order:

```
agente1 (diagnosis)        → diagnostico/output_completo
agente2a (search)          → concorrentes_raw/pesquisa_bruta    deps: 1
agente2b (analysis)        → concorrentes/analise_completa      deps: 1, 2a
agente3 (audience)         → publico_alvo/output_completo       deps: 1, 2b
agente4a (search)          → avatar_raw/pesquisa_bruta          deps: 1, 3
agente4b (avatar)          → avatar/output_completo             deps: 1, 3, 4a
agente5 (positioning)      → posicionamento/output_completo     deps: 1, 2b, 3, 4b
```

`agentRunner.runAgent()` does, in order:
1. Loads the prompt (custom > KB override > default file in `prompts/`)
2. Loads tenant/client KB and injects `{MARCA}`, `{PRODUTO}`, `{PERSONA}`, `{TOM}` placeholders
3. Loads dependency outputs from KB and injects pipeline placeholders (`{OUTPUT_DIAGNOSTICO}`, etc.)
4. For `type:'text'` agents: scrapes any reference URLs, runs Vision on images, extracts PDF/DOCX/TXT content, appends as "MATERIAIS COMPLEMENTARES"
5. Adds markdown instructions, calls `runCompletion` (or `deepSearch` for `type:'search'`)
6. Persists to `ai_agent_history` / `ai_search_history` AND to `ai_knowledge_base` (versioned via `metadata.version`)

When adding/changing agents, update `pipelineConfig.js` first — every other module imports from it. Never duplicate dependency wiring.

### Pipeline streaming
The `pipeline/run-all` endpoint creates a `pipeline_jobs` row, gets an `EventEmitter` from `infra/pipelineEmitter.js` keyed by job ID, and emits events as each agent runs. The frontend opens an SSE connection to `pages/api/agentes/stream-log.js?jobId=…` which subscribes to that emitter. **This is in-memory only** — it does not work across multiple Node instances. The TODO in `pipelineEmitter.js` notes Redis Pub/Sub as the eventual fix.

### Rate limiting
DB-backed via `rate_limit_log` (no Redis). `infra/rateLimit.checkRateLimit(tenantId, action, maxRequests, windowMinutes)` returns `{ ok, count, remaining, resetIn }`. Always pair with `logRateLimitEvent` after a successful run. Current limits (see README): pipeline = 5/30min, AI modification = 50/24h. Return HTTP 429 with `retryAfter` on overflow.

### Database conventions
- Schema lives **only** in `infra/schema.sql`. Add new columns via inline `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks below the `CREATE TABLE` for the same table — keep the file replayable.
- IDs: `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text` (not native uuid type).
- `updated_at` is auto-maintained by the trigger block at the bottom of `schema.sql` for a hardcoded list of tables — append your new table name to that list if you want auto-updates.
- The `ai_knowledge_base` table has two partial unique indexes (one for client-scoped rows, one for tenant-scoped rows) to allow `ON CONFLICT` upserts — match the pattern in `agentRunner.saveOutputToKB` when writing similar code.

### Frontend conventions
- All authenticated pages wrap their content in `<DashboardLayout activeTab="...">` from `components/DashboardLayout.js`. The layout calls `useAuth()` and redirects to `/login` if there's no valid cookie session.
- Toasts go through `useNotification()` from `context/NotificationContext.js` (supports `onClick` and an action button on the toast). Internal/persistent notifications go in the `system_notifications` table and surface in the topbar dropdown.
- CSS rule from `brandbook/03-guidelines.md`: never hardcode hex colors in components — use the CSS custom properties defined in `:root` of `globals.css`. The brand red `#ff0033` is reserved exclusively for primary actions, alerts, and critical highlights.
- All UI text is **Portuguese (pt-BR)**. Tone is terminal-like — short, technical, no exclamation marks, no emojis in operational copy.

### Auth model
- Login flow: `pages/api/auth/login.js` verifies a scrypt hash from `tenants.password` and sets an HMAC-signed `Buffer.from(userId:timestamp:hmac).toString('base64')` cookie. `lib/auth.js` is the only place that knows the format.
- `SESSION_SECRET` from `.env` is used to HMAC the token. The fallback string in `lib/auth.js` is a dev convenience — production must set the env var.
- Frontend uses `hooks/useAuth.js` which polls `/api/auth/me` once on mount.

## Things to know before editing

- **Port: 3002** (legacy READMEs may say 3000 or 3001). `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_BASE_URL` and `PORT` in `.env`/`.env.example` all align to 3002. When testing locally, use http://localhost:3002.
- The dashboard has a *lot* of pages and `pages/dashboard/clients/[id].js` alone is ~2700 lines. Read targeted sections rather than the whole file.
- File uploads land in `public/uploads/` (gitignored). The `logos/` and `attachments/` subfolders need to exist before uploads work.
- The `instrumentation.js` scheduler runs only when `NEXT_RUNTIME === 'nodejs'` and starts on dev server boot — be aware that long dev sessions will hit the Meta API on schedule for any due posts.
- When adding a new agent prompt, place the file in `models/agentes/copycreator/prompts/`, register it in that directory's `index.js`, and add the entry to `pipelineConfig.PIPELINE_CONFIG` with correct `order`, `savesToKB`, `dependsOn`, and `outputPlaceholder`.
- When calling the AI from a new feature, always pass `opts.tenantId` (and `clientId`/`operationType` when relevant) to `runCompletion` so token usage gets logged to `ai_token_usage`.

### Gerador de Imagem

- **Tabelas**: `client_brandbooks`, `image_folders`, `image_jobs`, `image_templates`, `image_settings`, `image_audit_log` (todas em `infra/schema.sql`, idempotente)
- **Worker**: `server/imageWorker.js` roda dentro do `server/instrumentation.js` (mesmo padrão do Instagram publisher). Polling adaptativo 2s → 5s (5 ciclos) → 10s (20 ciclos); MAX_CONCURRENT=3. Smoke-test do encryption no boot — falha = não inicia worker.
- **Encryption**: `infra/encryption.js` (AES-256-GCM com auth tag, IV aleatório, derivação scrypt em fallback). NUNCA cachear chaves em texto puro fora do processo.
- **Cache**: `infra/cache.js` (Map+TTL, ancorado em globalThis pra sobreviver HMR). Helpers `cache.ImageKeys.*`. Invalidar SEMPRE no mutador.
- **Rate limit**: `infra/imageRateLimit.js` (3 camadas: concurrent → hourly → daily) + IP rate limit em `/api/image/generate` (100/min via `rate_limit_log`).
- **Prompt cache**: `models/agentes/imagecreator/promptEngineer.js` calcula MD5 antes de chamar LLM e busca em `image_jobs.optimized_prompt` (partial index `idx_jobs_prompt_hash_recent`). Cache hit = 0 tokens.
- **Providers**: `infra/api/imageProviders/{vertex,openai,fal,gemini}.js`. Interface uniforme `generate(params)` retornando `{imageBuffer, mimeType, metadata}`. Erros padronizados via `Error.code` (CONTENT_BLOCKED, RATE_LIMITED, TIMEOUT, INVALID_INPUT, PROVIDER_ERROR).
- **Friendly errors**: `models/agentes/imagecreator/errorMessages.js` mapeia code → mensagem pt-BR (usado em notificações e UI).
- **Token tracking**: operations `image_prompt_engineer`, `image_brandbook_extract`, `image_brandbook_generate`, `image_generation` em `ai_token_usage`.
- **Prompts editáveis** na biblioteca (`pages/api/settings/prompt-library.js`): `image_prompt_engineer`, `image_brandbook_extract`, `image_brandbook_generate` na categoria `image`.
- **Cleanup**: cron interno do worker às 03:00 chama `cleanup_image_jobs()` (PL/pgSQL) + remove arquivos físicos de `public/uploads/generated/`. Endpoint manual `/api/setup/image-cleanup` protegido por `x-internal-token`.
- **Health**: `GET /api/image/_health` (header `x-internal-token`) retorna snapshot do worker, fila ao vivo no banco, cache stats.
- **Headers de segurança**: `next.config.js` aplica `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` em `/api/image/*` e `/dashboard/image/*`.
- **Auth pattern**: `lib/api-auth.js` com `requireAuth(req)` + `isAdmin(user)` (usa `user.role === 'admin' || 'god'` — não há `is_admin` boolean).
- **Atalhos UX**: Ctrl+Enter no campo de descrição = gerar; Esc no overlay = minimizar (continua em background); Ctrl+S no BrandbookEditor = salvar.

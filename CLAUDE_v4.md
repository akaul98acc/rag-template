# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RAG Builder

A two-phase tool for designing RAG (Retrieval-Augmented Generation) pipelines. Both phases **emit Python code — they never execute the pipeline.**

- **Phase 1 — Strategy Agent:** user uploads a document; the agent inspects size + metadata and recommends a chunking strategy, embedding model, and search method. The user can tweak the recommendation, then generate Azure-specific Python code.
- **Phase 2 — Provider Comparator + Code Generator:** user picks a provider for each pipeline stage (storage, document extraction, embedding, vector search). The app shows trade-offs and, on "Generate code", emits a runnable Python code block wired to those choices.
- **History tab:** displays all past uploads and their Phase 1 + Phase 2 recommendations fetched from PostgreSQL. Clicking a row restores both steps without re-uploading.

## Stack

- **Frontend:** React 18 + Vite, **TypeScript**. Tailwind CSS + shadcn/ui (Radix primitives). Lives in `frontend/`. Path alias `@` → `frontend/src`.
- **Backend:** FastAPI (Python 3.11+), Pydantic v2. Lives in `backend/`. All routes are mounted under the `/api` prefix.
- **Recommendation:** LLM-first (Azure OpenAI GPT-4o-mini), deterministic rules fallback. Both phases use this pattern independently.
- **Code generation:** Jinja2 templates, one per provider per stage. See `backend/app/templates/`.
- **Persistence:** PostgreSQL via psycopg2 (`database.py`). In-memory fallback when `DATABASE_URL` is not set.

## Commands

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # http://localhost:8000, health at /api/health

# Frontend (new terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
npm run build      # tsc --noEmit (typecheck) then vite build
npm run typecheck  # tsc --noEmit only
```

- **No test runner is configured** for either side. Fastest correctness check: `npm run typecheck` (frontend) and importing/running the FastAPI app (backend).
- **Formatting is automatic:** a `PostToolUse` hook in `.claude/settings.json` runs `npx prettier --write .` after every Write/Edit. Don't hand-format.
- **Windows note:** `python-magic-bin` is the Windows-compatible MIME detection package (not `python-magic`). Don't swap it.

## Architecture

### Request flow (frontend → backend)

All frontend HTTP goes through `frontend/src/services/api.ts` (axios client with `baseURL: "/api"`). Components never call axios directly. Backend routes live in `backend/app/api/routes/` and are registered in `backend/app/main.py`, each under the `/api` prefix.

| Method | Path (with prefix)              | Purpose                                                                         |
|--------|---------------------------------|---------------------------------------------------------------------------------|
| POST   | `/api/upload`                   | Multipart upload. Returns `{ doc_id, metadata }`.                               |
| POST   | `/api/recommend`                | Body `{ doc_id }`. Returns Phase 1 pipeline recommendation.                    |
| POST   | `/api/recommend-providers`      | Body `{ doc_id }`. Returns Phase 2 provider recommendation + persists it.      |
| GET    | `/api/providers`                | Returns the catalog: stages × providers with display metadata.                  |
| POST   | `/api/generate`                 | Body `{ selections, params? }`. Returns rendered Python code.                   |
| POST   | `/api/generate-notebook`        | Body `{ selections, params? }`. Returns downloadable `.ipynb` notebook.         |
| GET    | `/api/history`                  | Returns all past uploads + recommendations joined from PostgreSQL.              |
| POST   | `/api/feedback`                 | Body `{ recommendation_id, outcome, ... }`. Stores user feedback.              |
| GET    | `/api/health`                   | Liveness check.                                                                  |

**Layering convention (enforced):** routes in `api/routes/` are thin — no business logic. Logic lives in `services/`. All request/response I/O uses Pydantic v2 models from `backend/app/models/`.

### Cross-phase state: UploadContext

`frontend/src/contexts/UploadContext.tsx` is the shared React context. It holds:

- `uploadResult` / `setUploadResult` — the `UploadResult` (doc_id + metadata) bridged from Phase 1 to Phase 2.
- `selectionsCache` / `saveSelections(docId, selections)` — session-only map of user's manual Step 2 provider overrides, keyed by `doc_id`.
- `restoredItem` / `restoreItem(item)` / `clearRestoredItem()` — one-shot signal used by the History tab. `restoreItem` sets both `restoredItem` and `uploadResult`; Step 1 and Step 2 each consume it in a `useEffect` and call `clearRestoredItem()`.

### Database persistence

`backend/app/services/database.py` manages a single psycopg2 connection (thread-safe via `_lock`). Every DB call is wrapped in `asyncio.to_thread`. Tables:

- **`documents`** — one row per upload (`doc_id`, `filename`, `metadata JSONB`, `created_at`).
- **`recommendations`** — one row per Phase 1 call, FK to `documents`. Includes all recommendation fields plus `provider_recommendation JSONB` (written by `/api/recommend-providers`).
- **`recommendation_feedback`** — one row per `/api/feedback` call.

`recommendation_store.py` is the write layer for recommendations and feedback; `database.py` owns the connection lifecycle and the document store. Both modules share the same connection via `get_connection()` / `get_lock()`.

When `DATABASE_URL` is not set, the module falls back to in-memory dicts (`_DOCS_FALLBACK`, `_PROVIDER_RECS_FALLBACK`) — the app works without a database but history is lost on restart.

### Phase 1 — document analysis and recommendation

Upload hits `document_analyzer.py`, which orchestrates two extraction paths:

1. **Azure DI** (`azure_document_intelligence.py`) — async, returns page count, language, tables, images, word/char counts. Used when `AZURE_DOCINT_ENDPOINT` is set.
2. **Local fallback** (`local_metadata.py`) — PyMuPDF + pdfplumber + langdetect. Always available.

After extraction, `content_stats.py` derives computed fields: `avg_words_per_page`, `text_density` (high/medium/low), `table_ratio`, `doc_type`, `content_type`, `avg_sentence_length`.

Recommendation goes through `pipeline_recommender.py`:
1. **LLM pass** — calls Azure OpenAI (GPT-4o-mini), parses JSON response, validates against known vocabularies.
2. **Rules fallback** — deterministic logic in `strategy_agent.py` (`_tiny`, `_scanned`, `_large`, `_medium` functions, each returning a `RuleHit`). `strategy_agent.py` is the rules engine only; `pipeline_recommender.py` orchestrates LLM-first.

### Phase 1 — code generation (Azure-only)

After recommendation, the user can adjust `chunk_size`, `overlap`, `embedding_model`, and `llm_model`. On "Generate Code" the frontend posts hard-coded Azure selections plus the user's `params` to `/api/generate`:

```json
{
  "selections": { "storage": "azure_blob", "document_extraction": "azure_di", "embedding": "azure_openai", "vector_search": "azure_ai_search" },
  "params": { "chunk_size": 512, "overlap": 64, "embedding_model": "...", "llm_model": "...", "chunking_strategy": "...", "top_k": 5 }
}
```

`code_generator.render_pipeline()` accepts both `selections` and `params` and passes them into each Jinja2 template.

### Phase 2 — provider catalog (the core extension point)

Each provider lives in **two files that must stay in sync**:

- `backend/app/providers/<stage>/<provider>.py` — adapter stub + display metadata (`name`, `description`, `pricing_notes`, `requires_env`).
- `backend/app/templates/<stage>/<provider>.py.j2` — Jinja2 template rendered by `/generate`.

Stages: `storage`, `document_extraction`, `embedding`, `vector_search`. Each stage's `__init__.py` exposes a `CATALOG` dict (`provider_id → metadata`); `providers/__init__.py` aggregates them into `STAGES` and exposes `full_catalog()` / `get_provider()`. `code_generator.render_pipeline()` walks a fixed `STAGE_ORDER`, loads `<stage>/<provider_id>.py.j2`, and concatenates the rendered blocks.

**To add a provider:**
1. Add the adapter file under the right stage (keep it dependency-free — no real SDK imports at module load).
2. Add the matching `.py.j2` template (filename must equal the provider id, e.g. `faiss_local.py.j2`).
3. Register the id in `providers/<stage>/__init__.py` `CATALOG`.
4. `/providers` and `/generate` pick it up automatically — no route changes.

### Phase 2 — provider recommendation

`provider_recommender.py` mirrors the Phase 1 pattern: LLM-first (Azure OpenAI, full catalog description in prompt), rules fallback. Rules default: `azure_di` for scanned/table-heavy docs, `azure_openai` for embedding, `azure_blob` for storage, `azure_ai_search` for large docs. After the route returns the recommendation it is persisted to the `provider_recommendation` JSONB column on the latest `recommendations` row for that `doc_id`.

## Conventions

- **Backend:** Pydantic v2 for all I/O. Thin routes, logic in `services/`. Provider stubs stay import-light.
- **Frontend:** function components + hooks. API calls only in `services/api.ts`. Shared types in `src/types/api.ts`. UI primitives in `src/components/ui/` (shadcn). Theme via `src/contexts/ThemeContext.tsx`.
- **Secrets:** never commit. `backend/.env.example` lists required keys; real values go in `backend/.env` (gitignored).
- **Feature specs** live in `_specs/<feature-slug>.md`. **Implementation plans** live in `_plans/<feature-slug>.md`. Use the `/spec` skill to create a spec and the `/plan` mode to create a plan before implementing non-trivial features.

## Key env vars (`backend/.env`)

| Variable                      | Purpose                                      |
|-------------------------------|----------------------------------------------|
| `DATABASE_URL`                | PostgreSQL connection string. Without it, the app uses in-memory fallbacks. |
| `AZURE_DOCINT_ENDPOINT`       | Enables Azure DI metadata extraction         |
| `AZURE_OPENAI_ENDPOINT`       | Enables LLM-based recommendations            |
| `AZURE_OPENAI_KEY`            | Auth for Azure OpenAI                        |
| `AZURE_OPENAI_DEPLOYMENT`     | Deployment name (default: `gpt-4o-mini`)     |
| `AZURE_OPENAI_API_VERSION`    | API version (default: `2024-10-21`)          |

If neither Azure service is configured, the app still works — local extraction + rules-based recommendations.

## Out of scope (for now)

- Executing generated pipelines — both phases emit code only.
- Auth / multi-tenant — single-user local tool.

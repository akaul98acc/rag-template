# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RAG Builder

A two-phase tool for designing RAG (Retrieval-Augmented Generation) pipelines. Both phases **emit Python code — they never execute the pipeline.**

- **Phase 1 — Strategy Agent:** user uploads a document; the agent inspects size + metadata and recommends a chunking strategy, embedding model, and search method. The user can tweak the recommendation, then generate Azure-specific Python code.
- **Phase 2 — Provider Comparator + Code Generator:** user picks a provider for each pipeline stage (storage, document extraction, embedding, vector search). The app shows trade-offs and, on "Generate code", emits a runnable Python code block wired to those choices.

## Stack

- **Frontend:** React 18 + Vite, **TypeScript**. Tailwind CSS + shadcn/ui (Radix primitives). Lives in `frontend/`. Path alias `@` → `frontend/src`.
- **Backend:** FastAPI (Python 3.11+), Pydantic v2. Lives in `backend/`. All routes are mounted under the `/api` prefix.
- **Agent (Phase 1):** Hybrid — deterministic rules first, LLM fallback for ambiguous cases. See `backend/app/services/strategy_agent.py`.
- **Code generation (Phase 1 + Phase 2):** Jinja2 templates, one per provider per stage. See `backend/app/templates/`.

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

- **No test runner is configured yet** for either side (no `pytest.ini`/`pyproject.toml`, no frontend test script). The fastest correctness check is `npm run typecheck` (frontend) and importing/running the FastAPI app (backend).
- **Formatting is automatic:** a `PostToolUse` hook in `.claude/settings.json` runs `npx prettier --write .` after every Write/Edit. Don't hand-format.

## Architecture

### Request flow (frontend → backend)

All frontend HTTP goes through `frontend/src/services/api.ts` (axios client with `baseURL: "/api"`). Components never call axios directly. Backend routes live in `backend/app/api/routes/` and are registered in `backend/app/main.py`, each under the `/api` prefix.

| Method | Path (with prefix) | Purpose                                                                 |
|--------|--------------------|-------------------------------------------------------------------------|
| POST   | `/api/upload`      | Multipart upload. Returns `{ doc_id, metadata }`.                        |
| POST   | `/api/analyze`     | Body `{ doc_id }`. Returns Phase 1 recommendation.                      |
| GET    | `/api/providers`   | Returns the catalog: stages × providers with display metadata.          |
| POST   | `/api/generate`    | Body `{ selections: { stage: provider_id } }`. Returns rendered code.   |
| GET    | `/api/health`      | Liveness check.                                                         |

**Layering convention (enforced):** routes in `api/routes/` are thin — no business logic. Logic lives in `services/`. All request/response I/O uses Pydantic v2 models from `backend/app/models/`.

### Phase 1 — strategy decision logic

`strategy_agent.py` runs two passes:

1. **Rule pass** — deterministic table over `(size_bytes, page_count, mime_type, language)`:
   - tiny (<10 pages, <2MB) → 256-tok chunks, `text-embedding-3-small`, brute-force cosine.
   - medium (10–200 pages) → 512-tok chunks w/ 64 overlap, `text-embedding-3-large`, FAISS.
   - large (>200 pages, or scanned PDFs) → 1024-tok chunks, hierarchical/parent-child retrieval, hybrid (BM25 + dense).
2. **LLM fallback** — if the rule pass is low-confidence (mixed content, unknown language, tabular-heavy), call an LLM with the metadata. Confidence threshold + prompt live in the same module.

Add new rules at the top of `strategy_agent.RULES`, before the LLM fallthrough.

### Phase 1 — code generation (Azure-only)

After the recommendation is shown, the user can adjust `chunk_size`, `overlap`, and `embedding_model` (providers are locked to Azure and shown read-only). On "Generate Code" the frontend posts hard-coded Azure selections to `/api/generate`:

```json
{ "selections": { "storage": "azure_blob", "document_extraction": "azure_di", "embedding": "azure_openai", "vector_search": "azure_ai_search" } }
```

> **Heads-up — current limitation:** the `params` field (`chunk_size`/`overlap`/`embedding_model`) described historically is **not currently threaded through codegen.** `code_generator.render_pipeline()` takes only `selections` and renders each template with `provider=...`; `api.ts#generateCode` sends only `{ selections }`. Templates are not yet parameterized by the tweak fields. If you need the user's tweaks to affect generated code, you must wire `params` through `GenerateRequest` → `render_pipeline` → the Jinja2 templates.

### Phase 2 — provider catalog (the core extension point)

Each provider lives in **two files that must stay in sync**:

- `backend/app/providers/<stage>/<provider>.py` — adapter stub + display metadata (`name`, `description`, `pricing_notes`, `requires_env`).
- `backend/app/templates/<stage>/<provider>.py.j2` — Jinja2 template rendered by `/generate`.

Stages: `storage`, `document_extraction`, `embedding`, `vector_search`. Each stage's `__init__.py` exposes a `CATALOG` dict (`provider_id → metadata`); `providers/__init__.py` aggregates them into `STAGES` and exposes `full_catalog()` / `get_provider()`. `code_generator.render_pipeline()` walks a fixed `STAGE_ORDER`, loads `<stage>/<provider_id>.py.j2`, and concatenates the rendered blocks, collecting `requires_env` across providers.

**To add a provider:**
1. Add the adapter file under the right stage (keep it dependency-free — no real SDK imports at module load, so `/providers` stays fast).
2. Add the matching `.py.j2` template (filename must equal the provider id, e.g. `faiss_local.py.j2`).
3. Register the id in `providers/<stage>/__init__.py` `CATALOG`.
4. `/providers` and `/generate` pick it up automatically — no route changes.

## Conventions

- **Backend:** Pydantic v2 for all I/O. Thin routes, logic in `services/`. Provider stubs stay import-light.
- **Frontend:** function components + hooks. API calls only in `services/api.ts`. Shared types in `src/types/api.ts`. UI primitives in `src/components/ui/` (shadcn). Theme via `src/contexts/ThemeContext.tsx`.
- **Secrets:** never commit. `backend/.env.example` lists required keys; real values go in `backend/.env` (gitignored).

## Out of scope (for now)

- Executing generated pipelines — both phases emit code only.
- Auth / multi-tenant — single-user local tool.
- Persisting uploads beyond process lifetime — in-memory document store is fine.

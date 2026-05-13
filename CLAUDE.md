# RAG Builder

A two-phase tool for designing RAG (Retrieval-Augmented Generation) pipelines.

- **Phase 1 — Strategy Agent:** user uploads a document; the agent inspects size + metadata and recommends a chunking strategy, embedding model, and search method.
- **Phase 2 — Provider Comparator + Code Generator:** user picks a provider for each pipeline stage (storage, document extraction, embedding, vector search). The app shows trade-offs and, on "Generate code", emits a runnable Python code block wired to those choices.

## Stack

- **Frontend:** React (Vite, JavaScript). Lives in `frontend/`.
- **Backend:** FastAPI (Python 3.11+). Lives in `backend/`.
- **Agent (Phase 1):** Hybrid — deterministic rules first, LLM fallback for ambiguous cases. See `backend/app/services/strategy_agent.py`.
- **Code generation (Phase 2):** Jinja2 templates per provider per stage. See `backend/app/templates/`.

## Repo layout

```
Rag/
├── CLAUDE.md
├── .gitignore
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI entry point
│   │   ├── api/routes/                 # HTTP routes
│   │   │   ├── upload.py               # POST /upload
│   │   │   ├── analyze.py              # POST /analyze   (Phase 1)
│   │   │   ├── providers.py            # GET  /providers (Phase 2 catalog)
│   │   │   └── generate.py             # POST /generate  (Phase 2 codegen)
│   │   ├── core/config.py              # settings via pydantic-settings
│   │   ├── models/                     # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── document_analyzer.py    # extracts size, page count, mime, language
│   │   │   ├── strategy_agent.py       # Phase 1 hybrid decision logic
│   │   │   └── code_generator.py       # Phase 2 Jinja2 rendering
│   │   ├── providers/                  # provider catalog (metadata + adapter stubs)
│   │   │   ├── storage/                # azure_blob, aws_s3, gcs, minio
│   │   │   ├── document_extraction/    # azure_di, aws_textract, google_doc_ai, unstructured
│   │   │   ├── embedding/              # openai, aws_bedrock, azure_openai, cohere, hf_local
│   │   │   └── vector_search/          # pinecone, weaviate, faiss, pgvector, azure_ai_search
│   │   └── templates/                  # Jinja2 code templates, mirrors providers/ layout
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── pages/
        │   ├── Phase1.jsx              # upload + strategy view
        │   └── Phase2.jsx              # provider selection + code preview
        ├── components/
        │   ├── DocumentUpload.jsx
        │   ├── StrategyRecommendation.jsx
        │   ├── ProviderSelector.jsx
        │   └── CodeViewer.jsx
        └── services/api.js             # axios client for backend
```

## API contract (current)

| Method | Path          | Purpose                                                                  |
|--------|---------------|--------------------------------------------------------------------------|
| POST   | `/upload`     | Multipart upload. Returns `{ doc_id, metadata }`.                        |
| POST   | `/analyze`    | Body `{ doc_id }`. Returns Phase 1 recommendation (chunking + models).   |
| GET    | `/providers`  | Returns the catalog: stages × providers with display metadata.           |
| POST   | `/generate`   | Body `{ selections: { stage: provider_id } }`. Returns rendered code.    |

## Phase 1 — decision logic

The hybrid agent in `strategy_agent.py` runs in two passes:

1. **Rule pass** — deterministic table over `(size_bytes, page_count, mime_type, language)`:
   - tiny (<10 pages, <2MB) → small chunks (256 tok), `text-embedding-3-small`, brute-force cosine.
   - medium (10–200 pages) → 512 tok chunks w/ 64 overlap, `text-embedding-3-large`, FAISS.
   - large (>200 pages, or scanned PDFs) → 1024 tok chunks, hierarchical/parent-child retrieval, hybrid (BM25 + dense).
2. **LLM fallback** — if the rule pass produces low confidence (mixed content type, unknown language, tabular-heavy), call an LLM with the metadata and let it pick. Confidence threshold + prompt live in the same module.

Add new rules at the top of `strategy_agent.RULES` before falling through to the LLM.

## Phase 2 — provider catalog

Each provider lives in two places that **must stay in sync**:

- `backend/app/providers/<stage>/<provider>.py` — adapter stub + display metadata (`name`, `description`, `pricing_notes`, `requires_env`).
- `backend/app/templates/<stage>/<provider>.py.j2` — Jinja2 template rendered by `/generate`.

To add a provider:
1. Drop the adapter file under the right stage.
2. Drop the matching `.py.j2` template.
3. Register the provider in `providers/<stage>/__init__.py` (`CATALOG` dict).
4. `/providers` and `/generate` pick it up automatically — no route changes needed.

## Local development

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev    # serves on http://localhost:5173, proxies /api to :8000
```

## Conventions

- **Backend:** Pydantic v2 for all I/O. Routes are thin; logic lives in `services/`. No business logic in `api/routes/`.
- **Frontend:** Function components + hooks. Keep API calls inside `services/api.js`, not inside components.
- **Provider stubs:** keep them dependency-free (no real SDK imports at module load) so the catalog endpoint stays fast and doesn't require every cloud SDK to be installed.
- **Secrets:** never commit. `.env.example` lists required keys; real values go in `backend/.env` (gitignored).

## Out of scope (for now)

- Actually running the generated pipelines end-to-end — Phase 2 emits code, it does not execute it.
- Auth / multi-tenant — single-user local tool.
- Persisting uploads beyond the process lifetime — in-memory document store is fine for Phase 1.

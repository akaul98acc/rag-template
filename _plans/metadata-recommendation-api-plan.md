# Implementation Plan: Metadata-Driven Pipeline Recommendation API

> Spec: `_specs/metadata-recommendation-api.md`
> Owner: backend-agent (backend changes only)

---

## 1. Context

After upload, the app already extracts rich `DocumentMetadata` (size, pages, tables, images, language, `is_scanned`, plus derived `text_density`/`table_ratio`/`doc_type`/`content_type`/`avg_*`). Today the only consumer is `POST /api/analyze`, which runs the deterministic `strategy_agent` rules and returns a `StrategyRecommendation` (chunking tokens + search method).

We want a richer, **LLM-driven** recommendation that a pipeline builder can call straight after upload: pick an **embedding model**, an **LLM model**, and a **chunking strategy** (+ `chunk_size`, `overlap`, `top_k`) using *all* metadata as context, returned as constrained JSON. Azure OpenAI **GPT-4o-mini** does the reasoning; when it's unconfigured/erroring/throttled, we degrade to the existing rules engine so the endpoint never hard-fails. `/api/analyze` and the rules engine stay byte-for-byte unchanged (rules are *reused*, not modified).

---

## 2. Key findings from the codebase

- **Route pattern** (`api/routes/analyze.py`): `AnalyzeRequest{doc_id}` → `get_document(doc_id)` → 404 if `None` → `await recommend_strategy(doc.metadata)`. We mirror this but return a new model and use **422** (not 404) per spec.
- **Document store** (`services/document_analyzer.py`): `get_document(doc_id) -> StoredDocument | None`, `StoredDocument.metadata` is a `DocumentMetadata`. Reused unchanged.
- **Rules engine** (`services/strategy_agent.py`): `async def recommend_strategy(meta) -> StrategyRecommendation`. Output fields: `chunk_size_tokens`, `chunk_overlap_tokens`, `embedding_model` (∈ `text-embedding-3-small`/`-large`), `search_method`, `rationale`, `source`, `confidence`. **No `llm_model`, `chunking_strategy` (vocab), or `top_k`** → the fallback path must supply defaults for those (see §5).
- **Response shape differs** from `StrategyRecommendation`, so a **new Pydantic model** is required — do not overload the existing one.
- **Azure service pattern** (`services/azure_document_intelligence.py`): lazy SDK import inside the call, `is_azure_di_configured()` returns `bool(settings.azure_docint_endpoint)`, typed exceptions, fall-back-on-error in the caller. We mirror this style.
- **Config** (`core/config.py`): pydantic-settings; field name → ENV var (e.g. `azure_openai_endpoint` → `AZURE_OPENAI_ENDPOINT`); `extra="ignore"`. Existing Azure DI fields are `azure_docint_*`.
- **Vocabularies** (confirmed against `frontend/src/config/configuratorOptions.ts` + spec):
  - `embedding_model` ∈ {`text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`}
  - `llm_model` ∈ {`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`}
  - `chunking_strategy` ∈ {`auto`, `fixed`, `semantic`, `sliding`, `recursive`, `sentence`}
  - Defaults from `PARAMETER_CONFIGS`: `chunk_size=512`, `overlap=64`, `top_k=5`.
- **SDK note (correction):** the package is **`openai`**, imported as `from openai import AzureOpenAI` (NOT `azure.openai`). Add `openai` to requirements.

---

## 3. Design decisions (resolved)

- **422 completeness rule = core fields only** (user-confirmed): return 422 only when `doc_id` is unknown/expired **or** any of `filename` / `size_bytes` / `mime_type` is missing/empty. All other fields (`page_count`, `language`, derived stats) may be `None` — the LLM/rules handle them. This keeps images & scanned PDFs working when called right after upload.
- **New response model** `PipelineRecommendation` (separate from `StrategyRecommendation`); LLM picks validated via `Literal` enums so invalid values can't reach the client.
- **Orchestration:** try LLM first; on *any* failure (not configured, SDK missing, network/throttle/auth error, malformed JSON, or vocab-validation failure) → fall back to rules. `source` reflects the path (`"llm"` | `"rules"`).
- **Async safety + timeout:** call the **sync** `AzureOpenAI` client (matches spec wording) inside `await asyncio.to_thread(...)` with an explicit client `timeout`, so a slow/hung LLM never blocks the event loop and degrades to the fast rules path.
- **Confidence** (Q2): model-reported, clamped to `[0, 1]`; default `0.7` if absent/unparseable.
- **api-version** (Q1): default to a current GA value `"2024-10-21"`, overridable via env.

---

## 4. Response contract (`PipelineRecommendation`)

```python
EmbeddingModel = Literal["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"]
LLMModel       = Literal["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
ChunkingStrategy = Literal["auto", "fixed", "semantic", "sliding", "recursive", "sentence"]

class PipelineRecommendation(BaseModel):
    embedding_model: EmbeddingModel
    llm_model: LLMModel
    chunking_strategy: ChunkingStrategy
    chunk_size: int
    overlap: int
    top_k: int
    rationale: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["llm", "rules"]
```

`RecommendRequest{ doc_id: str }` (dedicated model mirroring `AnalyzeRequest`; both exported from `models/__init__.py`).

---

## 5. Rules → recommendation mapping (fallback path)

Call existing `recommend_strategy(meta)` and map its `StrategyRecommendation` into `PipelineRecommendation`:

| New field | From rules output | Notes |
|-----------|-------------------|-------|
| `embedding_model` | `embedding_model` | already in allowed vocab (`-small`/`-large`) |
| `chunk_size` | `chunk_size_tokens` | direct |
| `overlap` | `chunk_overlap_tokens` | direct |
| `rationale` | `rationale` | direct |
| `confidence` | `confidence` | direct |
| `source` | — | force `"rules"` |
| `llm_model` | — | default `"gpt-4o-mini"` (matches the deployment) |
| `top_k` | — | default `5` |
| `chunking_strategy` | derived from `search_method` | `hybrid_bm25_dense`/large/scanned → `"recursive"`; else → `"fixed"` (small mapping documented in the service) |

---

## 6. Step-by-step changes

### Step 1 — Config (`backend/app/core/config.py` + `backend/.env.example`)
- Add to `Settings`: `azure_openai_endpoint: str | None = None`, `azure_openai_key: str | None = None`, `azure_openai_deployment: str = "gpt-4o-mini"`, `azure_openai_api_version: str = "2024-10-21"`.
- Add to `.env.example` (empty values, no secrets): `AZURE_OPENAI_ENDPOINT=`, `AZURE_OPENAI_KEY=`, `AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini`, `AZURE_OPENAI_API_VERSION=2024-10-21`.

### Step 2 — Dependencies (`backend/requirements.txt`)
- Add `openai>=1.40`. (Lazy-imported; app still boots without it installed.)

### Step 3 — Models (`backend/app/models/strategy.py` + `__init__.py`)
- Add `RecommendRequest` and `PipelineRecommendation` (with the `Literal` vocab types from §4).
- Export both from `models/__init__.py` `__all__`.

### Step 4 — New service `backend/app/services/pipeline_recommender.py`
- Vocab constants (the three `Literal` sets) + defaults (`512/64/5`).
- `is_azure_openai_configured() -> bool` → `bool(endpoint and key and deployment)`.
- `_llm_recommend(meta) -> PipelineRecommendation`:
  - Lazy `from openai import AzureOpenAI` inside the function (RuntimeError → caught by caller).
  - Build client with endpoint/key/api_version + a short request `timeout`.
  - System prompt enumerates the allowed vocab and required JSON keys; user message serializes **all** metadata fields (`meta.model_dump()`); `response_format={"type": "json_object"}`, `temperature=0`.
  - Run via `await asyncio.to_thread(client.chat.completions.create, ...)`.
  - `json.loads` the content; clamp `confidence` to `[0,1]` (default `0.7`); construct `PipelineRecommendation(source="llm", ...)` — Pydantic `Literal` validation rejects out-of-vocab picks (raises → caught → rules fallback).
- `_rules_recommend(meta) -> PipelineRecommendation`: `await recommend_strategy(meta)` then map per §5 (`source="rules"`).
- `recommend_pipeline(meta) -> PipelineRecommendation` (public): if configured, `try` `_llm_recommend`; on **any** `Exception` (incl. `RuntimeError`/`ValidationError`/`json` errors/transport) log a warning and return `_rules_recommend`. If not configured, go straight to rules. One INFO log line per path (no document content logged).

### Step 5 — New route `backend/app/api/routes/recommend.py`
- `@router.post("/recommend", response_model=PipelineRecommendation)`, `async def recommend(req: RecommendRequest)`.
- `doc = get_document(req.doc_id)`; if `None` → `HTTPException(422, "Document not found or expired — please upload the document again.")`.
- Core-fields completeness check on `doc.metadata` (filename/size_bytes/mime_type) → same 422 message if missing.
- `return await recommend_pipeline(doc.metadata)`.
- Keep the route thin (no business logic) per project conventions.

### Step 6 — Register router (`backend/app/main.py`)
- `from app.api.routes import recommend` and `app.include_router(recommend.router, prefix="/api", tags=["phase1"])`.

### Step 7 — Leave untouched
- `strategy_agent.py`, `analyze.py`, `document_analyzer.py`, the existing `StrategyRecommendation`, Azure DI service. No frontend changes (documented follow-up).

---

## 7. Edge cases (from spec)

| Scenario | Handling |
|----------|----------|
| Unknown/expired `doc_id` | 422 "upload again" |
| Missing core field (filename/size/mime) | 422 "upload again" |
| Azure OpenAI not configured | rules path, 200, `source:"rules"` |
| Azure error / throttle / timeout | caught → rules path, 200, `source:"rules"` |
| Malformed / non-JSON LLM output | `json`/parse guard → rules fallback |
| LLM picks outside vocab | `Literal` validation fails → rules fallback (never reaches client) |
| Images / scanned PDFs (None fields) | allowed; recommendation still produced |

---

## 8. Verification

1. **Boots without SDK:** `python -c "import app.main"` from `backend/` (venv active) — confirms lazy import, fast startup.
2. **Rules fallback (no Azure):** with `AZURE_OPENAI_*` unset, `POST /api/recommend {doc_id}` for an uploaded doc → 200, valid vocab values, `source:"rules"`.
3. **LLM path (Azure set):** with real env, same call → 200, `source:"llm"`, all three enum fields within vocab, `confidence ∈ [0,1]`.
4. **422 paths:** unknown `doc_id` → 422; (simulate) missing core field → 422 with upload-again message.
5. **Vocab guard:** unit-poke `_llm_recommend` parsing with a fabricated out-of-vocab pick → confirm it raises and `recommend_pipeline` returns rules result.
6. **Regression:** `POST /api/analyze` for the same `doc_id` still returns the original `StrategyRecommendation` unchanged.
7. **No content leakage:** confirm logs contain only field summaries, not document text.

> No automated test runner is configured (per CLAUDE.md); verification is manual via the running app. Frontend unchanged → `npm run typecheck` unaffected.

---

## 9. Files touched

| File | Change |
|------|--------|
| `backend/app/core/config.py` | Add 4 `azure_openai_*` settings |
| `backend/.env.example` | Add 4 `AZURE_OPENAI_*` keys (no secrets) |
| `backend/requirements.txt` | Add `openai>=1.40` |
| `backend/app/models/strategy.py` | Add `RecommendRequest`, `PipelineRecommendation` (+ `Literal` vocab) |
| `backend/app/models/__init__.py` | Export the two new models |
| `backend/app/services/pipeline_recommender.py` | **New** — LLM + rules-fallback orchestration |
| `backend/app/api/routes/recommend.py` | **New** — thin `POST /recommend` route (422 on invalid doc) |
| `backend/app/main.py` | Register the new router under `/api` |

No frontend, no changes to `analyze`/`strategy_agent`/document store behavior.

---

## 10. Risks & open items

- **Async vs sync SDK:** plan uses sync `AzureOpenAI` via `asyncio.to_thread` + client `timeout` to stay non-blocking and honor the spec's wording. (`AsyncAzureOpenAI` is an alternative if preferred.)
- **`chunking_strategy` in fallback** is heuristic (rules engine has no such concept) — documented mapping in §5; acceptable since fallback is best-effort.
- **Prompt drift:** model must return strict JSON keys; mitigated by `response_format=json_object`, `temperature=0`, explicit key list, and `Literal` validation with rules fallback.

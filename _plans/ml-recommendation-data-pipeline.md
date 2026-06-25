# Plan: Store Recommendations in DB (Phase 1 — Data Collection)

**Spec:** `_specs/ml-recommendation-data-pipeline.md`  
**Branch:** `claude/feature/ml-recommendation-data-pipeline`  
**Scope:** Persist every recommendation to NeonDB only. No feedback API, no training export, no ML flag.

---

## Context

Every call to `/api/recommend` generates a recommendation via LLM or rules engine, but the result is never saved. To build a training dataset for a future ML model, each recommendation must be stored alongside the document metadata snapshot that produced it. This phase just wires that persistence — nothing else changes for users or downstream consumers.

---

## What Changes

### 1. `backend/app/services/database.py` — MODIFY

Append two `CREATE TABLE IF NOT EXISTS` blocks to `_ensure_schema()` after the existing `documents` DDL:

```sql
CREATE TABLE IF NOT EXISTS recommendations (
    id                   TEXT        PRIMARY KEY,
    doc_id               TEXT        REFERENCES documents(doc_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source               TEXT        NOT NULL,      -- 'llm' or 'rules'
    model_version        TEXT        NOT NULL,      -- e.g. 'gpt-4o-mini-2024-10-21' or 'rules-v1'
    confidence           FLOAT,
    raw_llm_response     JSONB,                     -- full LLM response, null for rules path
    -- Metadata snapshot (inputs)
    filename             TEXT,
    size_bytes           BIGINT,
    page_count           INT,
    is_scanned           BOOLEAN,
    has_tables           BOOLEAN,
    table_count          INT,
    image_count          INT,
    doc_type             TEXT,
    content_type         TEXT,
    text_density         TEXT,
    avg_words_per_page   FLOAT,
    table_ratio          FLOAT,
    avg_sentence_length  FLOAT,
    -- Recommendation outputs (labels)
    embedding_model      TEXT NOT NULL,
    llm_model            TEXT NOT NULL,
    chunking_strategy    TEXT NOT NULL,
    chunk_size           INT  NOT NULL,
    overlap              INT  NOT NULL,
    top_k                INT  NOT NULL,
    rationale            TEXT
);

CREATE INDEX IF NOT EXISTS idx_rec_source     ON recommendations(source);
CREATE INDEX IF NOT EXISTS idx_rec_created_at ON recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_rec_doc_id     ON recommendations(doc_id);
```

Also add the async write function to the same file (keeps all DB logic in one place):

```python
async def db_save_recommendation(rec_id, doc_id, meta, rec, model_version, raw_llm_response) -> None
```

Follow the exact same pattern as `db_register_document`: a nested `_insert()` function, `asyncio.to_thread(_insert)`, `_lock`, and an in-memory fallback dict (`_RECS_FALLBACK`) when `_conn is None`.

---

### 2. `backend/app/services/pipeline_recommender.py` — MODIFY

- Generate `rec_id = uuid.uuid4().hex` at the top of `recommend_pipeline()`.
- After the recommendation is resolved (LLM or rules path), fire a **fire-and-forget** `asyncio.create_task()` to write to DB. This avoids adding `BackgroundTasks` to the function signature and keeps the change minimal.
- Capture `raw_llm_response` from `_llm_recommend()` (return the raw completion JSON alongside the parsed result — use a small internal tuple or dataclass).
- `model_version` convention:
  - `source='llm'` → `f"{settings.azure_openai_deployment}-{settings.azure_openai_api_version}"`
  - `source='rules'` → `"rules-v1"`
- The DB write must not block the response. If it fails, log a `WARNING` and continue.

**No change to the return type** — `recommend_pipeline()` still returns `PipelineRecommendation`. `rec_id` is internal only for now.

---

## Files NOT Changing

| File | Reason |
|------|--------|
| `recommend.py` route | No contract change — response shape unchanged |
| `models/` | No new models needed |
| `config.py` | No new env vars |
| `.env.example` | No changes |
| `main.py` | No new routers |
| Frontend | No changes |

---

## Implementation Order

1. Add DDL + `db_save_recommendation()` to `database.py`
2. Modify `pipeline_recommender.py` to generate `rec_id` and fire async write
3. Start backend once — NeonDB auto-creates the table via `_ensure_schema()`

---

## Verification

1. Start backend: `uvicorn app.main:app --reload --port 8000`
2. Upload any PDF → call `POST /api/recommend`
3. Query NeonDB:
   ```sql
   SELECT id, doc_id, source, model_version, chunking_strategy, chunk_size, doc_type, created_at
   FROM recommendations
   ORDER BY created_at DESC
   LIMIT 5;
   ```
4. Confirm one row exists with correct `source`, `model_version`, and metadata fields populated
5. Confirm `/api/recommend` response is unchanged (no `recommendation_id` in response)
6. Confirm response time is not noticeably increased (write is async, non-blocking)

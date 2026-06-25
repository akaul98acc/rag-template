# Feature: Recommendation & Feedback Storage

> **Status:** Ready for Engineering
> **Author:** Adarsh Kaul
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **Scope:** Store every recommendation + optional user feedback. Nothing else.

---

## Overview

RAG Builder generates pipeline recommendations via an Azure OpenAI LLM call with a
deterministic rules fallback. Right now nothing is persisted — every recommendation
is ephemeral.

This feature writes every recommendation to Postgres alongside the document metadata
that produced it, and captures optional user feedback on whether the recommendation
was used as-is or changed. That's it. No ML, no export endpoint, no feature flag —
those come later once we have rows to work with.

**Why store now:** once we have ~500–1000 labelled rows we can train an ML model to
replace the LLM. Without this layer, that future work can never happen. The schema
is designed to be forward-compatible with ML training without requiring migration changes.

---

## Scope

### In scope
- Create `recommendations` table and write one row per `/api/recommend` call
- Create `recommendation_feedback` table and write one row when user gives signal
- Surface `recommendation_id` in the `/api/recommend` response (only addition to existing contract)
- New `POST /api/feedback` endpoint

### Out of scope (future features)
- `/api/training-data` export endpoint
- `RECOMMENDATION_SOURCE` feature flag
- ML model loading or inference
- Frontend thumbs widget (P1 — needs the endpoint first)
- Any changes to `/api/recommend` request shape

---

## Why Two Separate Tables

`recommendations` and `recommendation_feedback` must stay separate:

| Reason | Detail |
|--------|--------|
| Different lifecycles | Recommendation written once on inference, never updated. Feedback written later by a different actor (the user). |
| Append-only integrity | `recommendations` should never be UPDATEd — each row is a timestamped event. Combining would require UPDATE operations on what should be immutable records. |
| Optional relationship | Most recommendations will never have feedback. One combined table means nullable columns on every row for fields that only apply to ~30% of rows. |
| Future ML training | The ML training query is a clean JOIN between features (recommendations) and labels (feedback). Combined table makes that query ambiguous and harder to weight correctly. |
| Document purge safety | `recommendations` uses `ON DELETE SET NULL` on `doc_id` so training rows survive if a document is deleted. Feedback only FK's to `recommendations`, never to `documents`. |

---

## Database Schema

### Table: `recommendations`

One row per `/api/recommend` call. Metadata columns are **denormalised scalars**
(not FK'd from `documents`) so rows survive document purges and form self-contained
training records.

```sql
CREATE TABLE recommendations (
    -- Identity
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id               TEXT        REFERENCES documents(doc_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Provenance
    -- source:        'llm' | 'rules'  (only two values until ML is built)
    -- model_version: 'gpt-4o-mini-2024-10-21' for LLM, 'rules-v1' for rules engine
    -- confidence:    0.9 if LLM output parsed cleanly, 0.6 if any field needed
    --                correction, 1.0 for rules (deterministic)
    source               TEXT        NOT NULL CHECK (source IN ('llm', 'rules', 'ml')),
    model_version        TEXT        NOT NULL,
    confidence           FLOAT       CHECK (confidence BETWEEN 0 AND 1),
    raw_llm_response     JSONB,
    -- ^ Nullable. Only populated when source='llm'.
    --   Stores the full Azure OpenAI response for debugging bad recommendations.

    -- Metadata features — snapshot at time of inference
    -- These are copied from DocumentMetadata, not FK'd, so they survive doc purges.
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

    -- Recommendation outputs (labels for future ML training)
    chunking_strategy    TEXT        NOT NULL,
    chunk_size           INT         NOT NULL,
    overlap              INT         NOT NULL,
    embedding_model      TEXT        NOT NULL,
    llm_model            TEXT        NOT NULL,
    top_k                INT         NOT NULL,
    rationale            TEXT
);

CREATE INDEX idx_recommendations_source     ON recommendations(source);
CREATE INDEX idx_recommendations_created_at ON recommendations(created_at);
CREATE INDEX idx_recommendations_doc_id     ON recommendations(doc_id);
```

---

### Table: `recommendation_feedback`

One row per recommendation, written only when the user interacts with the
feedback widget. Most recommendations will have no feedback row — that is expected.

```sql
CREATE TABLE recommendation_feedback (
    -- Identity
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id        UUID        NOT NULL REFERENCES recommendations(id)
                                             ON DELETE CASCADE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Signal
    -- outcome: 'accepted' = used as-is, 'modified' = changed before use,
    --          'rejected' = dismissed without generating code
    outcome                  TEXT        NOT NULL
                                 CHECK (outcome IN ('accepted', 'modified', 'rejected')),
    notes                    TEXT,
    -- ^ Optional free-text. Rarely filled — useful when users reject
    --   (e.g. "wrong doc type detected", "chunk size too large").

    -- Final values the user actually used.
    -- NULL on any column = user kept the recommended value unchanged.
    final_chunking_strategy  TEXT,
    final_chunk_size         INT,
    final_overlap            INT,
    final_embedding_model    TEXT,
    final_llm_model          TEXT,
    final_top_k              INT,

    -- Enforce one feedback row per recommendation
    UNIQUE (recommendation_id)
);

CREATE INDEX idx_feedback_recommendation_id ON recommendation_feedback(recommendation_id);
```

---

## API Changes

### `POST /api/recommend` — minimal addition only

The request body and all existing response fields are **unchanged**.
One field is added to the response: `recommendation_id`.

```jsonc
// Response — existing fields unchanged, one field added
{
  "chunking_strategy": "table_aware",
  "chunk_size": 512,
  "overlap": 64,
  "embedding_model": "azure-text-embedding-3-large",
  "llm_model": "gpt-4o",
  "top_k": 5,
  "rationale": "High table density requires structure-aware chunking.",

  "recommendation_id": "a1b2c3d4-e5f6-..."   // ADDED — needed for feedback POST
}
```

The DB write uses FastAPI `BackgroundTasks` — it fires after the response is
returned. If the write fails, a `WARNING` is logged and the user is unaffected.
Persistence must never block the recommendation response.

---

### `POST /api/feedback` — new endpoint

```
POST /api/feedback
Content-Type: application/json
```

**Request body:**

```jsonc
{
  "recommendation_id": "a1b2c3d4-...",    // required
  "outcome": "modified",                   // required
  "notes": "Chunk size was too large",     // optional
  "final_chunk_size": 256,                // optional — only changed fields
  "final_chunking_strategy": "sentence"   // optional — only changed fields
}
```

**Responses:**

| Status | When |
|--------|------|
| `200 OK` | Feedback written successfully |
| `404 Not Found` | `recommendation_id` does not exist — no orphan rows created |
| `409 Conflict` | Feedback already exists for this `recommendation_id` |

---

## Implementation Tasks

### P0 — Ship together (store-only)

- [ ] **Migration 001:** Create `recommendations` table with all columns and indexes
- [ ] **Migration 002:** Create `recommendation_feedback` table with unique constraint and index
- [ ] **`recommendation_store.py`** ← NEW service — isolates all DB write logic from the recommender.
  Exposes two functions:
  - `async def save_recommendation(rec: RecommendationRecord) -> UUID`
  - `async def save_feedback(feedback: FeedbackRequest) -> None`
- [ ] **`pipeline_recommender.py`** ← MODIFY — after `_llm_recommend()` resolves, enqueue
  `save_recommendation()` as a `BackgroundTask`. Populate `source`, `model_version`,
  `confidence`, and `raw_llm_response` per the conventions in the schema comments above.
- [ ] **`/api/recommend` response** — append `recommendation_id` (UUID string) to the
  existing `PipelineRecommendation` Pydantic model. Do not change any other field.
- [ ] **Pydantic models** in `backend/app/models/recommendation.py` ← NEW:
  - `RecommendationRecord` — mirrors the `recommendations` table columns
  - `FeedbackRequest` — request body for `POST /api/feedback`
  - `FeedbackResponse` — `{ "status": "ok" }`
- [ ] **`feedback.py`** route ← NEW in `backend/app/api/routes/`:
  - Validates `recommendation_id` exists → 404 if not
  - Checks for duplicate → 409 if exists
  - Calls `save_feedback()` → 200

### P1 — Follow-up sprint

- [ ] **Frontend:** Thumbs up/down widget on Agent Decisions tab. POSTs to
  `/api/feedback` using `recommendation_id` from the recommendation response.
  Shows confirmation state after submit.
- [ ] **Frontend:** Optional `notes` textarea shown when user clicks thumbs down.

### Out of scope for this ticket

- `GET /api/training-data` export endpoint
- `RECOMMENDATION_SOURCE` / `ML_MODEL_PATH` feature flag
- ML model loading or inference path

---

## Files to Touch

```
backend/
├── app/
│   ├── api/routes/
│   │   └── feedback.py              ← CREATE  (POST /api/feedback)
│   ├── models/
│   │   └── recommendation.py        ← CREATE  (RecommendationRecord, FeedbackRequest)
│   ├── services/
│   │   ├── pipeline_recommender.py  ← MODIFY  (add BackgroundTask write + recommendation_id)
│   │   └── recommendation_store.py  ← CREATE  (save_recommendation, save_feedback)
│   └── main.py                      ← MODIFY  (register feedback router)
├── migrations/
│   ├── 001_create_recommendations.sql         ← CREATE
│   └── 002_create_recommendation_feedback.sql ← CREATE
└── .env.example                               ← no changes needed this sprint
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|--------------------|
| DB write fails after recommendation returned | Log `WARNING`, do not retry, user unaffected |
| `recommendation_id` missing from feedback POST | `404` — no orphan rows |
| Duplicate feedback for same recommendation | `409` — enforced by `UNIQUE(recommendation_id)` at DB level |
| Document deleted after recommendation stored | `doc_id` → `NULL` via `ON DELETE SET NULL`, training row preserved |
| LLM returns malformed JSON, corrected by rules | Write with `source='llm'`, `confidence=0.6`, full broken output in `raw_llm_response` |

---

## Acceptance Criteria

### Functional

- [ ] A successful `POST /api/recommend` inserts one row into `recommendations` with all
      metadata features, all label fields, `source`, `model_version`, `confidence`,
      and `raw_llm_response` populated
- [ ] The `POST /api/recommend` response includes `recommendation_id`
- [ ] `POST /api/feedback` with a valid `recommendation_id` writes to
      `recommendation_feedback` and returns `200`
- [ ] `POST /api/feedback` with an unknown `recommendation_id` returns `404`
      and creates no row
- [ ] `POST /api/feedback` for an already-feedback'd recommendation returns `409`

### Non-Functional

- [ ] DB write adds less than 20ms to `POST /api/recommend` response time
      (enforced by `BackgroundTasks` — write is post-response)
- [ ] No document text content stored — only scalar metadata signals
- [ ] All new routes have Pydantic v2 request/response models
- [ ] Write failure never surfaces as an error to the end user

---

## Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Minimum row count to trigger ML promotion decision (suggested: 500 accepted rows) | Data scientist | — |
| 2 | ML algorithm family for future training (XGBoost/LightGBM preferred for tabular) | Data scientist | — |
| 3 | Model artefact location when ready: repo vs Azure Blob at startup | Backend engineer | — |
| 4 | ~~Does frontend need `recommendation_id` for the feedback widget?~~ | — | **Resolved: Yes** — appended to `/api/recommend` response |

---

## Dependencies

- [x] `psycopg2-binary` in `requirements.txt`
- [x] NeonDB live, `DATABASE_URL` configured
- [x] `documents` table live (PR #12)
- [ ] Migrations 001 and 002 — Backend engineer
- [ ] Frontend thumbs widget — P1 sprint, Frontend engineer
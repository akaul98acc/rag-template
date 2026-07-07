# Plan: Star Rating Feedback with Recommendation Reuse

## Context

Users currently have no way to signal whether a Phase 1 (pipeline strategy) or Phase 2 (provider selection) recommendation was useful. Adding a 1–5 star rating widget captures that signal. When a highly-rated (≥ 4 stars) past recommendation exists for a document with a matching `doc_type` + `language` + size bucket, the app pre-fills it on upload — skipping the LLM call and saving time. A new `Source` field (`LLM` / `Rules` / `Past Recommendations`) is surfaced in both phases so the user always knows how the recommendation was produced.

Spec: `_specs/star-rating-feedback-reuse.md`

---

## Key Findings from Codebase Exploration

- **`/api/feedback`** (`feedback.py`) accepts `FeedbackRequest` but has no `rating` or `phase` fields yet. The `recommendation_feedback` table also lacks these columns.
- **`recommend_pipeline()`** in `pipeline_recommender.py` mints a fresh UUID and calls the LLM/rules on every invocation — no history check exists. The function already receives `doc_id` and `meta` (which includes `doc_type` and `page_count`), so the lookup can be inserted cleanly at the top of the function.
- **`recommendation_store.py`** is write-only; no read functions exist. A new read function is needed.
- **`recommendations` table** has a `source TEXT CHECK IN ('llm', 'rules', 'ml')` constraint that must be extended to include `'past_recommendations'`.
- **`language`** is not a column on `recommendations` — it lives in `documents.metadata JSONB`. The lookup query must JOIN `documents` to filter on language.
- **Step1.tsx** already renders a "Decision source" `<dt>`/`<dd>` row (lines 525–531) that maps `source` to a string. This is the natural anchor for the `Past Recommendations` label and banner.
- **Step2.tsx** stores `providerRec.source` and `providerRec.confidence` but renders neither. A Source display and banner need to be added alongside the existing rationale block (lines 364–370).
- **No feedback UI exists** anywhere in the frontend. `submitFeedback` must be added to `services/api.ts`.
- **`"past_recommendations"`** must be added to the `source` union in both `PipelineRecommendation` and `ProviderRecommendation` TypeScript interfaces (`src/types/api.ts`).
- **Toast pattern**: `import { toast } from "@/hooks/use-toast"` with `{ title, description, variant? }` — used in Step1 and Step2 already.
- **Size bucket thresholds** (from `strategy_agent.py`): small = `page_count < 10`, large = `page_count > 200`, medium = everything else.

---

## Implementation Steps

### 1 — Database: extend schema

**File:** `backend/app/services/database.py`

In `_ensure_schema()`, after the existing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS provider_recommendation` statement, add:

- `ALTER TABLE recommendation_feedback ADD COLUMN IF NOT EXISTS rating INT CHECK (rating >= 1 AND rating <= 5);`
- `ALTER TABLE recommendation_feedback ADD COLUMN IF NOT EXISTS phase INT CHECK (phase IN (1, 2));`
- Drop and recreate the `source` CHECK constraint on `recommendations` to include `'past_recommendations'`:
  ```
  ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_source_check;
  ALTER TABLE recommendations ADD CONSTRAINT recommendations_source_check
    CHECK (source IN ('llm', 'rules', 'ml', 'past_recommendations'));
  ```

---

### 2 — Backend models: extend `FeedbackRequest` and `source` literals

**File:** `backend/app/models/recommendation.py`

- Add `rating: int = Field(..., ge=1, le=5)` and `phase: int = Field(..., ge=1, le=2)` to `FeedbackRequest` (lines 41–50).
- Add `"past_recommendations"` to the `source` Literal on `PipelineRecommendation` and `ProviderRecommendation`.

---

### 3 — Backend: size bucket helper

**File:** `backend/app/services/strategy_agent.py`

Add a module-level function:

```python
def get_size_bucket(page_count: int | None) -> str:
    if page_count is None or page_count < 10:
        return "small"
    if page_count > 200:
        return "large"
    return "medium"
```

Reuses the existing `_tiny` / `_large` / `_medium` thresholds already implicit in that file.

---

### 4 — Backend: new read functions for reusable recommendations

**File:** `backend/app/services/recommendation_store.py`

Add two async read functions (using `asyncio.to_thread` consistent with the rest of the module):

**`get_reusable_phase1_recommendation(doc_type, language, size_bucket)`**
- Queries `recommendations r JOIN recommendation_feedback rf ON rf.recommendation_id = r.id JOIN documents d ON d.doc_id = r.doc_id`
- WHERE `rf.rating >= 4 AND r.doc_type = %s AND d.metadata->>'language' = %s` and `r.page_count` matches size bucket thresholds
- ORDER BY `r.created_at DESC LIMIT 1`
- Returns a `RecommendationRecord | None`
- In-memory fallback: returns `None`

**`get_reusable_phase2_recommendation(doc_type, language, size_bucket)`**
- Same join pattern, additionally filters `r.provider_recommendation IS NOT NULL`
- Returns the `provider_recommendation JSONB` as a dict, or `None`
- In-memory fallback: returns `None`

---

### 5 — Backend: proactive reuse in Phase 1

**File:** `backend/app/services/pipeline_recommender.py`  
**File:** `backend/app/api/routes/recommend.py`  
**File:** `backend/app/models/recommendation.py` (`RecommendRequest`)

At the top of `recommend_pipeline()` (after line 67, before the LLM/rules branch):

1. Extract `doc_type`, `language` (from `meta`), and `size_bucket = get_size_bucket(meta.page_count)`.
2. If `force_fresh=False`, call `get_reusable_phase1_recommendation(...)`.
3. If a record is returned, build a `PipelineRecommendation` from it with `source="past_recommendations"` and return immediately — no LLM call, no new DB row persisted.

Add `force_fresh: bool = False` to `recommend_pipeline()` signature, `RecommendRequest`, and the route handler.

---

### 6 — Backend: proactive reuse in Phase 2

**File:** `backend/app/services/provider_recommender.py`  
**File:** `backend/app/api/routes/recommend_providers.py`

Mirror the Phase 1 pattern:

1. At the top of the Phase 2 recommendation function, call `get_reusable_phase2_recommendation(...)`.
2. If a match exists, reconstruct a `ProviderRecommendation` from the stored JSONB with `source="past_recommendations"` and return early.
3. Add `force_fresh: bool = False` to the Phase 2 request body and thread it through.

---

### 7 — Backend: persist rating and phase in `save_feedback()`

**File:** `backend/app/services/recommendation_store.py`

Update the INSERT in `save_feedback()` to write the new `rating` and `phase` columns. Update the in-memory fallback dict to store these fields too.

---

### 8 — Frontend: types and API service

**File:** `frontend/src/types/api.ts`

- Add `"past_recommendations"` to `source` in `PipelineRecommendation` and `ProviderRecommendation`.
- Add `FeedbackRequest` interface: `{ recommendation_id: string; rating: number; phase: 1 | 2; outcome?: string; }`.
- Verify `ProviderRecommendation` exposes `recommendation_id`; if not, add it (and ensure the backend route returns it).

**File:** `frontend/src/services/api.ts`

- Add `submitFeedback(payload: FeedbackRequest): Promise<void>` — POSTs to `/api/feedback`.
- Add optional `force_fresh?: boolean` param to `recommendPipeline` and `recommendProviders`.

---

### 9 — Frontend: StarRating component

**New file:** `frontend/src/components/ui/StarRating.tsx`

Props: `value: number` (0 = unrated), `onChange: (rating: number) => void`, `disabled?: boolean`

- Renders 5 clickable SVG stars; filled up to `value`.
- Keyboard accessible: arrow keys move focus, Enter/Space confirms.
- Each star `<button>` has `aria-label="Rate N stars"` and minimum 44×44 px tap target.
- No external library dependency.

---

### 10 — Frontend: Step1 changes (Phase 1)

**File:** `frontend/src/pages/Step1.tsx`

**Source field (lines 527–530):** Extend the source string mapping to include `"past_recommendations"` → `"Past Recommendations"`.

**Reuse banner:** When `recommendation.source === "past_recommendations"`, render a dismissible info banner above the `<dl>` grid: _"Using a recommendation from a similar document."_ with a "Regenerate" button. The button calls `recommendPipeline(docId, undefined, true)` (`force_fresh=true`) and clears the banner.

**Star rating:** Below the Agent's Decision tab content (after the rationale box), render `<StarRating>`. On change, call `submitFeedback({ recommendation_id, rating, phase: 1 })`. Show a default toast on success; destructive toast on failure with star state reverted.

New local state: `rating: number` (0 = unrated), `isSubmittingRating: boolean`.

---

### 11 — Frontend: Step2 changes (Phase 2)

**File:** `frontend/src/pages/Step2.tsx`

**Source field:** Add a Source row above the existing rationale block (lines 364–370), mapping `providerRec.source` to `"LLM"` / `"Rules"` / `"Past Recommendations"`.

**Reuse banner:** When `providerRec.source === "past_recommendations"`, render the same banner with a "Regenerate" button calling `recommendProviders(docId, true)`.

**Star rating:** Below the rationale block, render `<StarRating>`. On change, call `submitFeedback({ recommendation_id: providerRec.recommendation_id, rating, phase: 2 })`.

New local state: `phase2Rating: number`, `isSubmittingPhase2Rating: boolean`.

---

## Verification

1. Start backend (`uvicorn app.main:app --reload --port 8000`) and frontend (`npm run dev`).
2. Upload a PDF — confirm Agent's Decision tab shows Source badge (`LLM` or `Rules`) and a 5-star widget.
3. Rate ≥ 4 stars — confirm success toast and `recommendation_feedback` row has `rating` and `phase` columns populated.
4. Upload a second PDF with the same `doc_type`, `language`, and size bucket — confirm Source = `Past Recommendations` and the banner appears, with no LLM call in backend logs.
5. Click "Regenerate" — confirm LLM is called, Source updates, banner disappears.
6. Repeat steps 2–5 for Phase 2 (Provider Comparator tab).
7. Rate 1–3 stars, upload a similar doc — confirm no reuse occurs.
8. Run `npm run typecheck` — zero errors.

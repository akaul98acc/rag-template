# Plan: History Tab

**Spec:** `_specs/history-tab.md`  
**Branch:** `claude/feature/history-tab`

---

## Context

Documents and Phase 1 recommendations are already persisted to PostgreSQL (`documents` + `recommendations` tables). The plan extends the `recommendations` table with a `provider_recommendation JSONB` column so Phase 2 data is also persisted. `GET /api/history` then joins all three data sources and returns complete history. The frontend fetches from the DB — no client-side history accumulation needed.

User's manual Step 2 provider _selections_ (overrides of the agent recommendation) are still session-only in `UploadContext` since they are not captured by any existing API call.

Resolved spec questions:
- History tab positioned **after Step 2** in the nav
- **No entry limit** — never drop old entries
- Row selection **updates the browser URL** (React Router navigate)

---

## Backend Changes

### 1. Schema migration — `database.py`

**Add column** to the `recommendations` table inside `_ensure_schema()`:

```sql
ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS provider_recommendation JSONB;
```

This is idempotent — safe to run on every startup alongside the existing `CREATE TABLE IF NOT EXISTS`.

---

### 2. New DB write function — `database.py`

Add `db_save_provider_recommendation(doc_id: str, provider_rec_dict: dict) -> None`:

```sql
UPDATE recommendations
SET provider_recommendation = %s::jsonb
WHERE id = (
    SELECT id FROM recommendations
    WHERE doc_id = %s
    ORDER BY created_at DESC
    LIMIT 1
)
```

- Run via `asyncio.to_thread` (same pattern as existing DB calls).
- In-memory fallback: update the matching `_docs` entry if no DB connection.

---

### 3. Updated DB read function — `database.py`

Update `db_get_history()` to include the new column:

```sql
SELECT
    d.doc_id,
    d.filename,
    d.metadata,
    d.created_at,
    r.id                     AS recommendation_id,
    r.chunking_strategy,
    r.chunk_size,
    r.overlap,
    r.embedding_model,
    r.llm_model,
    r.top_k,
    r.rationale,
    r.confidence,
    r.source,
    r.provider_recommendation        -- new JSONB column
FROM documents d
LEFT JOIN LATERAL (
    SELECT * FROM recommendations
    WHERE doc_id = d.doc_id
    ORDER BY created_at DESC
    LIMIT 1
) r ON true
ORDER BY d.created_at DESC;
```

Falls back to in-memory dict when no DB connection.

---

### 4. Updated `recommend-providers` route — `api/routes/recommend_providers.py`

After the existing recommendation logic returns a `ProviderRecommendation`, persist it:

```python
await db_save_provider_recommendation(
    doc_id=body.doc_id,
    provider_rec_dict=rec.model_dump(),
)
```

No change to the response shape — still returns `ProviderRecommendation`.

---

### 5. New Pydantic response models — `models/document.py`

```python
class HistoryItem(BaseModel):
    doc_id: str
    filename: str
    uploaded_at: datetime
    metadata: DocumentMetadata
    recommendation: PipelineRecommendation | None
    provider_recommendation: ProviderRecommendation | None  # from JSONB column

class HistoryResponse(BaseModel):
    items: list[HistoryItem]
```

`PipelineRecommendation` and `ProviderRecommendation` already exist in `models/strategy.py` — reuse them.

---

### 6. New route — `api/routes/history.py`

```python
GET /api/history  →  HistoryResponse
```

- Calls `db_get_history()`.
- Parses the `provider_recommendation` JSONB column into `ProviderRecommendation` (if not null).
- Register in `main.py` under the `/api` prefix.

---

## Frontend Changes

### 7. New type — `types/api.ts`

```ts
export interface HistoryItem {
  doc_id: string;
  filename: string;
  uploaded_at: string;                          // ISO string
  metadata: DocumentMetadata;
  recommendation: PipelineRecommendation | null;
  provider_recommendation: ProviderRecommendation | null;
}
```

---

### 8. New API service call — `services/api.ts`

```ts
export async function fetchHistory(): Promise<HistoryItem[]>
// GET /api/history  →  returns response.data.items
```

---

### 9. UploadContext — `contexts/UploadContext.tsx`

Since `providerRec` now comes from the DB, the context only needs to track the user's manual **selections** (overrides) per session, plus the one-shot restore signal:

```ts
interface UploadContextValue {
  // existing
  uploadResult: UploadResult | null;
  setUploadResult: (r: UploadResult | null) => void;

  // session-only: user's manual provider selections keyed by doc_id
  selectionsCache: Record<string, Selections>;
  saveSelections: (docId: string, selections: Selections) => void;

  // one-shot restore signal
  restoredItem: HistoryItem | null;
  restoreItem: (item: HistoryItem) => void;
  clearRestoredItem: () => void;
}
```

- `restoreItem` sets `restoredItem` and calls `setUploadResult({ doc_id: item.doc_id, metadata: item.metadata })`.
- `clearRestoredItem` sets it back to `null`.

---

### 10. Step 1 changes — `pages/Step1.tsx`

Add a `useEffect` that fires when `restoredItem` is non-null:

```ts
useEffect(() => {
  if (!restoredItem) return;
  setUpload({ doc_id: restoredItem.doc_id, metadata: restoredItem.metadata });
  setRecommendation(restoredItem.recommendation);
  // derive config from recommendation (same logic as handleUploaded)
  clearRestoredItem();
}, [restoredItem]);
```

No change to the upload/recommend flow.

---

### 11. Step 2 changes — `pages/Step2.tsx`

**Save selections to context cache** whenever the user changes a selection:

```ts
saveSelections(uploadResult.doc_id, newSelections);
```

**Restore from `restoredItem`:**

```ts
useEffect(() => {
  if (!restoredItem) return;
  // providerRec comes from DB via restoredItem
  if (restoredItem.provider_recommendation) {
    setProviderRec(restoredItem.provider_recommendation);
  } else {
    setProviderRec(null);
  }
  // use cached manual selections if available, else reset
  const cached = selectionsCache[restoredItem.doc_id];
  setSelections(cached ?? {});
  clearRestoredItem();
}, [restoredItem]);
```

---

### 12. History page — `pages/History.tsx` — **delegate to frontend-agent**

- On mount, call `fetchHistory()` to load records from DB.
- Enrich each row with `selectionsCache[doc_id]` for the "Phase 2" column if session override exists.
- Use shadcn/ui `Table` (already in `components/ui/`).
- Empty state: _"No uploads yet. Upload a document in Step 1 to get started."_

**Table columns:**

| Column | Source |
|---|---|
| Filename | `item.filename` (truncate + tooltip) |
| Uploaded | `item.uploaded_at` formatted |
| Doc Type | `item.metadata.doc_type ?? "—"` |
| Chunking Strategy | `item.recommendation?.chunking_strategy ?? "—"` |
| Phase 2 Providers | Storage / Extraction / Embedding / Search from `item.provider_recommendation`, or "—" |
| Action | "Load" button |

**On "Load" click:**
```ts
restoreItem(item);
navigate("/step1");    // updates browser URL
```

---

### 13. App.tsx changes

- Add nav `<Link to="/history">History</Link>` **after** the Step 2 link.
- Add `<Route path="/history" element={<History />} />`.

---

## Files to Create

| File | Owner |
|---|---|
| `backend/app/api/routes/history.py` | backend-agent |
| `frontend/src/pages/History.tsx` | frontend-agent (Table component) |

## Files to Modify

| File | Change summary |
|---|---|
| `backend/app/services/database.py` | Schema migration (ADD COLUMN); `db_save_provider_recommendation()`; update `db_get_history()` |
| `backend/app/models/document.py` | Add `HistoryItem`, `HistoryResponse` |
| `backend/app/api/routes/recommend_providers.py` | Persist provider rec after returning response |
| `backend/app/main.py` | Register `/api/history` route |
| `frontend/src/types/api.ts` | Add `HistoryItem` (with `provider_recommendation`) |
| `frontend/src/services/api.ts` | Add `fetchHistory()` |
| `frontend/src/contexts/UploadContext.tsx` | Replace `phase2Cache` with `selectionsCache`; add `restoredItem` signal |
| `frontend/src/App.tsx` | Add `/history` route + nav link |
| `frontend/src/pages/Step1.tsx` | Consume `restoredItem` |
| `frontend/src/pages/Step2.tsx` | Write `selectionsCache`; consume `restoredItem` with DB-sourced `providerRec` |

---

## Verification

1. Start backend + frontend.
2. Upload a document → Phase 1 recommendation saved to DB as usual.
3. Go to Step 2 → provider recommendation returned → verify `recommendations` row now has `provider_recommendation` JSONB populated (check via DB client or `/api/history` response).
4. Open History tab → row shows filename, date, doc type, chunking strategy, and Phase 2 providers.
5. Click "Load" → browser URL changes to `/step1`; Step 1 populated from DB data.
6. Navigate to Step 2 → populated with `provider_recommendation` from DB.
7. Upload a second document, skip Phase 2 → History row shows "—" for Phase 2 providers → clicking "Load" leaves Step 2 blank.
8. Restart the backend → History tab still shows all prior entries (data persisted in DB, not session memory).
9. Run `npm run typecheck` — zero errors.
10. If DB is not configured, verify in-memory fallback still populates History correctly.

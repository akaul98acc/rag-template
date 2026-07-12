# Plan: Org-Scoped Upload History with Role-Based Visibility

## Context

Spec: `_specs/org-scoped-upload-history.md`

Resolved decisions:
- **Admin only** gets org-wide visibility. All other roles see only their own uploads.
- **Legacy data will be truncated** before deployment — no migration path for old rows is needed.

The `documents` table currently has no ownership columns. Every upload is anonymous and global. The JWT issued by the auth system carries `user_id`, `org_id`, `org_code`, and `role` — these are the source of truth for ownership.

---

## Phase 1 — Database Schema (`backend/app/services/database.py`)

**a) Add columns to `documents` via `_ensure_schema()`**

After the existing `cur.execute(_CREATE_TABLE_SQL)` call (which creates the `documents` table), add two idempotent `ALTER TABLE` statements:

```
ALTER TABLE documents ADD COLUMN IF NOT EXISTS org_id     UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by UUID;
```

Both are nullable so the `CREATE TABLE IF NOT EXISTS` no-op on an existing table does not block startup. Since legacy data will be truncated, no back-fill is needed.

**b) Add index on `org_id`** in the same block (after the ALTER statements):

```
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id);
```

**c) Update `db_register_document` signature** (currently line 438)

Add `org_id: str | None` and `uploaded_by: str | None` as parameters. Pass them into the `INSERT INTO documents` statement. Update the in-memory `_DOCS_FALLBACK` dict entry to include both keys.

**d) Update `db_get_history` signature** (currently line 537)

Add three parameters: `org_id: str`, `user_id: str`, `role: str`.

DB path — modify the SQL `WHERE` clause:
- Always filter: `d.org_id = %s`
- If `role != "Admin"`: additionally filter `d.uploaded_by = %s`
- For Admins, add a `LEFT JOIN users u ON d.uploaded_by = u.id` and select `u.email AS uploaded_by_email`; for non-Admins omit the join (or include it with a fixed `NULL AS uploaded_by_email` to keep column count stable).

In-memory fallback — filter `_DOCS_FALLBACK` by `org_id`, then by `uploaded_by` if not Admin.

---

## Phase 2 — Upload Route (`backend/app/api/routes/upload.py`)

The route currently calls `await register_document(doc_id, dest, metadata)` with no ownership context.

**a) Inject `get_current_user`** via `Depends` in the handler signature. The router is already protected by the `_jwt` dependency list in `main.py`, so this adds read access to claims inside the handler body only — no security change.

**b) Extract `org_id` and `user_id`** from the injected claims dict and pass them to `register_document(doc_id, dest, metadata, org_id=..., uploaded_by=...)`.

**c) Update `register_document`** in `document_analyzer.py` (the wrapper that calls `db_register_document`) to accept and forward `org_id` and `uploaded_by` keyword arguments.

---

## Phase 3 — History Route (`backend/app/api/routes/history.py`)

**a) Inject `get_current_user`** via `Depends` in the handler signature (same pattern as upload).

**b) Extract `org_id`, `user_id`, `role`** from claims.

**c) Pass all three** to `await db_get_history(org_id=..., user_id=..., role=...)`.

**d) Expose `uploaded_by_email`** in the response: when the caller is Admin, include the `uploaded_by_email` value from each history row in `HistoryItem`. Non-Admin rows always have `uploaded_by_email=None`.

---

## Phase 4 — Pydantic Models (`backend/app/models/`)

Locate the `HistoryItem` response model (lives in `backend/app/models/history.py` or inline in the route). Add:

```
uploaded_by_email: str | None = None
```

This is optional so existing callers and the in-memory fallback path are unaffected.

---

## Phase 5 — Frontend Types (`frontend/src/types/api.ts`)

Add `uploaded_by_email?: string` to the existing `HistoryItem` interface.

---

## Phase 6 — History Page (`frontend/src/pages/History.tsx`)

**a) Read `claims`** from `useAuth()` (already available in the app; the hook is exported from `AuthContext.tsx`).

**b) Derive `isAdmin`**: `const isAdmin = claims?.role === "Admin"`.

**c) Conditionally render "Uploaded by" column**:
- Add a `<th>Uploaded by</th>` header cell wrapped in `{isAdmin && (...)}`.
- Add a matching `<td>{item.uploaded_by_email ?? "—"}</td>` body cell wrapped in `{isAdmin && (...)}`.

No other UI changes — the filter is entirely server-side.

---

## File Summary

| File | Change |
|---|---|
| `backend/app/services/database.py` | Add `org_id`/`uploaded_by` columns + index in `_ensure_schema()`; update `db_register_document` and `db_get_history` signatures and SQL |
| `backend/app/api/routes/upload.py` | Inject `get_current_user`; pass `org_id`/`uploaded_by` to `register_document` |
| `backend/app/services/document_analyzer.py` | Forward `org_id`/`uploaded_by` kwargs to `db_register_document` |
| `backend/app/api/routes/history.py` | Inject `get_current_user`; pass `org_id`/`user_id`/`role` to `db_get_history` |
| `backend/app/models/` (HistoryItem) | Add `uploaded_by_email: str \| None = None` |
| `frontend/src/types/api.ts` | Add `uploaded_by_email?: string` to `HistoryItem` |
| `frontend/src/pages/History.tsx` | Read `claims.role`; show "Uploaded by" column for Admin only |

---

## Verification Steps

1. **Schema**: After startup, confirm `documents` table has `org_id` and `uploaded_by` columns and `idx_documents_org_id` index.
2. **Upload ownership**: POST a file while authenticated → confirm DB row has correct `org_id` and `uploaded_by`.
3. **Admin History**: Log in as Admin → GET /api/history → all org documents returned, each with `uploaded_by_email`.
4. **Non-Admin History**: Log in as non-Admin → GET /api/history → only own uploads returned, `uploaded_by_email` is null.
5. **Cross-org isolation**: User from org A → cannot see any documents from org B.
6. **Frontend Admin view**: History tab shows "Uploaded by" column with uploader emails for Admin.
7. **Frontend non-Admin view**: History tab has no "Uploaded by" column.

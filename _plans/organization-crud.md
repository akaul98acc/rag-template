# Plan: Organization CRUD

> **Spec:** `_specs/organization-crud.md`
> **Branch:** `claude/feature/organization-crud`
> **Status:** Ready to implement
> **Open blocker:** Open Question #1 — `created_by`/`updated_by` value source is unresolved.
> Placeholder `"system"` is used below; replace when decided.

---

## Implementation Order

Back-end first (DB → models → service → routes → main.py), then front-end
(types → api.ts → page → App.tsx). Each step is independently shippable.

---

## Step 1 — Database schema (`backend/app/services/database.py`)

Add a `CREATE TABLE IF NOT EXISTS organizations` DDL constant and call it
inside `_ensure_schema`.

**SQL to add:**

```sql
CREATE TABLE IF NOT EXISTS organizations (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT        NOT NULL,
    org_code       TEXT        NOT NULL UNIQUE,
    website        TEXT,
    phone_number   TEXT,
    contact_person TEXT        NOT NULL,
    plan_selected  TEXT        NOT NULL,
    created_from   TEXT,
    created_by     TEXT        NOT NULL DEFAULT 'system',
    created_on     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     TEXT        NOT NULL DEFAULT 'system',
    updated_on     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_org_code ON organizations(org_code);
```

Add an in-memory fallback dict `_ORGS_FALLBACK: dict[str, dict] = {}` next
to the existing `_DOCS_FALLBACK`.

**New async functions to add in `database.py`:**

| Function | Signature | Notes |
|---|---|---|
| `db_list_organizations` | `(page, page_size, search, plan) -> dict` | Returns `{items, total, page, page_size}`; ILIKE on name/org_code for search, exact match on plan_selected |
| `db_get_organization` | `(org_id: str) -> dict \| None` | SELECT by id |
| `db_create_organization` | `(data: dict) -> dict` | INSERT … RETURNING *; raises `IntegrityError` on duplicate `org_code` |
| `db_update_organization` | `(org_id: str, data: dict) -> dict \| None` | UPDATE … RETURNING *; sets `updated_on = NOW()` |
| `db_delete_organization` | `(org_id: str) -> bool` | DELETE; returns True if a row was deleted |

`db_list_organizations` query pattern:
```sql
SELECT * FROM organizations
WHERE (name ILIKE %search% OR org_code ILIKE %search%)   -- only when search given
  AND plan_selected = %plan%                               -- only when plan given
ORDER BY created_on DESC
LIMIT %page_size% OFFSET %offset%;
-- run a matching COUNT(*) query for total
```
In-memory fallback performs equivalent Python-side filtering on `_ORGS_FALLBACK`.

All functions follow the existing pattern: synchronous inner `_do`, wrapped
in `asyncio.to_thread(lambda: _run(_do))`.

---

## Step 2 — Pydantic models (`backend/app/models/`)

Create `backend/app/models/organization.py`:

```
OrganizationCreate   — fields sent on POST (name, org_code, website?,
                       phone_number?, contact_person, created_from?)
OrganizationUpdate   — fields sent on PUT (name, website?, phone_number?,
                       contact_person) — org_code excluded (locked)
OrganizationResponse — all fields including id + audit fields; used as
                       response model for all endpoints
```

Export them from `backend/app/models/__init__.py`.

---

## Step 3 — Route handler (`backend/app/api/routes/organizations.py`)

Thin router, no business logic. All DB calls go to `database.py` functions
added in Step 1.

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/organizations` | `list_organizations` | Query params: `page=1`, `page_size=20`, `search?`, `plan?`; returns `OrganizationListResponse` |
| POST | `/organizations` | `create_organization` | 409 on duplicate `org_code` |
| GET | `/organizations/{org_id}` | `get_organization` | 404 if not found |
| PUT | `/organizations/{org_id}` | `update_organization` | 404 if not found |
| DELETE | `/organizations/{org_id}` | `delete_organization` | 404 if not found; returns 204 |

Add `OrganizationListResponse` to the models:
```
OrganizationListResponse — { items: list[OrganizationResponse], total: int, page: int, page_size: int }
```

`created_by` and `updated_by` are hardcoded to `"system"` for now (pending
resolution of Open Question #1).

---

## Step 4 — Register router (`backend/app/main.py`)

Add two lines:

```python
from app.api.routes import organizations          # import
app.include_router(organizations.router, prefix="/api", tags=["organizations"])
```

---

## Step 5 — Frontend types (`frontend/src/types/api.ts`)

Add:

```typescript
export interface OrganizationListResponse {
  items: Organization[];
  total: number;
  page: number;
  page_size: number;
}

export interface Organization {
  id: string;
  name: string;
  org_code: string;
  website?: string | null;
  phone_number?: string | null;
  contact_person: string;
  plan_selected: string;
  created_from?: string | null;
  created_by: string;
  created_on: string;   // ISO timestamp
  updated_by: string;
  updated_on: string;
}

export interface OrganizationCreate {
  name: string;
  org_code: string;
  website?: string;
  phone_number?: string;
  contact_person: string;
  plan_selected: string;
  created_from?: string;
}

export interface OrganizationUpdate {
  name: string;
  website?: string;
  phone_number?: string;
  contact_person: string;
  plan_selected: string;
}
```

---

## Step 6 — API service (`frontend/src/services/api.ts`)

Add five functions using the existing `client` (axios, `baseURL: "/api"`):

```typescript
listOrganizations(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  plan?: string;
}): Promise<OrganizationListResponse>
createOrganization(data: OrganizationCreate): Promise<Organization>
getOrganization(id: string): Promise<Organization>
updateOrganization(id: string, data: OrganizationUpdate): Promise<Organization>
deleteOrganization(id: string): Promise<void>
```

---

## Step 7 — Organizations page (`frontend/src/pages/Organizations.tsx`)

Single page component. No sub-routes needed.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Organizations                    [Add Organization]  │
├─────────────────────────────────────────────────────┤
│ [Search by name or code…]  [Plan: All ▾]            │
├─────────────────────────────────────────────────────┤
│ Name | Org Code | Plan Selected | Contact | Created │
│ (skeleton rows while loading)                        │
│ (empty state + CTA when empty)                       │
│ Row click → detail/edit panel                        │
├─────────────────────────────────────────────────────┤
│ Showing 1-20 of 54    [< Prev]  Page 1 / 3  [Next >]│
└─────────────────────────────────────────────────────┘
```

### State

| State var | Type | Purpose |
|---|---|---|
| `orgs` | `Organization[]` | Current page data |
| `total` | `number` | Total record count for pagination |
| `page` | `number` | Current page (1-based) |
| `search` | `string` | Controlled search input value |
| `planFilter` | `string` | Selected plan filter (`""` = all) |
| `loading` | `boolean` | Skeleton display |
| `selected` | `Organization \| null` | Detail / edit panel |
| `mode` | `"view" \| "edit" \| "create"` | Panel mode |
| `saving` | `boolean` | Disables Save button |
| `deleteTarget` | `Organization \| null` | Confirmation dialog |

Search is debounced (~300 ms) before triggering the API call. Changing
`search` or `planFilter` resets `page` to 1. `page_size` is fixed at 20.

### Components (inline, no separate files needed at this scale)

- **OrgTable** — shadcn `<Table>` with columns: Name, Org Code, Plan Selected,
  Contact Person, Created On. Clicking a row sets `selected` + `mode="view"`.
- **SearchBar** — controlled `<Input>` with 300 ms debounce; resets page to 1 on change.
- **PlanFilter** — `<select>` (or shadcn toggle group) of distinct plan values + "All"; resets page to 1 on change.
- **Pagination** — Prev / Next buttons + "Page X of Y / Showing A–B of N" text; disabled at boundaries.
- **OrgPanel** — sheet/modal. Shows all fields read-only in `view` mode;
  shows editable form (shadcn `<Input>`) in `edit` mode. `org_code` is
  always read-only. Has Edit / Delete buttons in view mode, Save / Cancel
  in edit mode.
- **OrgForm** — used for both create and edit. Validates required fields
  client-side before calling the API.
- **DeleteDialog** — shadcn `<Dialog>` confirmation before deletion.

### shadcn/ui primitives to use

`Input`, `Button`, `Badge` (for org_code chip), `Dialog` (delete confirm),
existing `toast` hook. No new UI dependencies needed.

---

## Step 8 — Register route (`frontend/src/App.tsx`)

1. Import `Organizations` page.
2. Add nav `<Link to="/organizations">Organizations</Link>` in the header
   **immediately after the existing History link** (current order: Step 1 · Strategy → Step 2 · Compare & Generate → History → **Organizations**).
3. Add `<Route path="/organizations" element={<Organizations />} />` inside
   `<Routes>`, after the `/history` route.

---

## File Checklist

### New files
- [ ] `backend/app/models/organization.py`
- [ ] `backend/app/api/routes/organizations.py`
- [ ] `frontend/src/pages/Organizations.tsx`

### Modified files
- [ ] `backend/app/services/database.py` — DDL + `_ORGS_FALLBACK` + 5 async functions
- [ ] `backend/app/models/__init__.py` — re-export new models
- [ ] `backend/app/main.py` — import + `include_router`
- [ ] `frontend/src/types/api.ts` — 3 new interfaces
- [ ] `frontend/src/services/api.ts` — 5 new API functions
- [ ] `frontend/src/App.tsx` — nav link + route

---

## Key Constraints (from spec)

- `org_code` is locked after creation — excluded from `OrganizationUpdate`
  and rendered read-only in the edit form.
- `organizations.id` must remain a stable UUID PK — future `users` table
  will FK to it. Never rename or drop.
- No auth system yet — `created_by`/`updated_by` default to `"system"`.
- In-memory fallback must work when `DATABASE_URL` is unset.

---

## Deferred / Out of Scope

- Linking organizations to documents, recommendations, or uploads
- Users → Organization FK (next feature)
- Role-based access scoped to org

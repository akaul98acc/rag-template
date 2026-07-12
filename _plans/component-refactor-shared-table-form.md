# Plan: Component Refactor — Shared Table, Form, and Backend Base Model

## Context

Spec: `_specs/component-refactor-shared-table-form.md`

Pure mechanical extraction — no logic changes, no new features, no API contract changes. This plan targets three pages (Organizations, Users, Roles) and their backend counterparts. The goal is to eliminate every identified duplication before any new entity pages are added.

**Dependency:** PR #20 (Roles CRUD) must be merged first so `Roles.tsx` exists.

---

## Current Duplication Inventory

| Location | What is duplicated |
|---|---|
| `Organizations.tsx`, `Users.tsx`, `Roles.tsx` | `FieldGroup` component (identical, 12 lines each) |
| Same three files | `type Mode = "view" \| "edit" \| "create"` |
| Same three files | `SkeletonRows` component (identical markup) |
| Same three files | Table + pagination bar markup |
| Same three files | Slide-in panel shell (backdrop div + drawer div + close button) |
| Same three files | Button-bar logic inside each panel (view/edit/create branches) |
| Same three files | Debounced-search + `refreshKey` + page-reset `useState` and `useEffect` chain |
| `database.py` | `_serialize_user_row`, `_serialize_role_row` (identical logic, different UUID columns); orgs serialise inline |
| `database.py` | `db_list_organizations`, `db_list_users`, `db_list_roles` share identical WHERE-builder, COUNT, paginate, LIMIT/OFFSET skeleton |
| Route handlers | `fetch entity → raise 404 if None` repeated at top of every GET/PUT/DELETE handler |
| `models/` | Six audit column declarations repeated in `OrganizationResponse`, `UserResponse`, `RoleResponse` |

---

## Implementation Order

> Complete each step fully before moving to the next. Steps within a phase that have no interdependency are noted as parallelisable.

---

### Phase 1 — Backend: Shared Models

**File to create:** `backend/app/models/base.py`

```
AuditBase(BaseModel)
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str

SoftDeleteMixin(BaseModel)
    deleted_by: str | None
    deleted_on: str | None
```

**Files to modify** (parallel — no interdependency):

| File | Change |
|---|---|
| `backend/app/models/organization.py` | `OrganizationResponse` inherits `AuditBase` — remove the four duplicated audit fields from the class body |
| `backend/app/models/users.py` | `UserResponse` inherits `AuditBase, SoftDeleteMixin` — remove all six audit fields from the class body |
| `backend/app/models/roles.py` | `RoleResponse` inherits `AuditBase, SoftDeleteMixin` — remove all six audit fields from the class body |

Import in each: `from app.models.base import AuditBase, SoftDeleteMixin`

The `ListResponse` classes (`OrganizationListResponse`, `UserListResponse`, `RoleListResponse`) are not merged — they stay per-entity because their `items` types differ and Pydantic v2 generic models add unnecessary complexity here.

---

### Phase 2 — Backend: Shared `serialize_row` Helper

**File to modify:** `backend/app/services/database.py`

Add a module-level function before the first entity section:

```
def serialize_row(
    row_dict: dict,
    uuid_cols: list[str] = (),
    ts_cols: list[str] = (),
    nullable_ts_cols: list[str] = (),
) -> dict:
```

- `uuid_cols` — columns whose values are always present and must be `str()`-ed. Example: `["id"]`
- `nullable_uuid_cols` — columns that may be `None` and should be conditionally `str()`-ed. Example: `["org_id", "role_id"]`
- `ts_cols` — always-present timestamp columns to `str()`. Example: `["created_on", "updated_on"]`
- `nullable_ts_cols` — nullable timestamp columns. Example: `["deleted_on"]`

Note: add a fourth param `nullable_uuid_cols: list[str] = ()` to cover `org_id` and `role_id` on users.

**Then replace the three current serialisers:**

| Old | Replacement |
|---|---|
| `_serialize_user_row(row)` | `serialize_row(row, uuid_cols=["id"], nullable_uuid_cols=["org_id", "role_id"], ts_cols=["created_on", "updated_on"], nullable_ts_cols=["deleted_on"])` |
| `_serialize_role_row(row)` | `serialize_row(row, uuid_cols=["id"], ts_cols=["created_on", "updated_on"], nullable_ts_cols=["deleted_on"])` |
| Inline org serialisation (inside `db_list_organizations`, `db_get_organization`, `db_create_organization`, `db_update_organization`) | `serialize_row(row, uuid_cols=["org_id"], ts_cols=["created_on", "updated_on"])` |

Delete `_serialize_user_row` and `_serialize_role_row` after all call sites are updated.

---

### Phase 3 — Backend: `db_list_entity` Generic Helper

**File to modify:** `backend/app/services/database.py`

Add one function before the three `db_list_*` functions. Signature:

```
def _db_list_entity(
    *,
    select_sql: str,          # full "SELECT … FROM …" with no WHERE/ORDER/LIMIT
    count_sql: str,           # full "SELECT COUNT(*) FROM …" with no WHERE
    base_filters: list[tuple[str, list]],   # always-on, e.g. [("deleted_on IS NULL", [])]
    search_filter: tuple[str, list] | None, # optional, built from search param
    extra_filters: list[tuple[str, list]],  # entity-specific, e.g. [("plan_selected = %s", ["pro"])]
    serialize: Callable[[dict], dict],
    page: int,
    page_size: int,
    order_by: str,
) -> dict:
```

Internal logic (runs inside `_run()` in a thread):
1. Collect all non-None filter tuples → build `WHERE` clause and `params` list
2. `SELECT COUNT(*)` with WHERE → `total`
3. `SELECT select_sql WHERE … ORDER BY order_by LIMIT %s OFFSET %s`
4. Map rows through `serialize`
5. Return `{items, total, page, page_size}`

**Then refactor the three list functions** to delegate to `_db_list_entity`:

**`db_list_organizations`**: passes
- `select_sql` = current inline SELECT string
- `count_sql` = `"SELECT COUNT(*) FROM organizations"`
- `base_filters` = `[]` (no soft-delete filter)
- `search_filter` = `("(name ILIKE %s OR org_code ILIKE %s)", [like, like])` when `search` is set
- `extra_filters` = `[("plan_selected = %s", [plan])]` when `plan` is set
- `serialize` = `lambda row: serialize_row(row, uuid_cols=["org_id"], ts_cols=["created_on", "updated_on"])`
- `order_by` = `"created_on DESC"`

**`db_list_roles`**: passes
- `select_sql` = `_ROLE_SELECT`
- `count_sql` = `"SELECT COUNT(*) FROM roles"`
- `base_filters` = `[("deleted_on IS NULL", [])]`
- `search_filter` = `("name ILIKE %s", [f"%{search}%"])` when `search` is set
- `extra_filters` = `[]`
- `serialize` = `lambda row: serialize_row(row, uuid_cols=["id"], ts_cols=["created_on", "updated_on"], nullable_ts_cols=["deleted_on"])`
- `order_by` = `"name"`

**`db_list_users`**: The Users query uses a three-table JOIN (`_USER_SELECT`) with table-aliased columns (`u.deleted_on`, etc.). The COUNT also needs the JOIN (`FROM users u`). Pass both full SQL strings; `_db_list_entity` is flexible enough to handle this because it only needs `select_sql` and `count_sql`:
- `select_sql` = `_USER_SELECT` (the join query)
- `count_sql` = `"SELECT COUNT(*) FROM users u"`
- `base_filters` = `[("u.deleted_on IS NULL", [])]`
- `search_filter` = `("(u.name ILIKE %s OR u.email ILIKE %s)", [like, like])` when `search` is set
- `extra_filters` = `[]`
- `serialize` = `lambda row: serialize_row(row, uuid_cols=["id"], nullable_uuid_cols=["org_id", "role_id"], ts_cols=["created_on", "updated_on"], nullable_ts_cols=["deleted_on"])`
- `order_by` = `"u.created_on DESC"`

Keep the in-memory fallback path inside each `db_list_*` function unchanged — `_db_list_entity` only covers the DB path.

---

### Phase 4 — Backend: `get_or_404` Utility

**File to create:** `backend/app/api/deps.py`

```python
from fastapi import HTTPException
from typing import Any

async def get_or_404(coro: Any, detail: str = "Not found") -> dict:
    row = await coro
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return row
```

**Files to modify** (parallel):

| File | Pattern to replace |
|---|---|
| `backend/app/api/routes/organizations.py` | Every `row = await db_get_organization(id); if row is None: raise HTTPException(404, ...)` block |
| `backend/app/api/routes/users.py` | Same pattern for `db_get_user` |
| `backend/app/api/routes/roles.py` | Same pattern for `db_get_role` |

Call site becomes:
```python
row = await get_or_404(db_get_role(role_id), detail="Role not found")
```

Import in each route file: `from app.api.deps import get_or_404`

---

### Phase 5 — Frontend: Shared Component Files

Create directory: `frontend/src/components/shared/`

Create four files (all are independent of each other — parallelisable):

---

#### `frontend/src/components/shared/FieldGroup.tsx`

Props:
```
label: string
error?: string
children: React.ReactNode
```

Body: exact copy of the existing implementation from any of the three pages.

Export as named export: `export function FieldGroup(...)`.

---

#### `frontend/src/components/shared/ConfirmModal.tsx`

Props:
```
title: string
description: React.ReactNode
confirmLabel?: string          (default: "Delete")
confirmVariant?: "destructive" | "default"   (default: "destructive")
error?: string | null
onConfirm: () => void
onCancel: () => void
```

Body: the `alertdialog` markup currently in `Organizations.tsx` `DeleteConfirm`, parameterised. The `error` prop maps to a `<p className="text-sm text-danger mb-3">` block shown when non-null (currently only Roles uses this).

Export as named export: `export function ConfirmModal(...)`.

---

#### `frontend/src/components/shared/PanelActionBar.tsx`

Button definition interface (also exported for use at call sites):
```typescript
export interface ActionButton {
  label: string
  onClick: () => void
  variant?: "default" | "secondary" | "destructive"
  disabled?: boolean
  flex1?: boolean
}
```

Props:
```
buttons: ActionButton[]
```

Body: renders `<div className="mt-auto pt-4 flex gap-2 border-t border-border">` with one `<Button>` per entry.

Export: `export function PanelActionBar(...)` and `export type { ActionButton }`.

---

#### `frontend/src/components/shared/SlidePanel.tsx`

Props:
```
title: string
onClose: () => void
children: React.ReactNode
footer?: React.ReactNode    (the PanelActionBar slot)
deleteModal?: React.ReactNode  (the ConfirmModal slot)
```

Body:
- Backdrop `<div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />` 
- Drawer `<div role="dialog" aria-label={title} className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border shadow-xl z-50 flex flex-col overflow-y-auto">`
  - Header row with `{title}` + close button SVG
  - `<div className="flex flex-col gap-4 px-6 py-5 flex-1">{children}</div>`
  - If `footer`: renders `{footer}` inside the content div (the `PanelActionBar` lands here)
  - `{deleteModal}` rendered after the drawer close (stacks above at z-[60] via `ConfirmModal`)

Export as named export: `export function SlidePanel(...)`.

---

#### `frontend/src/components/shared/DataTable.tsx`

Column definition interface (also exported):
```typescript
export interface ColumnDef<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  className?: string
}
```

Props:
```typescript
interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  rows: T[]
  loading: boolean
  emptyMessage?: React.ReactNode
  skeletonRows?: number          // default 5
  onRowClick?: (row: T) => void
  getRowKey: (row: T) => string  // extracts the React key from a row
  // Controlled pagination
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}
```

Body sections:
1. `<div className="overflow-x-auto bg-surface border border-border rounded-lg">` wrapping the `<Table>` component
2. `<TableHeader>` built from `columns.map(col => <TableHead className={col.className}>{col.label}</TableHead>)`
3. `<TableBody>`:
   - If `loading`: renders `skeletonRows` rows × `columns.length` cells (each cell has the animated pulse `<div>`)
   - If `!loading && rows.length === 0`: single colspan row with `emptyMessage`
   - Otherwise: `rows.map(row => <TableRow key={getRowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? "cursor-pointer" : ""}>{columns.map(col => <TableCell className={col.className}>{col.render ? col.render(row) : String(row[col.key as keyof T] ?? "")}</TableCell>)}</TableRow>)`
4. Pagination bar below the table:
   - Left: "Showing X–Y of Z" / "No results"
   - Right: Prev / "Page X / Y" / Next buttons (same markup as current pages)

Export: `export function DataTable<T>(...)` — TypeScript generic function component.

> **Note on generic TSX:** Use `function DataTable<T,>(props: DataTableProps<T>)` (trailing comma in type param) to avoid JSX parser ambiguity in `.tsx` files.

---

### Phase 6 — Frontend: `useEntityList` Hook

**File to create:** `frontend/src/hooks/useEntityList.ts`

```typescript
interface UseEntityListOptions<T> {
  fetcher: (params: {
    page: number
    page_size: number
    search?: string
  }) => Promise<{ items: T[]; total: number; page: number; page_size: number }>
  pageSize?: number
  extraDeps?: React.DependencyList  // e.g. [planFilter] for Organizations
}

interface UseEntityListResult<T> {
  items: T[]
  total: number
  page: number
  setPage: (p: number) => void
  search: string
  setSearch: (s: string) => void
  loading: boolean
  refresh: () => void
}
```

Internal implementation:
- `useState` for `items`, `total`, `page` (init: 1), `search`, `debouncedSearch`, `loading`, `refreshKey`
- `useEffect([search])` → 300 ms debounce that sets `debouncedSearch` and resets `page` to 1
- `useEffect([extraDeps])` (separate effect) → resets `page` to 1 when any extra dep changes
- `useEffect([page, debouncedSearch, refreshKey, ...extraDeps])` → cancellable fetch using the `fetcher` prop; sets `items`, `total`, `loading`
- `refresh()` → increments `refreshKey`

**Important:** The `fetcher` function passed by the page must be stable (declared as `useCallback` or defined outside the component) when `extraDeps` is used, to prevent infinite render loops. Document this constraint as a comment in the hook file.

---

### Phase 7 — Frontend: Refactor Page Files

Apply to **Organizations.tsx**, **Users.tsx**, and **Roles.tsx** in sequence (do Organizations first as the reference, then verify, then repeat for Users and Roles).

#### Imports to add (all three pages)
```typescript
import { DataTable, type ColumnDef } from "@/components/shared/DataTable"
import { SlidePanel } from "@/components/shared/SlidePanel"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { FieldGroup } from "@/components/shared/FieldGroup"
import { PanelActionBar, type ActionButton } from "@/components/shared/PanelActionBar"
import { useEntityList } from "@/hooks/useEntityList"
```

#### Remove from each page file
- Local `FieldGroup` interface + function (3 × ~12 lines)
- Local `type Mode = ...` (keep in panel component — it is still page-local)
- Local `SkeletonRows` component (3 × ~15 lines)
- The `<div className="overflow-x-auto ..."><Table>...</Table></div>` and pagination bar JSX block

#### Replace page-level state with hook
**Before (Organizations — 13 `useState` calls):**
```tsx
const [orgs, setOrgs] = useState<Organization[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [search, setSearch] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");
const [loading, setLoading] = useState(true);
const [refreshKey, setRefreshKey] = useState(0);
// + the debounce useEffect + the fetch useEffect
```

**After:**
```tsx
const [planFilter, setPlanFilter] = useState("");  // Organizations-only extra filter

const { items: orgs, total, page, setPage, search, setSearch, loading, refresh } =
  useEntityList({
    fetcher: useCallback(
      (params) => listOrganizations({ ...params, ...(planFilter ? { plan: planFilter } : {}) }),
      [planFilter]
    ),
    pageSize: PAGE_SIZE,
    extraDeps: [planFilter],
  });
```

Users and Roles have no `extraDeps`.

#### Column definitions (defined inside the component, above the JSX return)

**Organizations:**
```tsx
const columns: ColumnDef<Organization>[] = [
  { key: "name", label: "Name", render: (o) => <span className="font-medium">{o.name}</span> },
  { key: "org_code", label: "Org Code", render: (o) => <span className="font-mono text-fg-muted">{o.org_code}</span> },
  { key: "plan_selected", label: "Plan", render: (o) => <Badge variant="muted">{o.plan_selected}</Badge> },
  { key: "contact_person", label: "Contact Person", className: "text-fg-muted" },
  { key: "created_on", label: "Created", render: (o) => <span className="text-fg-muted whitespace-nowrap">{formatDate(o.created_on)}</span> },
];
```

**Users:**
```tsx
const columns: ColumnDef<User>[] = [
  { key: "name", label: "Name", render: (u) => <span className="font-medium">{u.name}</span> },
  { key: "email", label: "Email", className: "text-fg-muted" },
  { key: "org_name", label: "Organization", render: (u) => <span className="text-fg-muted">{u.org_name ?? "—"}</span> },
  { key: "role_name", label: "Role", render: (u) => <span className="text-fg-muted">{u.role_name ?? "—"}</span> },
  { key: "created_on", label: "Created", render: (u) => <span className="text-fg-muted whitespace-nowrap">{formatDate(u.created_on)}</span> },
];
```

**Roles:**
```tsx
const columns: ColumnDef<Role>[] = [
  { key: "name", label: "Role Name", render: (r) => (
    <span className="flex items-center gap-2 font-medium">
      {r.name}
      {SEEDED_NAMES.has(r.name) && <LockIcon />}
    </span>
  )},
  { key: "created_by", label: "Created By", className: "text-fg-muted" },
  { key: "created_on", label: "Created On", render: (r) => <span className="text-fg-muted whitespace-nowrap">{formatDate(r.created_on)}</span> },
  { key: "updated_on", label: "Updated On", render: (r) => <span className="text-fg-muted whitespace-nowrap">{formatDate(r.updated_on)}</span> },
];
```

#### Replace table JSX with `DataTable`

```tsx
<DataTable
  columns={columns}
  rows={orgs}           // or users / roles
  loading={loading}
  getRowKey={(o) => o.org_id}   // or o.id for users/roles
  onRowClick={openView}
  emptyMessage={<>No organizations found.</>}
  page={page}
  totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
  total={total}
  pageSize={PAGE_SIZE}
  onPageChange={setPage}
/>
```

#### Replace panel JSX with `SlidePanel` + `ConfirmModal`

```tsx
{panelOpen && (
  <SlidePanel
    title={panelTitle}
    onClose={closePanel}
    footer={
      <PanelActionBar buttons={buildButtons(mode, saving, { onEdit, onCancelEdit, onDelete, handleSubmit, onClose: closePanel })} />
    }
    deleteModal={
      deleteTarget ? (
        <ConfirmModal
          title="Delete organization?"
          description={<>...</>}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : undefined
    }
  >
    {/* entity-specific field groups */}
    <FieldGroup label="Name" error={errors.name}>...</FieldGroup>
    ...
  </SlidePanel>
)}
```

#### Button array construction

Each page builds its own `ActionButton[]` based on `mode` and any entity-specific guards (e.g. `isSeeded` in Roles). This is computed inline where the `<PanelActionBar>` is used — no helper function needed.

**Organisations / Users (no special guards):**
```tsx
buttons={
  mode === "view" ? [
    { label: "Edit", onClick: onEdit, flex1: true },
    { label: "Delete", onClick: onDelete, variant: "destructive" },
  ] : mode === "edit" ? [
    { label: saving ? "Updating…" : "Update", onClick: handleSubmit, disabled: saving, flex1: true },
    { label: "Cancel", onClick: onCancelEdit, variant: "secondary" },
  ] : [
    { label: saving ? "Saving…" : "Save", onClick: handleSubmit, disabled: saving, flex1: true },
    { label: "Cancel", onClick: onClose, variant: "secondary" },
  ]
}
```

**Roles (seeded guard in view mode):**
```tsx
buttons={
  mode === "view" ? (isSeeded ? [
    { label: "Close", onClick: onClose, variant: "secondary", flex1: true },
  ] : [
    { label: "Edit", onClick: onEdit, flex1: true },
    { label: "Delete", onClick: onDelete, variant: "destructive" },
  ]) : mode === "edit" ? [...] : [...]
}
```

---

### Phase 8 — Export Barrel (optional but recommended)

**File to create:** `frontend/src/components/shared/index.ts`

```typescript
export { DataTable } from "./DataTable"
export type { ColumnDef } from "./DataTable"
export { SlidePanel } from "./SlidePanel"
export { ConfirmModal } from "./ConfirmModal"
export { FieldGroup } from "./FieldGroup"
export { PanelActionBar } from "./PanelActionBar"
export type { ActionButton } from "./PanelActionBar"
```

Pages then import from `@/components/shared` instead of individual paths.

---

## Files Created / Modified

| Action | File | Change summary |
|---|---|---|
| **Create** | `backend/app/models/base.py` | `AuditBase` (4 audit cols), `SoftDeleteMixin` (2 delete cols) |
| Modify | `backend/app/models/organization.py` | `OrganizationResponse` inherits `AuditBase` |
| Modify | `backend/app/models/users.py` | `UserResponse` inherits `AuditBase, SoftDeleteMixin` |
| Modify | `backend/app/models/roles.py` | `RoleResponse` inherits `AuditBase, SoftDeleteMixin` |
| Modify | `backend/app/services/database.py` | Add `serialize_row`; add `_db_list_entity`; refactor `db_list_*`; remove `_serialize_user_row`, `_serialize_role_row` |
| **Create** | `backend/app/api/deps.py` | `get_or_404` async utility |
| Modify | `backend/app/api/routes/organizations.py` | Use `get_or_404`; import from `deps` |
| Modify | `backend/app/api/routes/users.py` | Use `get_or_404`; import from `deps` |
| Modify | `backend/app/api/routes/roles.py` | Use `get_or_404`; import from `deps` |
| **Create** | `frontend/src/components/shared/FieldGroup.tsx` | Extracted from all 3 page files |
| **Create** | `frontend/src/components/shared/ConfirmModal.tsx` | Extracted + parameterised from `DeleteConfirm` in all 3 pages |
| **Create** | `frontend/src/components/shared/PanelActionBar.tsx` | Extracted button-bar; prop-driven `ActionButton[]` |
| **Create** | `frontend/src/components/shared/SlidePanel.tsx` | Extracted panel shell; accepts `footer` and `deleteModal` slots |
| **Create** | `frontend/src/components/shared/DataTable.tsx` | Generic table + skeleton + empty state + pagination |
| **Create** | `frontend/src/components/shared/index.ts` | Barrel export |
| **Create** | `frontend/src/hooks/useEntityList.ts` | Debounce + pagination + refreshKey hook |
| Modify | `frontend/src/pages/Organizations.tsx` | Remove duplicates; use shared components + hook |
| Modify | `frontend/src/pages/Users.tsx` | Remove duplicates; use shared components + hook |
| Modify | `frontend/src/pages/Roles.tsx` | Remove duplicates; use shared components + hook |

---

## Verification Checklist

1. `python -c "from app.api.routes.organizations import router; from app.api.routes.users import router; from app.api.routes.roles import router; print('OK')"` — no import errors.
2. All six audit fields present in a GET response for each entity after the model refactor.
3. `npm run typecheck` — zero errors. No new `any` types.
4. Organizations page: table loads, search filters, plan dropdown filters, pagination works, create/edit/delete flows work.
5. Users page: same flows, role dropdown still populates from `GET /api/roles`.
6. Roles page: same flows, seeded roles show lock icon and only "Close" in view mode.
7. Delete confirmation modal shows inline error when role is assigned to active users.
8. `grep -r "FieldGroup" frontend/src/pages` — no matches (all removed from page files).
9. `grep -r "SkeletonRows" frontend/src/pages` — no matches.
10. `grep -r "alertdialog" frontend/src/pages` — no matches (moved to `ConfirmModal`).

---

## Risk Notes

- **`db_list_entity` + JOIN queries:** The Users list uses a three-table JOIN with aliased column names (`u.deleted_on`, `o.name AS org_name`). The `_db_list_entity` helper must accept a full `select_sql` string (not just a table name) so it can handle this. Verify the aliased COUNT query (`SELECT COUNT(*) FROM users u WHERE u.deleted_on IS NULL`) matches the WHERE fragment prefix (`u.deleted_on IS NULL`).
- **`useEntityList` + `planFilter`:** The Organizations page passes a `useCallback`-wrapped fetcher that closes over `planFilter`. If `planFilter` is not included in the `useCallback` dependency array, stale closure bugs will occur. The plan uses `extraDeps: [planFilter]` to auto-reset page and trigger refetch; the fetcher must also list `planFilter` in its own dep array.
- **Generic `DataTable` in TSX:** Use `function DataTable<T,>(...)` with a trailing comma in the type parameter to avoid the TSX parser treating `<T>` as a JSX opening tag.
- **`Roles.tsx` `deleteError` state:** Currently only Roles tracks per-deletion error text (`deleteError`). After the refactor, this state moves from `Roles`'s page-level state into the `deleteModal` slot — `ConfirmModal` receives `error` as a prop. Verify that `setDeleteError(null)` is called on modal cancel and on successful delete.

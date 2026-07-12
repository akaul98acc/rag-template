# Plan: Roles CRUD

## Context

Spec: `_specs/roles-crud.md`

The `roles` table currently has two columns (`id`, `name`) and is treated as immutable reference data. This plan upgrades it to a fully managed entity with audit columns, soft-delete, paginated CRUD API, and a new Roles management page in the frontend. Three spec decisions are locked:

- **Seeded roles are protected** — `Admin`, `Manager`, `User`, `Viewer` cannot be deleted or edited.
- **Delete blocked if active users assigned** — a delete attempt counts users with that `role_id` where `deleted_on IS NULL`; if > 0, return 409 with the count.
- **Soft-deleted names are not reusable** — `name UNIQUE` constraint covers both active and deleted rows; 409 on duplicate regardless of deleted status.

**Frontend note:** `Users.tsx` already fetches roles dynamically via `listRoles()` — no hardcoding to remove. The only frontend change needed there is updating `listRoles()` to handle the new paginated response shape.

---

## Implementation Order

---

### Step 1 — Database schema: `backend/app/services/database.py`

#### 1a. Extend `roles` DDL in `_ensure_schema()`

The `CREATE TABLE IF NOT EXISTS roles` block only adds new columns via separate `ALTER TABLE` statements appended after the existing block (the same pattern used for `users`):

```sql
-- Already present — do not change:
CREATE TABLE IF NOT EXISTS roles (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- Add after existing block (idempotent):
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by  TEXT        NOT NULL DEFAULT 'system';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_on  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_by  TEXT        NOT NULL DEFAULT 'system';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_on  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_by  TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_on  TIMESTAMPTZ;
```

#### 1b. Update seed block

Existing seed block only runs on empty table. Leave the condition unchanged; add audit defaults to the `INSERT`:

```sql
INSERT INTO roles (name, created_by, updated_by)
VALUES (%s, 'system', 'system')
ON CONFLICT (name) DO NOTHING
```

#### 1c. Update `_ROLES_FALLBACK`

Add audit fields to each entry so in-memory responses have the same shape as DB responses:

```python
_ROLES_FALLBACK: dict[str, dict] = {
    "00000001-0000-0000-0000-000000000001": {
        "id": "00000001-0000-0000-0000-000000000001", "name": "Admin",
        "created_by": "system", "created_on": "2024-01-01T00:00:00Z",
        "updated_by": "system", "updated_on": "2024-01-01T00:00:00Z",
        "deleted_by": None, "deleted_on": None,
    },
    # … same for Manager, User, Viewer
}
```

#### 1d. Constant for protected roles

Add at module level:

```python
_SEEDED_ROLE_NAMES: frozenset[str] = frozenset({"Admin", "Manager", "User", "Viewer"})
```

#### 1e. New DB functions

Replace `db_list_roles()` with a paginated version and add the full CRUD set:

| Function | Signature | Notes |
|---|---|---|
| `db_list_roles(page, page_size, search)` | `async def db_list_roles(page: int = 1, page_size: int = 20, search: str = "") -> dict` | `WHERE deleted_on IS NULL` + `ILIKE %search%` on `name`; returns `{items, total, page, page_size}` |
| `db_get_role(role_id)` | `async def db_get_role(role_id: str) -> dict \| None` | `WHERE id=%s AND deleted_on IS NULL` |
| `db_check_role_name(name)` | `async def db_check_role_name(name: str) -> bool` | `SELECT 1 FROM roles WHERE LOWER(name)=LOWER(%s) LIMIT 1` — checks ALL rows (including deleted) |
| `db_create_role(data)` | `async def db_create_role(data: dict) -> dict` | `INSERT … RETURNING *`; raises `UniqueViolation` on duplicate |
| `db_update_role(role_id, data)` | `async def db_update_role(role_id: str, data: dict) -> dict \| None` | Updates `name`, `updated_by`, `updated_on`; checks `name` not seeded |
| `db_count_users_for_role(role_id)` | `async def db_count_users_for_role(role_id: str) -> int` | `SELECT COUNT(*) FROM users WHERE role_id=%s AND deleted_on IS NULL` |
| `db_delete_role(role_id)` | `async def db_delete_role(role_id: str) -> dict \| None` | `UPDATE … SET deleted_by='system', deleted_on=NOW() WHERE id=%s AND deleted_on IS NULL RETURNING *` |

In-memory fallbacks for each function must mirror the DB behaviour (skip deleted entries, enforce seeded protection, return matching shape).

---

### Step 2 — Pydantic models: `backend/app/models/roles.py` (new file)

```python
from pydantic import BaseModel

class RoleCreate(BaseModel):
    name: str

class RoleUpdate(BaseModel):
    name: str

class RoleResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str
    deleted_by: str | None
    deleted_on: str | None

class RoleListResponse(BaseModel):
    items: list[RoleResponse]
    total: int
    page: int
    page_size: int
```

---

### Step 3 — Route handlers: `backend/app/api/routes/roles.py`

Replace the existing single-endpoint file with full CRUD. **Route declaration order is critical** — `check-name` must appear before `/{role_id}`.

| Method | Path | Handler | Returns |
|---|---|---|---|
| `GET` | `/roles` | `list_roles(page, page_size, search)` | `RoleListResponse` |
| `POST` | `/roles` | `create_role(body: RoleCreate)` | `RoleResponse` 201 |
| `GET` | `/roles/check-name` | `check_role_name(name: str)` | `{available: bool}` |
| `GET` | `/roles/{role_id}` | `get_role(role_id)` | `RoleResponse` |
| `PUT` | `/roles/{role_id}` | `update_role(role_id, body: RoleUpdate)` | `RoleResponse` |
| `DELETE` | `/roles/{role_id}` | `delete_role(role_id)` | `204` |

**Business rules encoded in route handlers (thin — delegate to DB functions):**

- `POST /roles`: call `db_check_role_name`; if not available → `409 {"detail": "Role name already exists"}`.
- `PUT /roles/{role_id}`: check role exists; if `name in _SEEDED_ROLE_NAMES` → `403 {"detail": "Seeded roles cannot be edited"}`. If new name conflicts → `409`.
- `DELETE /roles/{role_id}`: check role exists; if `name in _SEEDED_ROLE_NAMES` → `403 {"detail": "Seeded roles cannot be deleted"}`. Call `db_count_users_for_role`; if > 0 → `409 {"detail": "Cannot delete role assigned to {n} active user(s)"}`. Otherwise soft-delete.

The router is already registered in `main.py` — no change needed there.

---

### Step 4 — TypeScript types: `frontend/src/types/api.ts`

Extend the existing `Role` interface and add new types:

```typescript
// Replace existing Role:
export interface Role {
  id: string;
  name: string;
  created_by: string;
  created_on: string;
  updated_by: string;
  updated_on: string;
  deleted_by?: string | null;
  deleted_on?: string | null;
}

export interface RoleListResponse {
  items: Role[];
  total: number;
  page: number;
  page_size: number;
}

export interface RoleCreate { name: string; }
export interface RoleUpdate { name: string; }
```

---

### Step 5 — API service functions: `frontend/src/services/api.ts`

Replace the existing `listRoles()` and add CRUD calls:

```typescript
// Updated — returns paginated shape; Users page reads .items
export async function listRoles(params?: { page?: number; page_size?: number; search?: string }): Promise<RoleListResponse> {
  const { data } = await client.get<RoleListResponse>("/roles", { params });
  return data;
}

export async function getRole(id: string): Promise<Role> { ... }
export async function createRole(data: RoleCreate): Promise<Role> { ... }
export async function updateRole(id: string, data: RoleUpdate): Promise<Role> { ... }
export async function deleteRole(id: string): Promise<void> { ... }
export async function checkRoleName(name: string): Promise<{ available: boolean }> { ... }
```

**Update `Users.tsx` call site:** change `listRoles().then(res => setRoles(res))` to `listRoles({ page_size: 100 }).then(res => setRoles(res.items))`.

---

### Step 6 — Roles page: `frontend/src/pages/Roles.tsx` (new file)

Mirror `Organizations.tsx` and `Users.tsx` exactly for layout, state, and interaction patterns.

#### State

```typescript
const [roles, setRoles] = useState<Role[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const PAGE_SIZE = 20;
const [search, setSearch] = useState("");
const [debouncedSearch, setDebouncedSearch] = useState("");
const [refreshKey, setRefreshKey] = useState(0);
const [loading, setLoading] = useState(false);
const [panelOpen, setPanelOpen] = useState(false);
const [panelMode, setPanelMode] = useState<"view" | "edit" | "create">("view");
const [selected, setSelected] = useState<Role | null>(null);
const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
const [deleteError, setDeleteError] = useState<string | null>(null); // for 409 message
```

#### List fetch

`useEffect` on `[debouncedSearch, page, refreshKey]` → calls `listRoles({ page, page_size: PAGE_SIZE, search: debouncedSearch })` → sets `roles` and `total`.

#### Debounced search

Same 300 ms debounce pattern as Organizations/Users; resets `page` to 1 on change.

#### Table columns

| Role Name | Created By | Created On | Updated On | Actions |
|---|---|---|---|---|

Seeded roles show a lock icon or "Protected" badge in place of the delete action.

#### Slide-in panel (`role="dialog"`, z-index 50)

- **View mode:** all fields read-only including audit fields.
- **Edit mode:** `name` input editable; `check-name` called on blur (only if name changed); shows inline error if name taken. Seeded roles: edit button hidden / panel shows "Protected role — cannot be edited."
- **Create mode:** empty `name` input; `check-name` on blur.
- Save calls `createRole` or `updateRole`; on success: closes panel, increments `refreshKey`.

#### Delete confirmation modal (`role="alertdialog"`, z-index 60)

- Triggered from panel or row action button (hidden for seeded roles).
- On confirm: calls `deleteRole(id)`; if 409 → shows `deleteError` message inside the modal ("Cannot delete: role is assigned to N active user(s)"); modal stays open.
- On success: closes modal and panel, increments `refreshKey`.

#### Pagination

Same pagination bar as Organizations/Users: Previous / Next buttons + "Page X of Y".

#### Empty / loading states

- Skeleton rows during fetch (same `SkeletonRows` pattern).
- "No roles found." message when `total === 0` and not loading.

---

### Step 7 — App router + navigation: `frontend/src/App.tsx`

Add Roles route and nav link alongside Organizations and Users:

```tsx
import Roles from "./pages/Roles";
<Route path="/roles" element={<Roles />} />
<NavLink to="/roles">Roles</NavLink>
```

---

## Files Modified / Created

| Action | File | Change summary |
|---|---|---|
| Modify | `backend/app/services/database.py` | Audit columns DDL, seeded fallback update, 6 new DB functions, `_SEEDED_ROLE_NAMES` constant |
| **Create** | `backend/app/models/roles.py` | `RoleCreate`, `RoleUpdate`, `RoleResponse`, `RoleListResponse` |
| Modify | `backend/app/api/routes/roles.py` | Full CRUD (5 routes); business rule guards for seeded + user-count checks |
| Modify | `frontend/src/types/api.ts` | Extended `Role`, new `RoleListResponse`, `RoleCreate`, `RoleUpdate` |
| Modify | `frontend/src/services/api.ts` | Updated `listRoles` (paginated), 4 new CRUD functions |
| Modify | `frontend/src/pages/Users.tsx` | Update `listRoles` call site to read `.items` |
| **Create** | `frontend/src/pages/Roles.tsx` | Full CRUD page |
| Modify | `frontend/src/App.tsx` | Roles route + nav link |

---

## Verification Checklist

1. `GET /api/roles` returns `{ items: [...], total: 4, page: 1, page_size: 20 }` with 4 seeded roles and their audit fields.
2. `GET /api/roles?search=ad` returns only the Admin role.
3. `POST /api/roles { "name": "Analyst" }` → 201 with audit fields set.
4. `POST /api/roles { "name": "Admin" }` → 409 "Role name already exists".
5. `PUT /api/roles/<admin-id> { "name": "SuperAdmin" }` → 403 "Seeded roles cannot be edited".
6. `DELETE /api/roles/<admin-id>` → 403 "Seeded roles cannot be deleted".
7. Assign the new Analyst role to a user, then `DELETE /api/roles/<analyst-id>` → 409 "Cannot delete role assigned to 1 active user(s)".
8. Delete that user (soft-delete), then retry delete → 204 success.
9. `POST /api/roles { "name": "Analyst" }` after soft-deleting Analyst → 409 (name not reusable).
10. Roles page: search filters list, pagination works, skeleton shown on load.
11. Panel: create / edit / delete flows work; seeded rows show no edit/delete actions.
12. Users page: role dropdown still populates correctly (reads `.items` from paginated response).
13. `npm run typecheck` — no errors.

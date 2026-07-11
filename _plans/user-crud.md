# Plan: User CRUD

## Context

The spec (`_specs/user-crud.md`) adds a Users management module. Admins can create, view, edit, and soft-delete users. Each user belongs to an organization (stored as `org_id UUID`) and has a role (stored as `role_id UUID`). Both fields are FK references displayed as name-based dropdowns in the UI. The feature mirrors the Organizations CRUD pattern — same layering, same file structure, same frontend panel/table architecture — with two meaningful differences: **soft-delete** and **FK-based dropdowns** for org and role.

---

## Implementation Order

### 1. Database Schema — `backend/app/services/database.py`

**New `roles` table** (created before `users`):

```sql
CREATE TABLE IF NOT EXISTS roles (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);
```

Seeded with four defaults on first boot: `Admin`, `Manager`, `User`, `Viewer`.

**`users` table** (uses `org_id UUID` and `role_id UUID`):

```sql
CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    email        TEXT        NOT NULL UNIQUE,
    phone_number TEXT,
    org_id       UUID,
    role_id      UUID,
    created_by   TEXT        NOT NULL DEFAULT 'system',
    created_on   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by   TEXT        NOT NULL DEFAULT 'system',
    updated_on   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by   TEXT,
    deleted_on   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
```

In-memory fallbacks:
```python
_USERS_FALLBACK: dict[str, dict] = {}
_ROLES_FALLBACK: dict[str, dict] = { ... }  # seeded with 4 default roles
```

DB functions — all user SELECTs `LEFT JOIN organizations` and `LEFT JOIN roles` to return `org_name` and `role_name`:

| Function | SQL pattern | Notes |
|---|---|---|
| `db_list_roles()` | `SELECT id, name FROM roles ORDER BY name` | Used by `/api/roles` |
| `db_list_users(page, page_size, search)` | `SELECT u.*, o.name AS org_name, r.name AS role_name FROM users u LEFT JOIN orgs LEFT JOIN roles WHERE deleted_on IS NULL` + ILIKE + COUNT | Returns `{items, total, page, page_size}` |
| `db_get_user(user_id)` | same SELECT + `WHERE u.id=%s AND u.deleted_on IS NULL` | Returns dict or None |
| `db_check_email(email)` | `SELECT 1 ... WHERE email=%s LIMIT 1` | Returns bool |
| `db_create_user(data)` | `WITH ins AS (INSERT … RETURNING *) SELECT ins.*, o.name, r.name FROM ins LEFT JOIN …` | Raises `UniqueViolation` on duplicate email |
| `db_update_user(user_id, data)` | `WITH upd AS (UPDATE … RETURNING *) SELECT upd.*, o.name, r.name FROM upd LEFT JOIN …` | Only updates: name, phone_number, role_id |
| `db_delete_user(user_id)` | `UPDATE SET deleted_by='system', deleted_on=NOW()` | Returns bool |

**Migrations** (run in `_ensure_schema` on every startup):
- `role TEXT` column → drop it, `ADD COLUMN IF NOT EXISTS role_id UUID`
- `org_code TEXT` column → `ADD COLUMN IF NOT EXISTS org_id UUID`, UPDATE via JOIN to organizations, then drop `org_code`

---

### 2. Pydantic Models — `backend/app/models/users.py`

```python
class UserCreate(BaseModel):
    name: str
    email: str
    phone_number: str | None = None
    org_id: str   # UUID of the organization
    role_id: str  # UUID of the role

class UserUpdate(BaseModel):
    name: str
    phone_number: str | None = None
    role_id: str  # org is immutable after creation

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone_number: str | None
    org_id: str | None
    org_name: str | None = None   # joined from organizations
    role_id: str | None
    role_name: str | None = None  # joined from roles
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str
    deleted_by: str | None
    deleted_on: str | None

class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
```

---

### 3. Route Handlers

**`backend/app/api/routes/roles.py`** (new file):
```
GET /roles  → list_roles() → list[{id, name}]
```

**`backend/app/api/routes/users.py`** (existing):
```
GET  /users                  → list_users(page, page_size, search) → UserListResponse
POST /users                  → create_user(body: UserCreate)        → UserResponse 201
GET  /users/check-email      → check_email(email: str)              → {available: bool}
GET  /users/{user_id}        → get_user(user_id)                    → UserResponse
PUT  /users/{user_id}        → update_user(user_id, body: UserUpdate) → UserResponse
DELETE /users/{user_id}      → delete_user(user_id)                 → 204
```

---

### 4. Register Routers — `backend/app/main.py`

```python
from app.api.routes import ..., roles, users
app.include_router(roles.router, prefix="/api", tags=["roles"])
app.include_router(users.router, prefix="/api", tags=["users"])
```

---

### 5. TypeScript Types — `frontend/src/types/api.ts`

```typescript
export interface Role { id: string; name: string; }

export interface User {
  id: string; name: string; email: string; phone_number?: string | null;
  org_id: string | null; org_name?: string | null;
  role_id: string | null; role_name?: string | null;
  created_by: string; created_on: string;
  updated_by: string; updated_on: string;
  deleted_by?: string | null; deleted_on?: string | null;
}
export interface UserListResponse { items: User[]; total: number; page: number; page_size: number; }
export interface UserCreate { name: string; email: string; phone_number?: string; org_id: string; role_id: string; }
export interface UserUpdate { name: string; phone_number?: string; role_id: string; }
```

---

### 6. API Service Functions — `frontend/src/services/api.ts`

```typescript
listRoles()             → GET /roles  → Role[]
listUsers(params?)      → GET /users?page&page_size&search
createUser(data)        → POST /users
getUser(id)             → GET /users/:id
updateUser(id, data)    → PUT /users/:id
deleteUser(id)          → DELETE /users/:id
checkEmail(email)       → GET /users/check-email?email=
```

---

### 7. Users Page — `frontend/src/pages/Users.tsx`

- **`FormState`**: `name, email, phone_number, org_id, role_id`
- **`UserPanel`** (slide-in, three modes: view/edit/create):
  - Email uniqueness check on blur → calls `checkEmail()`, inline red error if taken
  - Email: read-only in edit mode
  - **Organization** `<select>`: options fetched via `listOrganizations({ page_size: 100 })`, `value={org.id}` display `{org.name}`. Read-only (org_name) in edit and view modes.
  - **Role** `<select>`: options fetched via `listRoles()`, `value={role.id}` display `{role.name}`. Editable dropdown in both create and edit modes. Read-only (role_name) in view mode.
  - `validate()` checks name, email format, org_id, role_id required
  - 409 response → inline email error
- **Table columns**: Name | Email | Organization (org_name) | Role (role_name) | Created
- **`DeleteConfirm`** modal, `SkeletonRows`, pagination — unchanged from orgs pattern

---

### 8. App Router + Nav — `frontend/src/App.tsx`

```tsx
import Users from "./pages/Users";
<Route path="/users" element={<Users />} />
<NavLink to="/users">Users</NavLink>
```

---

## Files Modified / Created

| Action | File |
|---|---|
| Modify | `backend/app/services/database.py` |
| Modify | `backend/app/models/users.py` |
| **Create** | `backend/app/api/routes/roles.py` |
| Modify | `backend/app/api/routes/users.py` |
| Modify | `backend/app/main.py` |
| Modify | `frontend/src/types/api.ts` |
| Modify | `frontend/src/services/api.ts` |
| Modify | `frontend/src/pages/Users.tsx` |

---

## Verification

1. `GET /api/roles` returns `[{id, name}]` with 4 default roles
2. `GET /api/users` returns `{"items":[],"total":0,"page":1,"page_size":20}`
3. Click **Add User** — org and role dropdowns populated from APIs; submit → user appears in table with org_name and role_name
4. Blur on a taken email → inline red error
5. Duplicate email on submit → 409 → inline error
6. Click row → view mode shows org_name and role_name; click Edit → org read-only, role is dropdown; save → updated_on refreshes
7. Delete → soft-delete; user disappears from list
8. `npm run typecheck` — no errors

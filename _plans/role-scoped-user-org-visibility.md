# Plan: Role-Scoped User and Organization Visibility

> **Spec:** `_specs/role-scoped-user-org-visibility.md`  
> **Branch:** `claude/feature/role-scoped-user-org-visibility`  
> **Status:** Ready for implementation

---

## Overview

This feature gates the Users list to the caller's own organization for Admin-role users while Super Admins retain full cross-org visibility, and hides the Organizations tab entirely from non-Super-Admins. All role evaluation is isolated into dedicated pure-function helpers and FastAPI dependencies; route handlers and React components receive computed parameters, never role names to branch on inline.

---

## Prerequisites / Decisions Already Made

| Decision | Resolution |
|---|---|
| Role source | New session concept — `role` claim embedded in JWT at login |
| Org filter location | Backend only — derived from JWT, never trusted from a frontend query param |
| No `org_id` → blocked | A session with `role != "Super Admin"` and empty `org_id` gets HTTP 403 before reaching any handler |
| "No if/else" constraint | Role branching is isolated into named pure functions / dependencies; callers receive a typed result (e.g., `ScopedSession`) and use it without re-inspecting the role |
| Super Admin identity | New role row seeded at startup; JWT `role` claim carries the exact name `"Super Admin"` |

---

## Implementation Steps

### Layer 1 — Database (`backend/app/services/database.py`)

**Step 1.1 — Seed "Super Admin" role**

- Add a fifth entry to `_ROLES_FALLBACK` with a fixed UUID and `"name": "Super Admin"`, mirroring the existing four entries.
- Update `_SEEDED_ROLE_NAMES` frozenset to include `"Super Admin"`.
- In `_ensure_schema()`, replace the `if count == 0` seeding guard with unconditional `INSERT ... ON CONFLICT (name) DO NOTHING` for all five role names. This is idempotent and seeds `Super Admin` on the next startup of any existing deployment.

---

**Step 1.2 — Add `org_id_filter` parameter to `db_list_users`; always exclude Super Admins**

- Add `org_id_filter: str | None = None` as a new keyword parameter to `db_list_users`.
- In-memory fallback path: after the `deleted_on IS NULL` filter, conditionally filter by `org_id` when `org_id_filter` is not `None`. **Always** additionally filter out any user whose role name is `"Super Admin"` (check `_ROLES_FALLBACK` to resolve the name).
- DB path: append a conditional entry to `all_filters` for `org_id` using the same pattern as the `search` filter — `("u.org_id = %s::uuid", [org_id_filter])`. **Also unconditionally** append `("r.name != %s", ["Super Admin"])` so Super Admin users are never returned regardless of caller role. This join is already present via `_USER_SELECT`.

---

**Step 1.3 — Allow nullable `org_id` for Super Admin users**

- In `_ensure_schema()`, ensure the `users.org_id` column is `NULL`-able. Add an idempotent `ALTER TABLE users ALTER COLUMN org_id DROP NOT NULL` guarded by an `information_schema` check (same pattern as existing column-rename migrations).
- In `db_create_user`: accept `org_id: str | None`. When `None`, insert `NULL` for `org_id`. The existing FK constraint allows NULL (FK columns are nullable by default in Postgres unless `NOT NULL` is also declared).
- Backend validation rule (enforced in the route handler, not here): `org_id` is **required** when the resolved role is not `"Super Admin"`; it is **optional** (may be `None`/omitted) when the role is `"Super Admin"`. See Step 2.4.

---

### Layer 2 — Backend API

**Step 2.1 — Add `ScopedSession`, `get_scoped_session`, and `require_super_admin` to `deps.py`**

File: `backend/app/api/deps.py`

Define a `ScopedSession` dataclass:
- `org_id_filter: str | None` — `None` for Super Admin (unscoped), a UUID string for org-scoped users.

Define `build_scoped_session(role: str, org_id: str) -> ScopedSession` as a **pure helper function** (no FastAPI `Depends`) that:
- Returns `ScopedSession(org_id_filter=None)` for `"Super Admin"`.
- Raises HTTP 403 if `org_id` is empty and role is not Super Admin.
- Otherwise returns `ScopedSession(org_id_filter=org_id)`.

Define `get_scoped_session` as a FastAPI dependency that calls `build_scoped_session` with claims from `get_current_user`.

Define `require_super_admin` as a separate FastAPI dependency that raises HTTP 403 unless `current_user.role == "Super Admin"`. Used for routes exclusively for Super Admins.

---

**Step 2.2 — Update `GET /api/users` to use `ScopedSession`**

File: `backend/app/api/routes/users.py`

- Import `ScopedSession` and `get_scoped_session` from `app.api.deps`.
- Add `session: ScopedSession = Depends(get_scoped_session)` to `list_users`.
- Pass `org_id_filter=session.org_id_filter` to `db_list_users`.
- Super Admin users are excluded automatically by `db_list_users` (Step 1.2) — no additional filter needed here.
- No other handler in this file changes.

---

**Step 2.4 — Enforce role required and org conditional on user create/update**

File: `backend/app/api/routes/users.py`

- In `create_user`: after resolving `role_id` to a role name via a `db_get_role` lookup, validate:
  - `role_id` must always be present — return HTTP 422 if missing.
  - If the resolved role name is **not** `"Super Admin"`, `org_id` must also be present — return HTTP 422 if missing.
  - If the resolved role name **is** `"Super Admin"`, `org_id` may be `None`; pass `None` to `db_create_user`.
- In `update_user`: `role_id` is an updatable field. Apply the same `org_id` conditional: if the update changes `role_id` to `"Super Admin"`, `org_id` may remain as stored (no change needed — it is immutable after creation). Document: org is set at creation and never updated; Super Admin users retain `NULL` org in the DB.
- Extract the validation logic into a named pure helper `validate_user_org_role(role_name: str, org_id: str | None) -> None` that raises `HTTPException` on violation. This keeps it testable independently.

---

**Step 2.3 — Protect Organizations routes with `require_super_admin`**

File: `backend/app/api/routes/organizations.py`

- Import `require_super_admin` from `app.api.deps`.
- Add `_: dict = Depends(require_super_admin)` to: `list_organizations`, `create_organization`, `update_organization`, `delete_organization`, `check_org_code`.
- Leave `get_organization/{org_id}` **unprotected at the role level** (Admins need this to resolve their own org's name for the Users create form).

---

### Layer 3 — Frontend

**Step 3.1 — Add session utility helpers**

File: `frontend/src/lib/session-utils.ts` _(new file)_

Export two pure functions:

`isSuperAdmin(claims: JwtClaims | null): boolean`
- Returns `true` only when `claims?.role === "Super Admin"`.

`buildNavLinks(claims: JwtClaims | null): NavLink[]`
- Returns a base array of nav links for all authenticated users.
- Appends the Organizations link only when `isSuperAdmin(claims)` is true.
- Components iterate over the result — no role branching in JSX.

`buildOrgsFetcher(claims: JwtClaims | null): () => Promise<Organization[]>`
- Returns `() => listOrganizations(...)` for Super Admins.
- Returns `() => getOrganization(claims.org_id).then(org => [org])` for Admins.
- Returns `() => Promise.resolve([])` when `org_id` is missing.
- `UserPanel` accepts this as a prop and never inspects the role itself.

---

**Step 3.2 — Update navigation in `App.tsx`**

File: `frontend/src/App.tsx`

- Import `buildNavLinks` and `isSuperAdmin` from `@/lib/session-utils`.
- In `AppLayout`, replace the hardcoded nav link block with `buildNavLinks(claims).map(link => <Link ...>)`.
- Add a `RequireSuperAdmin` route guard component (analogous to the existing `RequireAuth`) that redirects non-Super-Admins to `/step1`.
- Wrap the `/organizations` route with `<RequireSuperAdmin>` so direct URL navigation is also blocked.

---

**Step 3.3 — Update `UserPanel` org dropdown**

File: `frontend/src/pages/Users.tsx`

- Add an `orgsFetcher: () => Promise<Organization[]>` prop to `UserPanel`.
- Replace the internal `listOrganizations()` call inside `UserPanel`'s `useEffect` with a call to `orgsFetcher()`.
- In the parent `Users` page, compute `orgsFetcher = buildOrgsFetcher(claims)` and pass it to `UserPanel`.
- Effect: Admins see only their own organization in the create-user dropdown; Super Admins see all organizations. `UserPanel` itself never inspects the role.
- **Role field is required** in create and edit mode — add frontend validation that prevents form submission when `role_id` is unset. Show an inline error on submit.
- **Org field is conditional on role**: when the user selects the "Super Admin" role in the role dropdown, hide the organization field and clear its value. For all other roles, the org field is visible and required. Implement this with a derived boolean `isSelectedRoleSuperAdmin` computed from the selected role name — no inline role string comparison in JSX (delegate to `isSuperAdmin` from `session-utils.ts` or a local helper that accepts a role name string).

---

**Step 3.4 — Verify `JwtClaims` type**

File: `frontend/src/types/api.ts`

- Confirm `JwtClaims.role` is typed as `string` (no change needed if so — "Super Admin" fits).
- Confirm `JwtClaims.org_id` exists as `string` (needed for `buildOrgsFetcher`). Add if missing.

---

## Risks and Gotchas

**1. Seed change on existing deployments**

The current seeding block uses `if count == 0` — if an existing database already has the four roles, `Super Admin` will never be seeded. The fix (Step 1.1) changes to unconditional `INSERT ... ON CONFLICT DO NOTHING`. This is safe and idempotent but must be verified on staging before deploying to production.

**2. Steps 2.3 and 3.3 must be deployed together**

If `GET /api/organizations` is protected (Step 2.3) before `UserPanel` is updated (Step 3.3), non-Super-Admin users trying to create/edit users will see a broken org dropdown. Coordinate these two changes in the same deployment.

**3. Super Admins have a NULL `org_id` in the DB and JWT**

Super Admins are created without an `org_id` (Step 1.3 makes the column nullable). Their JWT will carry `org_id: null` or omit it. `build_scoped_session` already ignores `org_id` for Super Admins, so this is safe. The OTP login flow must handle a null `org_id` claim without erroring — verify that the JWT encode step in `auth.py` tolerates `None` for `org_id`.

**4. Direct URL navigation to `/organizations` by non-Super-Admins**

Step 3.2 handles this with `RequireSuperAdmin` by redirecting to `/step1`. A toast notification for better UX is desirable but out of scope for this plan.

**5. `db_get_history` uses legacy role branching**

`db_get_history` has existing `if is_admin:` branching that predates this feature. The new pure-function pattern is not retroactively applied to it in this plan. Do not touch that path during this implementation.

**6. `require_super_admin` is independent of `get_scoped_session`**

They are separate FastAPI dependencies to avoid chaining. FastAPI will deduplicate the underlying `get_current_user` call via its dependency cache within a single request — no double JWT decode.

---

## Definition of Done

**Database**
- [ ] `Super Admin` role row exists in `roles` after a fresh startup and after restarting an existing deployment
- [ ] `_ROLES_FALLBACK` in-memory dict includes the `Super Admin` entry
- [ ] `users.org_id` column is nullable in the schema (Super Admin users may have `NULL` org)
- [ ] `db_list_users(org_id_filter="<uuid>")` returns only users from that org, never Super Admin users
- [ ] `db_list_users(org_id_filter=None)` returns all non-Super-Admin users
- [ ] `db_create_user` accepts `org_id=None` and inserts NULL without error

**Backend — Users scoping**
- [ ] `GET /api/users` with Admin JWT returns only users whose `org_id` matches the token; no Super Admin rows included
- [ ] `GET /api/users` with Super Admin JWT returns all non-Super-Admin users
- [ ] `GET /api/users` with a JWT whose `org_id` is empty and role is not Super Admin returns HTTP 403
- [ ] `POST /api/users` with `role_id` missing returns HTTP 422
- [ ] `POST /api/users` with a non-Super-Admin `role_id` and `org_id` missing returns HTTP 422
- [ ] `POST /api/users` with Super Admin `role_id` and no `org_id` succeeds (201)
- [ ] `build_scoped_session` and `validate_user_org_role` are pure functions, independently unit-testable

**Backend — Organizations protection**
- [ ] `GET /api/organizations` returns HTTP 403 for Admin JWT
- [ ] `POST /api/organizations` returns HTTP 403 for Admin JWT
- [ ] `PUT /api/organizations/{id}` returns HTTP 403 for Admin JWT
- [ ] `DELETE /api/organizations/{id}` returns HTTP 403 for Admin JWT
- [ ] `GET /api/organizations/{org_id}` returns HTTP 200 for Admin JWT (single-org lookup still allowed)

**Frontend — Navigation**
- [ ] Logged-in Admin: Organizations link absent from nav
- [ ] Logged-in Super Admin: Organizations link present and functional
- [ ] Direct navigation to `/organizations` by Admin redirects to `/step1`
- [ ] `buildNavLinks` produces correct arrays for both roles (pure function, unit-testable)

**Frontend — Users page**
- [ ] Super Admin users never appear in the users table for any viewer role
- [ ] Admin sees only users from their own org; search and pagination respect the same scope
- [ ] Super Admin viewer sees all non-Super-Admin users across all organizations
- [ ] `UserPanel` org dropdown shows full org list for Super Admin viewer
- [ ] `UserPanel` org dropdown shows only the Admin's own org for Admin viewers
- [ ] Selecting "Super Admin" role in the create/edit form hides the org field and clears its value
- [ ] Selecting any other role shows the org field and marks it required
- [ ] Form submission is blocked (with inline error) when role is unset
- [ ] Form submission is blocked (with inline error) when org is unset and role is not Super Admin
- [ ] No unhandled 403 errors in the browser console for any authenticated role

**General**
- [ ] All role-evaluating functions (`isSuperAdmin`, `buildNavLinks`, `buildOrgsFetcher`, `build_scoped_session`, `validate_user_org_role`) are pure / parameter-driven with no side effects
- [ ] No `if role == "..." else` branching outside the designated helper functions / dependencies

---

## Critical Files

| File | Change |
|------|--------|
| `backend/app/services/database.py` | Seed Super Admin role; add `org_id_filter` param + Super Admin exclusion to `db_list_users`; nullable `org_id` for Super Admin users |
| `backend/app/api/deps.py` | Add `ScopedSession`, `build_scoped_session`, `get_scoped_session`, `require_super_admin` |
| `backend/app/api/routes/users.py` | Wire `get_scoped_session` into `list_users`; add `validate_user_org_role` to create/update |
| `backend/app/api/routes/organizations.py` | Protect mutating + list routes with `require_super_admin` |
| `frontend/src/lib/session-utils.ts` | New file — `isSuperAdmin`, `buildNavLinks`, `buildOrgsFetcher` |
| `frontend/src/App.tsx` | Data-driven nav links; add `RequireSuperAdmin` route guard |
| `frontend/src/pages/Users.tsx` | Pass `orgsFetcher` prop to `UserPanel`; remove internal `listOrganizations` call |
| `frontend/src/types/api.ts` | Verify `JwtClaims` has `role: string` and `org_id: string` |

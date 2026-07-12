# Feature: Roles CRUD with Soft Delete and User Dropdown Mapping

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-07-12
> **Last Updated:** 2026-07-12
> **Ticket:** —

---

## Overview

Add a full CRUD management page for Roles that mirrors the Organizations and Users pattern. Roles currently exist as seeded reference data with no management UI. This feature exposes create, view, edit, and soft-delete operations for roles, adds the full audit-trail columns (`created_by`, `created_on`, `updated_by`, `updated_on`, `deleted_by`, `deleted_on`), and replaces the hardcoded role dropdown on the Users page with a live fetch from the Roles API.

---

## Goals

- [ ] Roles page with paginated list, search, and skeleton loading matching the Organizations/Users pattern.
- [ ] Create role — `role_name` input, duplicate name returns 409.
- [ ] View/Edit role — slide-in panel with editable `role_name`; audit fields shown read-only.
- [ ] Soft-delete role — delete confirmation modal; sets `deleted_by`/`deleted_on`; deleted roles are hidden from all list/get endpoints.
- [ ] Backend schema: add audit columns (`created_by`, `created_on`, `updated_by`, `updated_on`, `deleted_by`, `deleted_on`) to the `roles` table via idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `_ensure_schema()`.
- [ ] `GET /api/roles` returns only non-deleted roles; used by the Users page dropdown.
- [ ] Users page role dropdown populated from `GET /api/roles` instead of a hardcoded list; each option uses `role_id` as value and `role_name` as label.

---

## Non-Goals

- Not exposing permission/access-control logic tied to roles — roles remain label-only in this iteration.
- Not preventing deletion of roles that are still assigned to active users (warn only, or block — open question below).
- Not adding auth — all actor fields are hardcoded to `"system"` consistent with the rest of the app.
- Not supporting role hierarchy or role inheritance.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Admin | Create a new role with a unique name | New role is available in the Users dropdown immediately | P0 |
| 2 | Admin | Edit an existing role's name | Role label stays current across the app | P0 |
| 3 | Admin | Soft-delete a role no longer needed | It disappears from lists without losing historical data | P0 |
| 4 | Admin | See who created/updated/deleted a role and when | Maintain an audit trail | P1 |
| 5 | Admin | Assign a role to a user from a live dropdown | Role selection reflects the current set of active roles | P0 |

---

## UX

### User Flow

#### Roles page

1. User clicks the "Roles" tab in the top navigation bar.
2. Page loads with a paginated table of active roles (skeleton rows during fetch).
3. User can search by role name (debounced 300 ms, resets to page 1).
4. Clicking a row opens the view/edit slide-in panel showing `role_name` and read-only audit fields.
5. In the panel, clicking "Edit" switches to edit mode; user changes `role_name` and saves.
6. Clicking "Delete" in the panel opens the delete confirmation modal; confirming soft-deletes the role and refreshes the list.
7. Clicking "+ New Role" opens the create panel with an empty `role_name` field; saving creates the role and closes the panel.

#### Users page — role dropdown

1. When opening the create or edit panel for a user, the Role dropdown fetches from `GET /api/roles`.
2. Each option shows `role_name` as the label and `role_id` as the value.
3. The previously selected role (if editing) is pre-selected.

### Wireframes / Mockups

> _To be defined. UI should match the Organizations and Users pages exactly: same table layout, same slide-in panel pattern, same delete confirmation modal._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No roles exist | Empty state message: "No roles found." |
| API error on list fetch | Error message inline; retry option or toast |
| Duplicate role name on create | 409 response shown as inline field error: "Role name already exists" |
| Role name blank on save | Client-side validation prevents submit |
| Deleting a role assigned to users | Show warning count (open question); proceed or block per resolution |
| Loading role dropdown in Users panel | Spinner inside dropdown until fetch completes |

---

## Acceptance Criteria

### Functional

- [ ] Given the Roles page loads, when there are active roles, then they are displayed in a paginated table with columns: Role Name, Created On, Updated On.
- [ ] Given a user submits a new role, when the name is unique, then the role is created and appears in the list.
- [ ] Given a user submits a new role, when the name already exists (or exists as a soft-deleted record with the same name), then a 409 error is shown.
- [ ] Given a user edits a role name, when the name is valid and unique, then the role is updated and `updated_by`/`updated_on` are set.
- [ ] Given a user confirms deletion, when confirmed, then `deleted_by` and `deleted_on` are set and the role no longer appears in any list or dropdown.
- [ ] Given the Users create/edit panel opens, when the role dropdown renders, then it is populated from `GET /api/roles` (live data, not hardcoded).
- [ ] Given the Users page edit panel opens for an existing user, when the panel renders, then the user's current role is pre-selected in the dropdown.
- [ ] Given audit columns are present, when viewing a role in the panel, then `created_by`, `created_on`, `updated_by`, `updated_on` are shown read-only.

### Non-Functional

- [ ] List endpoint responds within acceptable time with pagination.
- [ ] Accessible — panel and modal follow the same `role="dialog"` / `role="alertdialog"` pattern as Organizations and Users pages.
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions).
- [ ] Mobile responsive at 375px and above.

### Out of Scope for This Release

- [ ] ~~Role-based access control enforcement~~
- [ ] ~~Bulk delete of roles~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Should deleting a role that is still assigned to active users be blocked (with a count shown) or allowed with a warning? | Adarsh | — | yes it should be blocked with a warning|
| 2 | Should soft-deleted role names be reusable (i.e., can a new role have the same name as a deleted one)? | Adarsh | — |No it should not be resuable| 
| 3 | Should the seeded roles (Admin, Manager, User, Viewer) be protected from deletion or editing? | Adarsh | — |Yes these should not be deleted |

---

## Dependencies

- [ ] Backend `roles` table schema extended with audit columns — must land before any UI work.
- [ ] `GET /api/roles` returns non-deleted roles only — Users page dropdown depends on this.
- [ ] New backend endpoints: `POST /api/roles`, `GET /api/roles/{role_id}`, `PUT /api/roles/{role_id}`, `DELETE /api/roles/{role_id}` (soft delete).

---

## Notes & References

- Roles page UI must follow the same pattern as `Organizations.tsx` and `Users.tsx` (debounced search, `refreshKey`, slide-in panel, delete confirmation modal).
- Actor fields (`created_by`, `updated_by`, `deleted_by`) hardcoded to `"system"` — consistent with rest of app (no auth yet).
- `GET /api/roles` already exists as a reference-data endpoint; it needs to be extended to filter `WHERE deleted_on IS NULL` and include audit fields in the response.
- Route ordering constraint: `check-role-name` (if added) must be declared before `/{role_id}` in the router.

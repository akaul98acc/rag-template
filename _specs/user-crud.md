# Feature: User CRUD

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **Ticket:** —

---

## Overview

Introduce a Users management module that allows administrators to create, view, edit, and delete users within the system. Each user belongs to an organization (selected from the existing organizations table via a dropdown) and carries a role identifier, full audit trail, and a unique email address.

---

## Goals

- [ ] Administrators can create a user with name, email, phone number, org code (from organizations), and role ID
- [ ] Email addresses are enforced as unique across all users
- [ ] Org code is a dropdown populated from the organizations table (not a free-text field)
- [ ] Each user record captures a full audit trail: created_by, updated_by, deleted_by and their corresponding timestamps
- [ ] Administrators can view, edit, and soft-delete users through a UI page consistent with the Organizations page

---

## Non-Goals

- Not implementing authentication or session-based login
- Not enforcing role permissions — `role_id` is stored as a reference but not validated against a roles table in this iteration
- Not sending email notifications on user creation or deletion
- Not supporting bulk import/export of users

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Admin | Create a new user and assign them to an organization via dropdown | Users are always linked to a valid org | P0 |
| 2 | Admin | See an inline error if I enter a duplicate email | I know immediately without submitting the form | P0 |
| 3 | Admin | Edit a user's name, phone, org, and role | User records stay up to date | P0 |
| 4 | Admin | Delete a user with a confirmation prompt | Accidental deletions are prevented | P0 |
| 5 | Admin | Search and filter the user list | I can quickly find a specific user | P1 |
| 6 | Admin | See who created and last updated each user | I have a clear audit history | P1 |

---

## UX

### User Flow

1. Admin navigates to the **Users** tab in the top navigation.
2. The page loads a paginated table of users (name, email, org code, role, created on).
3. Admin clicks **Add User** to open a slide-in panel.
4. Admin fills in: Name (required), Email (required, validated for uniqueness on blur), Phone Number, Org Code (required, dropdown from organizations table), Role ID (required).
5. On submit, the user is created and the table refreshes; a success toast confirms.
6. Admin clicks a table row to open the panel in **view** mode; clicking **Edit** switches to editable form. Email is read-only after creation.
7. Admin clicks **Delete** in view mode, confirms in a dialog, and the user is soft-deleted (deleted_by + deleted_on populated).
8. Deleted users are hidden from the default list view.
9.Add Pagination and filters 

### Wireframes / Mockups

> _Mirrors the Organizations page layout: header with Add button, search + filter bar, paginated table, slide-in panel for view/edit/create, confirmation dialog for delete._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No users exist yet | Empty state with a prompt to add the first user |
| Email already taken | Red inline error shown below the email field on blur and on 409 response |
| No organizations exist | Org code dropdown shows a disabled "No organizations available" option; Add User button remains accessible |
| API error on save | Generic error toast; form stays open with data intact |
| Loading state | Skeleton rows in the table while the first fetch is in progress |

---

## Acceptance Criteria

### Functional

- [ ] Given a valid payload with a unique email, when POST /users is called, then a user row is created and returned with all audit fields populated
- [ ] Given an email that already exists, when the email field loses focus, then an inline red error "This email is already taken" is shown without a page reload
- [ ] Given an existing email submitted via POST, then the API returns 409 and the frontend shows the same inline error
- [ ] Given the create form is open, when the org code dropdown is rendered, then it lists all non-deleted organizations from the organizations table
- [ ] Given a user exists, when PUT /users/{id} is called with changed fields, then updated_by and updated_on are refreshed; email and org_code cannot be changed
- [ ] Given a user is deleted, when DELETE /users/{id} is called, then deleted_by and deleted_on are set and the user no longer appears in the default list
- [ ] Given the user list loads, when paginating or searching, then results are ordered by created_on descending

### Non-Functional

- [ ] Email uniqueness check endpoint responds in under 300 ms under normal load
- [ ] Org code dropdown does not make a new API call on every keystroke — organizations are fetched once on panel open and cached for the session
- [ ] Accessible — form labels are associated with inputs; error messages are announced to screen readers

### Out of Scope for This Release

- [ ] ~~Role validation against a roles table~~
- [ ] ~~Bulk user operations~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Should deleted users be hard-deleted or soft-deleted (deleted_on / deleted_by)? | Adarsh | — | Spec assumes soft-delete; confirm before implementation |
| 2 | What is the shape of `role_id` — a UUID FK to a future roles table, or a free-text string for now? | Adarsh | — |uuid |
| 3 | Should email be editable after creation, or locked like org_code? | Adarsh | — | Spec assumes locked; confirm |
| 4 | Should the Users page be accessible only to certain plans (e.g. team/enterprise)? | Adarsh | — | no


---

## Dependencies

- [ ] Organizations table and `GET /api/organizations` endpoint — must be live (already implemented)
- [ ] `PlanType` enum pattern — reuse for any future `role_id` enum if roles are predefined

---

## Notes & References

- Follows the same patterns as the Organizations CRUD feature (`_specs/organization-crud.md`, `_plans/organization-crud.md`)
- Audit columns (`created_by`, `updated_by`, `deleted_by`) default to `"system"` until auth is introduced
- `org_code` in the users table is a display/grouping reference; the FK relationship to `organizations.id` should be evaluated when the schema is finalised

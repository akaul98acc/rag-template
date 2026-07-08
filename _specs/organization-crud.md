# Feature: Organization CRUD

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **Ticket:** —

> **Architectural note:** Organizations are the future anchor for user routing. When the Users feature is built, each user will belong to an organization, and the organization context (`org_code` / `id`) will drive routing, scoping, and access decisions. The schema and API designed here must remain stable enough to be a FK target for a future `users` table.

---

## Overview

Add a full Create / Read / Update / Delete (CRUD) interface for Organizations. Each organization record captures identity, contact, and audit fields. The feature is accessible as a new "Organizations" section in the app, backed by a dedicated PostgreSQL table and REST API.

---

## Goals

- [ ] Users can create a new organization with all required fields and have it persisted to the database
- [ ] Users can view a paginated list of all organizations and open a detail view for any single record
- [ ] Users can search organizations by name or org code
- [ ] Users can filter the list by plan_selected
- [ ] Users can edit any organization's editable fields and save the changes
- [ ] Users can delete an organization with a confirmation prompt
- [ ] All create/update operations automatically populate audit fields (`created_by`, `created_on`, `updated_by`, `updated_on`)

---

## Non-Goals

- Not implementing role-based access control or per-organization permissions in this iteration
- Not supporting bulk import / export of organizations
- Not adding search or advanced filtering beyond basic list display
- Not integrating organizations with document uploads or recommendations in this iteration
- Not building the Users → Organization link in this iteration (that is the next feature; this feature only establishes the `organizations` table as a stable FK target)

---

## Data Model

Each organization record has the following fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Auto-generated — will be used as FK in the future `users` table |
| `name` | string | Required |
| `org_code` | string | Required, unique |
| `website` | string (URL) | Optional |
| `phone_number` | string | Optional |
| `contact_person` | string | Required — "Contact by person" |
| `plan_selected` | string | Plan/tier the organization is on (e.g. "Basic", "Pro", "Enterprise") — required |
| `created_from` | string | Source / origin of the record (e.g. "Manual", "Import") — captured on create only |
| `created_by` | string | Set automatically from session/user context |
| `created_on` | timestamp | Set automatically on insert |
| `updated_by` | string | Set automatically on update |
| `updated_on` | timestamp | Set automatically on update |

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | App user | Create a new organization with name, org code, website, phone, and contact person | I can track partner or client organizations | P0 |
| 2 | App user | See a list of all organizations | I can find and manage existing records | P0 |
| 3 | App user | Edit an existing organization's details | I can keep information up to date | P0 |
| 4 | App user | Delete an organization | I can remove stale or incorrect records | P1 |
| 5 | App user | See who created or last updated an organization and when | I have an audit trail for changes | P1 |

---

## UX

### User Flow

#### Create
1. User navigates to the "Organizations" page via the sidebar or top navigation.
2. User clicks "Add Organization".
3. A form (modal or dedicated page) opens with fields: Name, Org Code, Website, Phone Number, Contact Person, Plan Selected, Created From.
4. User fills in the form and clicks "Save".
5. System validates required fields, saves the record, and returns the user to the list with a success toast.

#### List / Read
1. User lands on the Organizations page.
2. A table displays all organizations with columns: Name, Org Code, Plan Selected, Contact Person, Created On.
3. Clicking a row opens a read-only detail panel showing all fields including audit fields.

#### Edit
1. From the list or detail view, user clicks "Edit".
2. Editable fields are pre-populated (Name, Org Code, Website, Phone Number, Contact Person, Plan Selected).
3. `created_from`, `created_by`, `created_on` are read-only.
4. User modifies fields and clicks "Save".
5. System saves and shows a success toast; `updated_by` and `updated_on` are refreshed.

#### Delete
1. From the list or detail view, user clicks "Delete".
2. A confirmation dialog appears: "Delete [Org Name]? This cannot be undone."
3. User confirms; record is removed and the list refreshes.

### Wireframes / Mockups

> _To be linked from Figma when available._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No organizations exist | Empty state illustration + "Add Organization" CTA |
| Duplicate `org_code` on create/edit | Inline validation error: "Org code already in use" |
| API error on save | Destructive toast: "Could not save — please try again" |
| API error on delete | Destructive toast: "Could not delete — please try again" |
| Loading state | Skeleton rows in the table while data fetches |
| Required field missing | Inline field-level validation before form submit |

---

## API Design

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/organizations` | List organizations (paginated, with search + filter) |
| POST | `/api/organizations` | Create a new organization |
| GET | `/api/organizations/{id}` | Get a single organization |
| PUT | `/api/organizations/{id}` | Update an organization |
| DELETE | `/api/organizations/{id}` | Delete an organization |

**Query params for GET `/api/organizations`:**

| Param | Type | Default | Purpose |
|-------|------|---------|---------|
| `page` | int | 1 | 1-based page number |
| `page_size` | int | 20 | Records per page (max 100) |
| `search` | string | — | Free-text match on `name` or `org_code` (case-insensitive) |
| `plan` | string | — | Filter by exact `plan_selected` value |

**List response shape:**
```
{ items: Organization[], total: int, page: int, page_size: int }
```

**Request body (POST/PUT):**
```
name, org_code, website?, phone_number?, contact_person, plan_selected, created_from (POST only)
```
Audit fields (`created_by`, `created_on`, `updated_by`, `updated_on`) are set by the server.

---

## Acceptance Criteria

### Functional

- [ ] Given a valid form submission, when the user clicks Save, then a new organization row is persisted to PostgreSQL and appears in the list
- [ ] Given an existing organization, when the user edits and saves, then the record is updated and `updated_on` / `updated_by` are refreshed
- [ ] Given an existing organization, when the user confirms deletion, then the row is removed from the database and the list
- [ ] Given a duplicate `org_code`, when the user submits the form, then the API returns a 409 and the UI shows an inline error
- [ ] Given any create or update, when the record is saved, then `created_from` (on create), `created_by`, `created_on`, `updated_by`, and `updated_on` are populated correctly

### Non-Functional

- [ ] List endpoint responds in under 500 ms for up to 1 000 organizations
- [ ] Form validation runs client-side before any API call
- [ ] Accessible — interactive elements meet WCAG 2.1 AA (keyboard navigable, labelled inputs)
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions)

### Out of Scope for This Release

- [ ] ~~Linking organizations to documents or recommendations~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | What value should populate `created_by` / `updated_by` — a hardcoded user string, a session claim, or something else? | Adarsh | — | |
| 2 | Should `org_code` be editable after creation, or locked once set? | Adarsh | — | **Resolved: locked after creation** — `org_code` is read-only in the edit form |
| 3 | Is the Organizations page a top-level route or nested inside an existing section? | Adarsh | — | **Resolved: top-level route** (`/organizations`) |

---

## Dependencies

- [ ] PostgreSQL table `organizations` — to be created via `_ensure_schema` in `database.py`
- [ ] New FastAPI router `backend/app/api/routes/organizations.py`
- [ ] New React page `frontend/src/pages/Organizations.tsx` + route registration in `App.tsx` (nav link placed next to the existing History tab)

---

## Notes & References

- Follows the same layering convention as existing routes: thin route → service → `database.py`
- Audit fields pattern mirrors `recommendations` table (`created_at`, etc.)
- Frontend form should use existing shadcn/ui form primitives (Input, Label, Button, Dialog)
- `org_code` is locked after creation — display it as a read-only field in the edit form
- The `organizations` table `id` (UUID) must remain a stable FK target; avoid renaming or dropping the column in future migrations
- Organizations page mounts at `/organizations` as a top-level React route in `App.tsx`
- Future: a `users` table will reference `organizations.id` to scope routing and access by organization

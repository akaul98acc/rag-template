# Feature: Component Refactor — Shared Table, Form, and Backend Base Model

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-07-12
> **Last Updated:** 2026-07-12
> **Ticket:** —

---

## Overview

The Organizations, Users, and Roles pages each duplicate their own table, slide-in panel, and form field logic. The backend models similarly repeat the same six audit columns (`created_by`, `created_on`, `updated_by`, `updated_on`, `deleted_by`, `deleted_on`) across every entity. This refactor extracts all repeated code into shared, prop-driven components and a single backend base model — eliminating duplication without changing any user-visible behaviour.

---

## Goals

- [ ] **Shared `DataTable` component** — accepts `columns` (array prop) and `rows` as props; renders headers, skeleton rows, empty state, and pagination bar. Pagination state is owned by the parent page and passed in as controlled props (`page`, `totalPages`, `onPageChange`). All three pages (Organizations, Users, Roles) pass their own column definitions and data.
- [ ] **Shared `SlidePanel` component** — the slide-in overlay (backdrop + drawer shell + close button + title) extracted as a layout wrapper; page-specific field groups are passed as `children`. The panel accepts an optional `deleteModal` slot for the confirmation dialog.
- [ ] **Shared `ConfirmModal` component** — the delete confirmation dialog extracted as a standalone reusable modal accepting `title`, `description`, `confirmLabel`, `onConfirm`, `onCancel`, and optionally an `error` prop for inline 409 messages.
- [ ] **Shared `FieldGroup` and `PanelActionBar` components** — `FieldGroup` (label + error + children) and the edit/view/create mode button bar extracted as standalone components; button bar driven by `mode`, `onSubmit`, `onCancelEdit`, `onClose`, `saving` props.
- [ ] **Custom `useEntityList` hook** — encapsulates debounced search (300 ms), `page` reset on search change, `refreshKey`, and the cancellable fetch effect. Returns `{ items, total, page, setPage, search, setSearch, loading, refresh }`.
- [ ] **Backend `AuditBase` Pydantic model** — in `backend/app/models/base.py`; holds the four non-nullable audit columns (`created_by`, `created_on`, `updated_by`, `updated_on`). A separate `SoftDeleteMixin` adds the nullable `deleted_by`/`deleted_on` columns for entities that support soft-delete (Users, Roles). `OrganizationResponse` inherits `AuditBase` only; `UserResponse` and `RoleResponse` inherit both.
- [ ] **Shared `serialize_row(row, uuid_cols, ts_cols)` helper** — in `backend/app/services/database.py`; replaces `_serialize_user_row` and `_serialize_role_row` with a single parameterised function.
- [ ] **Generic `db_list_entity` helper** — in `backend/app/services/database.py`; accepts table name, searchable column names, extra filter conditions, and SELECT column list; returns the standard `{items, total, page, page_size}` dict. Entity-specific extra filters (e.g. `plan` for organizations, `deleted_on IS NULL` for soft-delete entities) are passed as structured parameters.
- [ ] **Shared `get_or_404` async utility** — in a new `backend/app/api/deps.py`; encapsulates the "call DB getter → raise 404 if None" pattern used in every route handler.
- [ ] Zero regressions — all existing CRUD flows, field validation, and error states continue to work identically.

---

## Non-Goals

- Not changing any API contract (request/response shape, route paths, status codes).
- Not redesigning the UI or altering any visible layout, colours, or interaction patterns.
- Not introducing a new state management library or global store.
- Not adding new features to the CRUD pages (filtering, sorting, bulk actions, etc.).
- Not refactoring the Step 1 / Step 2 / History pages in this iteration.
- Not extending `DataTable` to Step 1, Step 2, or History pages in this iteration.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Developer | A single `DataTable` component configured via a `columns` array prop | I don't have to copy-paste table markup for each new entity page | P0 |
| 2 | Developer | A single `SlidePanel` shell with `children` for fields and a `deleteModal` slot | Open/close, backdrop, and button-bar logic live in one place | P0 |
| 3 | Developer | A shared `ConfirmModal` with `title`, `description`, `onConfirm`, `onCancel`, `error` props | All delete confirmations look and behave consistently | P0 |
| 4 | Developer | A `useEntityList` hook | Debounce + pagination + refresh logic is written and tested once | P0 |
| 5 | Developer | A backend `AuditBase` + `SoftDeleteMixin` model | Audit field definitions live in one place and are inherited | P0 |
| 6 | Developer | A shared `serialize_row` helper and `db_list_entity` function | Row serialisation and pagination query construction are not repeated per entity | P1 |
| 7 | Developer | A `get_or_404` utility | Route handlers are concise and don't repeat the fetch-then-404 guard | P1 |

---

## UX

### User Flow

No user-visible behaviour changes. All existing flows remain identical:

1. User navigates to Organizations / Users / Roles page — table renders as before.
2. User clicks a row — slide-in panel opens in view mode as before.
3. User clicks Edit — form becomes editable; Update and Cancel buttons appear as before.
4. User submits — save logic runs; panel reverts to view or closes as before.
5. User clicks Delete — `ConfirmModal` appears; confirming deletes and refreshes as before.

### Wireframes / Mockups

> _No UI changes. Existing layouts are preserved exactly._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No rows returned | `DataTable` renders the empty-state message passed via `emptyMessage` prop |
| API fetch error | Error toast shown; table body stays empty — same as today |
| Loading state | `DataTable` renders N skeleton rows (count set via `skeletonRows` prop, default 5) |
| Saving in progress | `PanelActionBar` shows "Saving…" / "Updating…" — same as today |
| Delete blocked (409) | `ConfirmModal` receives `error` prop and shows inline message — same as today |

---

## Acceptance Criteria

### Functional

- [ ] Given any of the three entity pages load, when data arrives, then the `DataTable` renders the correct columns and rows using the `columns` array passed by the parent.
- [ ] Given a row is clicked, when the `SlidePanel` opens, then the correct entity-specific fields are rendered as children inside the shared panel shell.
- [ ] Given the panel is in edit mode, when Update is clicked, then only that entity's update API is called — no cross-entity side effects.
- [ ] Given the panel is in create mode, when Save is clicked, then the correct create API is called and the table refreshes via `refresh()` from `useEntityList`.
- [ ] Given a user triggers delete, when the `ConfirmModal` is open and the API returns 409, then the `error` message is shown inside the modal without closing it.
- [ ] Given any entity response model is serialised, then all four `AuditBase` fields are present; soft-delete entities also include `deleted_by` and `deleted_on` from `SoftDeleteMixin`.
- [ ] Given `serialize_row` is called with a psycopg2 row dict, then all UUID and datetime fields are converted to strings with no data loss.
- [ ] Given `db_list_entity` is called with valid parameters, then it returns `{items, total, page, page_size}` with correct pagination and search applied.

### Non-Functional

- [ ] `npm run typecheck` passes with zero errors after the refactor.
- [ ] No new `any` types introduced in TypeScript.
- [ ] `DataTable` is generic (`DataTable<T>`) so column `render` functions are fully type-safe.
- [ ] Python import of all route and model modules succeeds with no errors.
- [ ] Shared React components live in `frontend/src/components/shared/`.
- [ ] Backend shared utilities live in `backend/app/models/base.py` and `backend/app/api/deps.py`.

### Out of Scope for This Release

- [ ] ~~Unit tests for the shared components~~
- [ ] ~~Storybook / component documentation~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Should `DataTable` own its own pagination state, or receive `page`, `totalPages`, `onPageChange` as props (controlled)? | Adarsh | — | **Controlled** — pagination state lives in the parent page (via `useEntityList`) and is passed as props. |
| 2 | Should `SlidePanel` accept a `deleteModal` slot prop, or should the delete confirmation modal remain fully owned by each page? | Adarsh | — | **Slot prop** — `SlidePanel` accepts `deleteModal` slot; delete modal is a shared `ConfirmModal` component. |
| 3 | Should `DataTable` be designed with Step 1 / Step 2 / History in mind? | Adarsh | — | **No** — columns are passed as a separate array prop; Step 1/2/History not in scope for this iteration. |
| 4 | Could a generic `db_list_entity` helper reduce the three paginated list functions? | Adarsh | — | **Yes** — implement `db_list_entity` with table name, searchable columns, extra filters, and SELECT columns as parameters. |
| 5 | A single `serialize_row(row, uuid_cols, ts_cols)` to replace `_serialize_user_row` and `_serialize_role_row`? | Adarsh | — | **Yes** — implement shared `serialize_row`. |
| 6 | A `get_or_404` async utility for the repeated fetch → 404 → guard pattern? | Adarsh | — | **Yes** — implement in `backend/app/api/deps.py`. |
| 7 | Extract debounced-search + `refreshKey` + page-reset into `useEntityList` hook? | Adarsh | — | **Yes** — implement `useEntityList` returning `{ items, total, page, setPage, search, setSearch, loading, refresh }`. |
| 8 | What should each column definition in the `columns` array look like? | Adarsh | — | **`{ key, label, render?, className? }`** — no additional properties needed for this iteration. |
| 9 | Should `AuditBase` hold all 6 columns with `deleted_by`/`deleted_on` as optional, or use a `SoftDeleteMixin`? | Adarsh | — | **`AuditBase` (4 columns) + `SoftDeleteMixin` (2 columns)** — Orgs inherit `AuditBase` only; Users and Roles inherit both. Keeps the type contract strict. |
| 10 | Should `PanelActionBar` hardcode the three-mode enum or accept fully prop-driven button definitions? | Adarsh | — | **Fully prop-driven** — button definitions passed as props for maximum flexibility across future entities. |
| 11 | Should extra filters in `db_list_entity` be raw SQL fragments or structured `FilterSpec` objects? | Adarsh | — | **List of `(sql_fragment, params)` tuples** — flexible enough to handle `plan = %s`, `deleted_on IS NULL`, and any future condition. |

---

## Dependencies

- [ ] Roles CRUD (PR #20) must be merged before this refactor begins — `Roles.tsx` must exist to be refactored.
- [ ] No external library additions required.

---

## Notes & References

- Current duplication inventory:
  - **Frontend:** `FieldGroup` defined identically in all three page files; table + skeleton markup duplicated; slide-in panel shell (backdrop + drawer + close button) duplicated; debounced-search + `refreshKey` + page-reset pattern duplicated.
  - **Backend:** six audit columns repeated in every `_ensure_schema()` DDL block; `_serialize_user_row` and `_serialize_role_row` differ only in UUID column names; `WHERE deleted_on IS NULL` guard repeated in every soft-delete list/get; `fetch → 404 → guard → DB call` pattern repeated in every route handler.
- Shared React components: `frontend/src/components/shared/DataTable.tsx`, `SlidePanel.tsx`, `ConfirmModal.tsx`, `FieldGroup.tsx`, `PanelActionBar.tsx`.
- Custom hook: `frontend/src/hooks/useEntityList.ts`.
- Backend base model: `backend/app/models/base.py` — `AuditBase`, `SoftDeleteMixin`.
- Backend deps: `backend/app/api/deps.py` — `get_or_404`.
- This refactor is a pure mechanical extraction — no logic changes, no new features.

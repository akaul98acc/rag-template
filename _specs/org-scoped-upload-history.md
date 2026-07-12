# Feature: Org-Scoped Upload History with Role-Based Visibility

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-07-13  
> **Last Updated:** 2026-07-13  
> **Ticket:** —

---

## Overview

File uploads are currently global — any authenticated user can see every document in the History tab. This feature scopes uploads to the uploader's organisation and restricts History visibility by role: Admin-role users see all files uploaded by anyone in their org; non-Admin users see only their own uploads.

---

## Goals

- [ ] Attach `org_id` and `uploaded_by` (user_id) to every new upload persisted in the `documents` table
- [ ] History API returns only documents belonging to the caller's organisation
- [ ] Within that org, Admin-role users see all documents; non-Admin users see only their own
- [ ] History tab in the frontend reflects this filtered view with no extra UI config needed

---

## Non-Goals

- Not supporting cross-org document sharing
- Not introducing a custom permission system beyond the existing Admin vs. non-Admin role split
- Not back-filling `org_id` / `uploaded_by` on documents uploaded before this feature ships (those rows may not appear in any History view)
- Not changing the upload flow's UI — ownership is captured transparently from the JWT claims

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Admin (e.g. Adarsh, org = ACC) | See all documents uploaded by anyone in my org | I have full visibility for governance and support | P0 |
| 2 | Non-Admin user (e.g. Adam, org = ACC) | See only the documents I personally uploaded | My work is private from peers | P0 |
| 3 | Any authenticated user | Never see documents from a different org | Org data stays isolated | P0 |
| 4 | Backend | Capture uploader identity on every POST /upload | Ownership is auditable without extra steps | P0 |

---

## UX

### User Flow

1. User logs in — JWT carries `user_id`, `org_id`, `org_code`, and `role`
2. User uploads a document via Phase 1 — the backend records `org_id` and `uploaded_by` from the token
3. User navigates to the History tab
4. Frontend calls `GET /api/history` — backend filters results based on the caller's role and org
5. Admin sees all rows from their org, with an "Uploaded by" column showing the uploader's email
6. Non-Admin sees only rows where `uploaded_by` matches their own `user_id`

### Wireframes / Mockups

> _No design changes to the upload flow. History table gains an "Uploaded by" column visible to Admins._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| User has never uploaded any files | History tab shows empty state ("No uploads yet") |
| Admin's org has no uploads | Same empty state |
| Document row has no `uploaded_by` (legacy row) | Row is hidden from non-Admins; Admin may still see it |
| JWT missing `org_id` claim | `GET /api/history` returns 401 |
| User's role is not recognised | Treated as non-Admin — sees own uploads only |

---

## Acceptance Criteria

### Functional

- [ ] Given a POST /upload request with a valid JWT, when the upload succeeds, then `org_id` and `uploaded_by` (user_id) are persisted on the `documents` row
- [ ] Given an Admin user calls GET /api/history, when the response is returned, then it contains all documents where `org_id` matches the caller's org
- [ ] Given a non-Admin user calls GET /api/history, when the response is returned, then it contains only documents where `uploaded_by` matches the caller's `user_id`
- [ ] Given a user from org A, when they call GET /api/history, then they never receive documents belonging to org B
- [ ] Given an Admin user views the History tab, when the table renders, then an "Uploaded by" column shows the uploader's email address for each row
- [ ] Given a non-Admin user views the History tab, when the table renders, then no "Uploaded by" column is shown (all rows are their own)

### Non-Functional

- [ ] History endpoint response time is not significantly degraded (index on `org_id` added)
- [ ] No breaking change to existing History tab functionality for single-org scenarios

### Out of Scope for This Release

- [ ] ~~Paginated History results~~
- [ ] ~~Admin ability to filter by specific uploader within the org~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Which roles besides "Admin" should have full org-wide visibility? Only "Admin", or also "Manager"? | Adarsh | Before implementation | Admins|
| 2 | Should legacy documents (no `org_id`) be visible to Admins of any org, or hidden entirely? | Adarsh | Before implementation | No Need will be trunkint the data|

---

## Dependencies

- [ ] JWT authentication merged to `main` — `uploaded_by` and `org_id` are read from the bearer token on every request
- [ ] `roles` table seeded with `Admin` as the privileged role name

---

## Notes & References

- JWT claims shape: `{ user_id, email, org_id, org_code, role }` — `role` is the role **name** string (e.g. `"Admin"`)
- The `documents` table currently has: `doc_id`, `filename`, `metadata JSONB`, `created_at`; needs two new columns: `org_id UUID` and `uploaded_by UUID`
- History is fetched via `GET /api/history` — currently returns all documents with their recommendations joined

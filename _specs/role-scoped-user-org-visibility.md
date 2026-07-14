# Feature: Role-Scoped User and Organization Visibility

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-07-13  
> **Last Updated:** 2026-07-13  
> **Ticket:** —

---

## Overview

Admins should only see users that belong to their own organization, while Super Admins retain full cross-organization visibility. The Organizations tab should be hidden from Admins and only accessible to Super Admins. This introduces role-based scoping to the Users and Organizations management pages without altering the underlying data model.

---

## Goals

- [ ] Admins see only users belonging to their own organization on the Users tab
- [ ] Super Admins see all users across all organizations on the Users tab
- [ ] The Organizations tab is hidden from Admins and visible only to Super Admins
- [ ] Scoping logic is driven by parameters/configuration rather than scattered if/else branches

---

## Non-Goals

- Not implementing full authentication or session management
- Not changing the underlying data model or database schema
- Not adding per-user permission overrides beyond the two roles (Admin, Super Admin)
- Not scoping other tabs (RAG phases, History) in this iteration

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Admin | To see only users in my organization | I don't accidentally manage users from other tenants | P0 |
| 2 | Super Admin | To see all users across every organization | I can manage the full user base centrally | P0 |
| 3 | Super Admin | Access to the Organizations tab | I can create, edit, and delete organizations | P0 |
| 4 | Admin | The Organizations tab not to appear in my navigation | I don't have access to tenant management I shouldn't control | P1 |

---

## UX

### User Flow

**Admin flow:**
1. Admin user arrives at the Users tab
2. The user list is pre-filtered to show only users whose organization matches the Admin's own organization
3. Search and pagination operate within that filtered scope
4. The Organizations tab is not rendered in the sidebar/navigation

**Super Admin flow:**
1. Super Admin arrives at the Users tab
2. All users from all organizations are listed (current behavior)
3. Super Admin sees the Organizations tab and can navigate to it normally

### Wireframes / Mockups

> _No visual changes to the Users or Organizations page layouts — only data scoping and tab visibility change._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| Admin's organization has no other users | Empty state with "No users found in your organization" |
| Admin attempts to navigate to `/organizations` directly | Redirect or show an unauthorized message |
| Super Admin with no organizations in the system | Existing empty state on Organizations tab |
| Loading state | Existing skeleton rows shown during fetch |
| Role is unknown or missing | Default to most restrictive scope (Admin-level) |

---

## Acceptance Criteria

### Functional

- [ ] Given a logged-in Admin, when the Users tab loads, then only users from the Admin's organization are returned and displayed
- [ ] Given a logged-in Super Admin, when the Users tab loads, then users from all organizations are returned and displayed
- [ ] Given a logged-in Admin, when the navigation renders, then the Organizations tab link is not present
- [ ] Given a logged-in Super Admin, when the navigation renders, then the Organizations tab link is present and functional
- [ ] Given an Admin, when they search or paginate the Users list, then results remain scoped to their organization
- [ ] Given the scoping logic, when role changes from Admin to Super Admin, then no code paths require new if/else branches — scoping is driven by parameters

### Non-Functional

- [ ] Response time under 500ms for filtered user list for 95% of requests
- [ ] Accessible — tab visibility controlled via conditional render, not CSS `display:none`
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions)
- [ ] Mobile responsive at 375px and above

### Out of Scope for This Release

- [ ] ~~Per-user permission overrides~~
- [ ] ~~Scoping the History or RAG phase tabs~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | How is the current user's role determined without auth? Hardcoded actor or a new session concept? | Adarsh | — | New session|
| 2 | Should the `org_id` scope filter happen on the backend (API query param) or frontend filter? | Adarsh | — |Backend |
| 3 | What happens when a user has no `org_id` — are they treated as Super Admin or blocked? | Adarsh | — |Blocked |

---

## Dependencies

- [ ] Role concept must be resolvable from current session/context — _Owner: TBD / ETA: before implementation_
- [ ] Backend `/api/users` must accept an optional `org_id` filter param — _Owner: Backend / ETA: same sprint_

---

## Notes & References

- Current Users page: `frontend/src/pages/Users.tsx`
- Current Organizations page: `frontend/src/pages/Organizations.tsx`
- Navigation/sidebar: inspect `frontend/src/` for tab routing component
- Roles seeded at startup: `Admin`, `Manager`, `User`, `Viewer` — Super Admin may need to be added or mapped
- Prior PR: org-scoped upload history (#23) established the org-scoping pattern to follow


# Feature: OTP-Based JWT Authentication

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-07-12  
> **Last Updated:** 2026-07-12  
> **Ticket:** —

---

## Overview

Add a full authentication layer to the RAG Builder application using a two-step login flow: the user first identifies themselves with their email and organisation code, then receives a one-time password (OTP) via SMS to their registered phone number. On successful OTP verification, the server issues a signed JWT containing the user's role name, gating all subsequent API access.

---

## Goals

- [ ] Create an `otps` database table to store generated OTPs with a 10-minute expiry.
- [ ] Build a two-step login UI: email + org code entry, followed by an OTP entry screen.
- [ ] Implement backend endpoints for initiating login (validate email/org code, send OTP) and verifying OTP (issue JWT).
- [ ] Embed the user's role name (not role ID) in the JWT claims.
- [ ] Protect all existing API routes behind JWT authentication middleware.

---

## Non-Goals

- Not implementing self-service registration or password reset in this iteration.
- Not adding per-route role-based authorisation rules — authentication only.
- Not supporting email-based OTP delivery (SMS to registered phone number only).
- Not building a refresh-token flow — a single short-lived JWT is sufficient for now.
- Not adding multi-factor fallback or backup codes.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Registered user | Enter email + org code and receive an OTP on my phone | I can securely identify myself without a password | P0 |
| 2 | Registered user | Enter the 6-digit OTP and be redirected to the app | I can access the application after verifying my identity | P0 |
| 3 | Registered user | See a clear error if my email or org code is wrong | I understand why the login attempt failed | P0 |
| 4 | Registered user | See a clear error if my OTP is expired or incorrect | I know to request a new one | P0 |
| 5 | System | Store OTPs with an expiry enforced at verification time | Replayed or stale codes are rejected | P0 |

---

## UX

### User Flow

1. User navigates to the app root; if no valid JWT is present they are redirected to `/login`.
2. User sees Step 1 — an email field and an org code field with a "Send OTP" button.
3. User submits; the system validates the email + org code match a non-deleted user in the correct organisation.
4. On success, a 6-digit OTP is generated, stored in `otps`, and sent via SMS to the user's registered phone number. The UI advances to Step 2.
5. User sees Step 2 — a 6-digit OTP input field and a "Verify" button, plus a "Resend OTP" option.
6. User submits the OTP; the server validates it is correct, not expired, and not already used.
7. On success, the server returns a JWT; the frontend stores it and redirects to the main app.
8. On failure (wrong OTP, expired), the user sees an inline error and may resend.

### Wireframes / Mockups

> _To be provided. Two-card layout: Step 1 (Email + Org Code) and Step 2 (OTP entry), centred on a minimal login page matching the existing Tailwind/shadcn theme._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| Email exists but org code does not match | Generic error: "Email or organisation code is incorrect" (no enumeration) |
| User account is soft-deleted | Treated as not found — same generic error |
| OTP has expired (> 10 min) | Error: "This code has expired. Please request a new one." |
| OTP is incorrect | Error: "Incorrect code. Please try again." |
| User requests resend while a valid OTP exists | Previous OTP is invalidated; a new one is generated and sent |
| SMS delivery fails | Backend returns 502; UI shows "Could not send OTP — please try again" |
| JWT is missing or invalid on a protected route | Backend returns 401; frontend redirects to `/login` |
| JWT has expired | Same 401 handling as missing token |

---

## Acceptance Criteria

### Functional

- [ ] Given a valid email + org code, when the user submits Step 1, then a 6-digit OTP is stored in `otps` and sent to the user's registered phone number within 5 seconds.
- [ ] Given the correct OTP submitted within 10 minutes, when the user submits Step 2, then the server responds with a JWT and the frontend redirects to the main app.
- [ ] Given an expired OTP (created > 10 minutes ago), when the user submits it, then the server returns a 400 error with an expiry message.
- [ ] Given a wrong OTP, when the user submits it, then the server returns a 400 error with an invalid-code message.
- [ ] Given a mismatched email or org code, when the user submits Step 1, then the server returns a 401 with a generic message (no detail about which field failed).
- [ ] Given a successful login, the JWT payload contains `user_id`, `email`, `org_id`, `org_code`, and `role` (role name string, e.g. `"Admin"`).
- [ ] Given a request to any `/api/*` route without a valid JWT, then the server returns 401.
- [ ] Given a resend request, the previous unused OTP for that user is invalidated before a new one is issued.

### Non-Functional

- [ ] OTP generation uses a cryptographically secure random number source.
- [ ] OTPs are stored hashed (bcrypt or SHA-256) — the plaintext is never persisted.
- [ ] JWT secret is loaded from an environment variable; the app fails to start if it is absent.
- [ ] JWT expiry is configurable via env var (default: 60 minutes).
- [ ] Login page is accessible — form fields have labels, errors are announced, meets WCAG 2.1 AA.
- [ ] Login page is responsive at 375 px and above.

### Out of Scope for This Release

- [ ] ~~Role-based access control on individual routes~~
- [ ] ~~Refresh token endpoint~~
- [ ] ~~Account lockout after N failed attempts~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Which SMS gateway should be used (Twilio, Azure Communication Services, other)? | Adarsh Kaul | — | Keep azure communication Service commented|
| 2 | Should the JWT expiry be 60 minutes or session-length? | Adarsh Kaul | — | 60|
| 3 | Should we invalidate the OTP after first successful use, or rely solely on expiry? | Adarsh Kaul | — | Recommended: invalidate on first use |
| 4 | Is `/login` a separate page route or a modal overlay? | Adarsh Kaul | — | Seprate page|

---

## Dependencies

- [ ] SMS gateway credentials configured in `backend/.env` — _Owner: Adarsh Kaul_
- [ ] `JWT_SECRET` and `JWT_EXPIRY_MINUTES` env vars added to `backend/.env.example` — _Owner: backend implementer_
- [ ] `users` table already has `phone_number` column populated for target users — _Owner: Adarsh Kaul_

---

## Notes & References

- Existing roles reference data is seeded in `database.py` (`_ROLES_FALLBACK`): `Admin`, `Manager`, `User`, `Viewer`. JWT `role` claim must use these name strings.
- Current app has no auth; the `created_by` / `updated_by` / `deleted_by` fields are hardcoded to `"system"` — these can be wired to the JWT subject after this feature ships.
- OTP table schema: `id UUID PK`, `otp_hash TEXT`, `created_at TIMESTAMPTZ`, `sent_at TIMESTAMPTZ`, `phone_number TEXT`, `user_id UUID FK → users`, `used_at TIMESTAMPTZ` (nullable — set on successful verification).
- Related spec: none yet. Related tables: `users`, `roles`, `organizations`.

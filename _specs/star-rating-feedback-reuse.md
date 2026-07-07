# Feature: Star Rating Feedback with Recommendation Reuse

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-07-07  
> **Last Updated:** 2026-07-07 (simplified)  
> **Ticket:** —

---

## Overview

Users can rate recommendations using a 1–5 star widget in both phases: the Agent's Decision tab (Phase 1 — chunking strategy, embedding model, search method) and the Provider Comparator tab (Phase 2 — storage, document extraction, embedding, vector search providers). Ratings are stored via the existing `/api/feedback` endpoint.

On upload, before calling the LLM, the backend checks whether a prior 4–5-star-rated recommendation exists for a document with a matching `doc_type`, `language`, and size bucket. If one is found, it is offered as the starting recommendation instead of triggering a fresh LLM call, saving time. The Agent's Decision detail section gains a **Source** field (`LLM`, `Rules`, or `Past Recommendations`) so the user always knows how the recommendation was produced.

---

## Goals

- [ ] Render a 1–5 star rating control in the Agent's Decision tab (Phase 1) after a Phase 1 recommendation is shown.
- [ ] Render a 1–5 star rating control in the Provider Comparator tab (Phase 2) after a Phase 2 provider recommendation is shown.
- [ ] Submit the rating to `/api/feedback` on selection, tagged with which phase it belongs to.
- [ ] Store every rating in the database regardless of score.
- [ ] On upload, before calling the LLM, check history for a prior 4–5-star Phase 1 recommendation where `doc_type` + `language` + size bucket match the incoming document.
- [ ] If a match is found for Phase 1, use it as the starting recommendation and skip the LLM call; show a "From a similar document" banner.
- [ ] Apply the same proactive reuse check for Phase 2 provider selections when a Phase 2 rating has been stored for a matching document.
- [ ] Display a **Source** field in the Agent's Decision details: `LLM`, `Rules`, or `Past Recommendations`.
- [ ] Allow the user to discard the reused recommendation and trigger a fresh LLM call instead.

---

## Non-Goals

- Not computing fuzzy similarity scores or displaying confidence percentages — matching is exact on `doc_type` + `language` + size bucket.
- Not replacing the LLM/rules pipeline permanently — reuse is a suggestion the user can override.
- Not supporting fractional star ratings (e.g. 4.5 stars).
- Not sending email or push notifications based on ratings.
- Not exposing aggregate rating analytics in this iteration.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | End user | Rate the Phase 1 pipeline recommendation on a 1–5 star scale | I can signal how useful the chunking/embedding strategy was | P0 |
| 2 | End user | Rate the Phase 2 provider recommendation on a 1–5 star scale | I can signal how relevant the provider selections were | P0 |
| 3 | End user | See my rating persisted and reflected visually in both phases | I have confidence my feedback was recorded | P0 |
| 4 | End user | Have a highly-rated past recommendation pre-filled for similar documents on upload | I skip waiting for the LLM when a good recommendation already exists | P1 |
| 5 | End user | Know when a recommendation came from history vs the LLM vs rules | I can decide whether to trust it or regenerate | P1 |
| 6 | End user | Discard a reused recommendation and get a fresh one | I retain full control if the reused result doesn't fit | P1 |
| 7 | End user | Still tweak any recommendation before generating code | I retain full control of pipeline parameters | P0 |

---

## UX

### User Flow

**On upload — proactive reuse check**

1. User uploads a document.
2. Backend checks history for a prior recommendation rated 4–5 stars where `doc_type` + `language` + size bucket match.
   - **Match found (Phase 1):** the Agent's Decision tab shows the matched Phase 1 recommendation with Source = `Past Recommendations` and a banner: "Using a recommendation from a similar document. Regenerate if needed."
   - **Match found (Phase 2):** the Provider Comparator tab pre-fills provider selections from the matched Phase 2 result, same banner pattern.
   - **No match:** LLM/rules runs as normal; Source = `LLM` or `Rules`.
3. User can click "Regenerate" in the banner to discard the reused result and trigger a fresh LLM call.

**Rating — after viewing a recommendation**

1. A 1–5 star row is shown below the recommendation in both the Agent's Decision tab and the Provider Comparator tab.
2. User clicks a star — stars 1 through N fill.
3. Rating is submitted to `/api/feedback` with `{ recommendation_id, rating, phase }`; a brief toast confirms ("Thanks for your feedback!").
4. If the `/api/feedback` call fails, the toast shows an error and the star control reverts to unrated.
5. The rating is stored and will influence reuse for future uploads of similar documents.

### Wireframes / Mockups

> _To be linked from Figma — Agent's Decision tab and Provider Comparator tab, below respective recommendation cards_

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No prior 4–5-star match on upload | LLM/rules runs normally; no banner shown |
| Multiple matching past recommendations | Use the most recent 4–5-star match |
| User clicks "Regenerate" on a reused recommendation | LLM call is triggered; Source updates to `LLM` or `Rules`; banner disappears |
| User changes rating after submitting | New rating submitted as an additional record; latest star state shown |
| `/api/feedback` call fails | Toast error shown; star control reverts to unrated |
| Reused recommendation has a missing field | Fall back to fresh LLM/rules call; log a warning |
| User re-uploads the same document | Reuse check runs again; rating widget resets to unrated |

---

## Acceptance Criteria

### Functional

- [ ] Given a Phase 1 recommendation is displayed, when the Agent's Decision tab is active, then a 1–5 star rating control is visible below the recommendation.
- [ ] Given a Phase 2 provider recommendation is displayed, when the Provider Comparator tab is active, then a 1–5 star rating control is visible below the provider selections.
- [ ] Given the user clicks a star, when the click is registered, then stars 1–N fill and a POST is made to `/api/feedback` with `{ recommendation_id, rating, phase }`.
- [ ] Given the Agent's Decision detail section is visible, then a Source field is always shown: `LLM`, `Rules`, or `Past Recommendations`.
- [ ] Given a document is uploaded and a prior 4–5-star Phase 1 recommendation exists for a matching `doc_type` + `language` + size bucket, then the matched recommendation is shown with Source = `Past Recommendations` and the "from a similar document" banner — without calling the LLM.
- [ ] Given a document is uploaded and a prior 4–5-star Phase 2 recommendation exists for a matching profile, then provider selections are pre-filled from history with the same banner.
- [ ] Given the user clicks "Regenerate", when the fresh LLM call completes, then the recommendation updates, Source reflects `LLM` or `Rules`, and the banner is removed.
- [ ] Given no matching prior recommendation is found on upload, then the LLM/rules pipeline runs as normal with no banner.
- [ ] Given the `/api/feedback` call fails, when the error is returned, then a toast error is shown and the star control reverts to its previous state.

### Non-Functional

- [ ] The rating submission round-trip completes in under 500 ms for the p95 case.
- [ ] The history lookup on upload adds no more than 200 ms to the upload response time.
- [ ] Star control is keyboard accessible (arrow keys, Enter to confirm) — WCAG 2.1 AA.
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions).
- [ ] Mobile responsive at 375px and above — stars are tap-target sized (≥44px).

### Out of Scope for This Release

- [ ] ~~Fuzzy similarity scoring or confidence percentage display~~
- [ ] ~~Aggregate rating dashboard or analytics~~
- [ ] ~~Rating-based retraining or fine-tuning of the LLM~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | What metadata fields define "similar"? | Backend / Adarsh | — | Exact match on `doc_type` + `language` + size bucket (small / medium / large derived from `page_count`) |
| 2 | Should the reuse check run as part of the upload response or as a separate call after upload? | Backend | — | |
| 3 | Should a reused recommendation be re-persisted as a new row? | Backend | — | Yes — persisted as a new row linked to the current `doc_id` so it can itself be rated |
| 4 | Is there a minimum number of prior 4–5-star recommendations required before reuse is enabled? | Product | — | No minimum |

---

## Dependencies

- [ ] `/api/feedback` endpoint extended to accept `rating` (int 1–5) and `phase` (int 1 or 2) — _Backend_
- [ ] `recommendation_feedback` table extended to store `rating` and `phase` columns — _Backend_
- [ ] Upload flow (`/api/upload` or `/api/recommend`) extended to run the history lookup before calling the LLM — _Backend_
- [ ] `GET /api/history` or a lightweight query used server-side to find matching rated recommendations — _Backend_
- [ ] Agent's Decision detail section updated to display a `Source` field (`LLM` | `Rules` | `Past Recommendations`) — _Frontend_
- [ ] "Regenerate" action wired in the frontend to re-call `/api/recommend` and clear the reuse banner — _Frontend_
- [ ] shadcn/ui does not ship a star rating component — a custom or third-party accessible star control is needed — _Frontend_

---

## Notes & References

- Existing feedback persistence: `backend/app/services/recommendation_store.py` and `POST /api/feedback`
- History data: `GET /api/history` returns past uploads + recommendations from PostgreSQL
- Phase 2 provider recommendation stored in `provider_recommendation JSONB` column on the `recommendations` table
- Source field maps to: `LLM` → Azure OpenAI path in `pipeline_recommender.py`; `Rules` → `strategy_agent.py` fallback; `Past Recommendations` → history lookup hit
- Size bucket derivation: small (< 10 pages), medium (10–50 pages), large (> 50 pages) — aligns with existing `_tiny`/`_medium`/`_large` rules in `strategy_agent.py`

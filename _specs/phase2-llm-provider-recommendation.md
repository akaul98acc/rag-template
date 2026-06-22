# Feature: Phase 2 LLM Provider Recommendation

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-06-19  
> **Last Updated:** 2026-06-19  
> **Ticket:** [TBD]

---

## Overview

Extend Phase 2 so that, after a document is uploaded and its metadata is known, an LLM (the same GPT-4o-mini model already used in Phase 1) automatically suggests the best provider for each pipeline stage — storage, document extraction, embedding, and vector search — from the existing catalog. The user sees these recommendations as pre-selected cards with a "recommended" badge, can override any choice, and then generates code as normal.

---

## Goals

- [ ] After a document is uploaded in Phase 1, carry the document metadata into Phase 2 and use it to drive provider recommendations.
- [ ] Call the existing LLM (GPT-4o-mini) with the document metadata and the full provider catalog to produce one recommended provider per stage.
- [ ] Pre-select the recommended provider on each stage's option card grid with a visible "recommended" badge, mirroring Phase 1's recommendation UX.
- [ ] Also surface recommended `chunk_size`, `overlap`, and `top_k` values from the LLM response and pre-fill the parameter sliders/inputs in Phase 2.
- [ ] Allow the user to override any recommendation before generating code.

---

## Non-Goals

- Not changing the existing provider catalog or adding new providers in this iteration.
- Not running the LLM recommendation in Phase 2 if no document has been uploaded (Phase 2 can still be used standalone with manual selection).
- Not persisting recommendations beyond the current session.
- Not replacing the Phase 1 strategy agent — this is an additive Phase 2 feature.
- Not surfacing recommendation confidence scores to the user in this iteration.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | RAG pipeline builder | Phase 2 pre-selects the best provider for each stage based on my document | I don't have to manually research which service fits my use case | P0 |
| 2 | RAG pipeline builder | See a clear "recommended" badge on the suggested provider cards | I know which choices are agent-driven vs. my own overrides | P0 |
| 3 | RAG pipeline builder | Override any recommended provider with a single click | I retain full control over the final pipeline | P0 |
| 4 | RAG pipeline builder | Have chunk size, overlap, and top-k pre-filled from the recommendation | I don't have to re-tune parameters I already got from Phase 1 | P1 |
| 5 | RAG pipeline builder | Use Phase 2 without a prior upload | I can still build pipelines for documents I haven't uploaded yet | P1 |

---

## UX

### User Flow

1. User completes Phase 1 (uploads document, receives strategy recommendation).
2. User navigates to Phase 2.
3. If document metadata is available from Phase 1, Phase 2 automatically triggers a provider recommendation call in the background.
4. A loading indicator appears on the Configure tab while the recommendation is in flight.
5. Once the response arrives, one provider per stage is pre-selected and marked with a "recommended" badge. Parameter inputs (chunk size, overlap, top-k) are pre-filled.
6. User reviews the pre-selected providers across all four stage grids and may click any card to override a selection.
7. User clicks "Generate Code" or "Generate Notebook" — the flow continues unchanged.
8. If no document has been uploaded, Phase 2 loads with all cards unselected (current behaviour).

### Wireframes / Mockups

> _Link or embed mockups here._ The "recommended" badge on provider cards should match the existing badge variant already used in Phase 1's embedding/LLM option cards. A single subtle banner at the top of the Configure tab can read "Recommendations based on your uploaded document" with a dismiss option.

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No document uploaded in Phase 1 | Phase 2 loads with no pre-selections; no recommendation call is made |
| LLM returns an unknown provider ID | Fall back to no pre-selection for that stage; other stages still apply |
| LLM call fails or times out | Show a dismissable inline warning; Phase 2 remains fully usable with manual selection |
| User navigates back to Phase 1 and re-uploads a different document | Phase 2 recommendation is invalidated and re-fetched on next visit |
| Loading state | Configure tab shows a skeleton or spinner; stage grids are not interactive until recommendation resolves |

---

## Acceptance Criteria

### Functional

- [ ] Given a document was uploaded in Phase 1, when the user opens Phase 2, then one provider per stage is pre-selected within 5 seconds.
- [ ] Given a recommendation is shown, when the user inspects each stage grid, then exactly one card carries a "recommended" badge matching the LLM's choice.
- [ ] Given a recommendation is shown, when the user clicks a different card in any stage, then that card becomes selected and the "recommended" badge remains on the originally recommended card (as a hint, not a lock).
- [ ] Given a recommendation is shown, when the user clicks "Generate Code", then the generated code uses the user's final selections (overrides respected, not the original recommendations).
- [ ] Given the LLM call fails, when the user views Phase 2, then an inline error message is shown and all stage grids are interactive with no pre-selections.
- [ ] Given no document was uploaded, when the user opens Phase 2, then no recommendation call is made and behaviour is identical to the current baseline.

### Non-Functional

- [ ] Recommendation call completes within 5 seconds for 95% of requests under normal load.
- [ ] Accessible — recommended badges have descriptive `aria-label`; loading states announced to screen readers.
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions).
- [ ] Mobile responsive at 375px and above.

### Out of Scope for This Release

- [ ] ~~Confidence score display on provider cards~~
- [ ] ~~Persisting recommendations across sessions~~
- [ ] ~~Triggering a fresh recommendation when the user changes a parameter slider~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Should the recommendation call be triggered automatically on Phase 2 load, or only when the user clicks a "Recommend for me" button? | | | when he clicks recommend service provider|
| 2 | If the user is on Phase 2 without having visited Phase 1 first, should there be a prompt to upload a document, or just silent no-op? | | | yes|
| 3 | Should chunk_size / overlap / top_k from the Phase 2 recommendation overwrite values already set in Phase 1, or only apply if the user hasn't changed them? | | |yes it should be |
| 4 | Should the "recommended" badge persist visually after the user overrides a stage, or disappear on override? | | yes it should preisistW| |

---

## Dependencies

- [ ] Existing Phase 1 document upload flow — document metadata must be accessible to Phase 2 (currently in component state; may require lifting to shared context or URL param)
- [ ] Existing provider catalog (`GET /providers`) — recommendation prompt must include catalog options so LLM picks only valid IDs
- [ ] New backend endpoint `POST /api/recommend-providers` (or extension of `/api/recommend`) — accepts document metadata + catalog, returns one provider ID per stage plus optional params
- [ ] GPT-4o-mini Azure OpenAI integration already used by Phase 1 strategy agent

---

## Notes & References

- Phase 1 recommendation UX (badge + pre-selection pattern): `frontend/src/pages/Phase1.tsx`, `applyRecommendationBadge()`
- Provider catalog structure: `backend/app/providers/` — each stage's `__init__.py` exposes a `CATALOG` dict with `name`, `description`, `pricing_notes`, `requires_env`, `requires_packages`
- Existing LLM call pattern: `backend/app/services/strategy_agent.py`
- Phase 2 configure tab: `frontend/src/pages/Phase2.tsx`

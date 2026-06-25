# Feature: History Tab

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-06-26  
> **Last Updated:** 2026-06-26  
> **Ticket:** —

---

## Overview

Add a "History" tab to the application that presents a table of all previously uploaded documents and their associated recommendations. Selecting a row re-populates Step 1 (and Step 2 if a provider recommendation was generated) so the user can revisit or refine a prior session without re-uploading.

---

## Goals

- [ ] Persist each upload event and its Phase 1 recommendation in an in-memory history store accessible across the session.
- [ ] Display history as a sortable table in a dedicated "History" tab alongside the existing Step 1 / Step 2 tabs.
- [ ] On row selection, restore the full Phase 1 state (document metadata + pipeline recommendation) into the Step 1 view.
- [ ] On row selection, restore Phase 2 provider selections and recommendation if they exist; leave Phase 2 blank if they do not.

---

## Non-Goals

- Not persisting history across browser refreshes or server restarts (in-memory only, consistent with the existing document store).
- Not allowing the user to delete or edit history entries in this iteration.
- Not supporting bulk selection or comparison of multiple history entries.
- Not exporting the history table to CSV or any other format in this iteration.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | RAG pipeline designer | I want to see a list of all files I have uploaded this session | I can quickly recall what I have already analysed | P0 |
| 2 | RAG pipeline designer | I want to click a history row and have Step 1 auto-populated | I do not have to re-upload a document to tweak the recommendation | P0 |
| 3 | RAG pipeline designer | I want Step 2 to be populated when a prior provider selection exists | I can continue iterating on a full pipeline without starting from scratch | P1 |
| 4 | RAG pipeline designer | I want Step 2 to appear empty when no provider selection was made for that entry | I have a clear indication that provider comparison has not been done for this document | P1 |

---

## UX

### User Flow

1. User navigates to the application and sees three tabs: **Step 1**, **Step 2**, and **History**.
2. User uploads a document and receives a Phase 1 recommendation — the entry is automatically added to the History table.
3. User optionally completes Phase 2 provider selection — the history entry is updated with the provider selections.
4. User clicks the **History** tab and sees a table of all uploaded files with key summary columns.
5. User clicks a row — the app switches to the **Step 1** tab and populates it with the stored document metadata and recommendation.
6. If Phase 2 data exists for that entry, Step 2 is also populated; otherwise Step 2 is reset to its empty/initial state.
7. User can edit parameters and regenerate code as usual.

### Wireframes / Mockups

> _To be provided. The History tab should follow the same card/panel layout used by Step 1 and Step 2. The table should use the existing shadcn/ui `Table` component._

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| No uploads yet in the session | History tab shows an empty-state message: "No uploads yet. Upload a document in Step 1 to get started." |
| Only Phase 1 completed for a row | Row is present; selecting it populates Step 1 only; Step 2 is reset to its initial empty state |
| Phase 1 and Phase 2 both completed | Selecting the row populates both steps |
| Very long filename | Filename is truncated with an ellipsis in the table cell; full name shown on hover (tooltip) |
| Large number of history entries | Table supports vertical scrolling; most recent entries appear at the top |

---

## Acceptance Criteria

### Functional

- [ ] Given the app has just loaded and no document has been uploaded, when the user opens the History tab, then an empty-state message is displayed.
- [ ] Given a document has been successfully uploaded and Phase 1 recommendation returned, when the History tab is opened, then a new row appears with the filename, upload timestamp, detected document type, and chunking strategy.
- [ ] Given the user has also completed Phase 2 for a document, when the History tab is opened, then the row additionally shows the selected providers (or a summary indicator).
- [ ] Given a history row exists, when the user clicks it, then the app navigates to Step 1 and all stored Phase 1 fields are populated.
- [ ] Given a history row with Phase 2 data is selected, when the navigation completes, then Step 2 is also populated with the stored provider selections.
- [ ] Given a history row without Phase 2 data is selected, when the navigation completes, then Step 2 is reset to its blank initial state.

### Non-Functional

- [ ] Row click and tab switch complete within 200 ms (no network call required — data is in memory).
- [ ] History table is readable and scrollable on viewport widths of 768 px and above.
- [ ] Meets WCAG 2.1 AA for the table, row focus states, and empty-state text.

### Out of Scope for This Release

- [ ] ~~Persistent storage across page reloads~~
- [ ] ~~Delete / edit history entries~~
- [ ] ~~CSV export~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Should the History tab be positioned before or after Step 2 in the tab bar? | Adarsh Kaul | — | |after
| 2 | What is the maximum number of entries to keep in memory before oldest entries are dropped? | Adarsh Kaul | — | |never
| 3 | Should selecting a history entry update the browser URL / tab state so the back button works? | Adarsh Kaul | — | |update brower url


---

## Dependencies

- [ ] `UploadContext` must be extended to store a history list alongside the current `uploadResult` — _Frontend_
- [ ] Phase 2 provider selections must be captured and linked to the corresponding history entry — _Frontend_
- [ ] shadcn/ui `Table` component must be available (already in the component library) — _Frontend_

---

## Notes & References

- Existing upload context: `frontend/src/contexts/UploadContext.tsx`
- Tab navigation: currently Step 1 / Step 2 tabs in the main layout component
- In-memory document store pattern: `backend/app/services/document_analyzer.py` (`register_document` / `get_document`)
- History state is client-side only; no new backend endpoints are required for this feature.

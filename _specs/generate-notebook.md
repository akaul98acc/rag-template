# Feature: Generate Notebook Button

> **Status:** Draft  
> **Author:** Adarsh Kaul  
> **Created:** 2026-06-12  
> **Last Updated:** 2026-06-12  
> **Ticket:** [TBD]

---

## Overview

Add a "Generate Notebook" action alongside the existing "Generate Code" button so users can download a runnable Jupyter notebook (`.ipynb`) of their RAG pipeline instead of a single flat code block. The notebook splits the same generated pipeline into discrete cells: one setup cell holding all package installs and required environment/API keys, then one cell per pipeline feature (stage). This makes the emitted pipeline easier to run, inspect, and iterate on cell-by-cell in a notebook environment.

---

## Goals

- [ ] Add a "Generate Notebook" button next to "Generate Code" on both Phase 1 and Phase 2 code-generation views.
- [ ] Produce a valid Jupyter notebook (`.ipynb`) built from the same provider selections that drive "Generate Code".
- [ ] Place all package installs and required keys/environment variables in a single first cell.
- [ ] Emit each pipeline feature (stage) as its own separate, independently runnable cell, in pipeline order.
- [ ] Let the user download and/or copy the resulting notebook.

---

## Non-Goals

- Not executing the notebook or any cell — the app still only emits artifacts, never runs the pipeline.
- Not replacing the existing "Generate Code" button; both options coexist.
- Not adding notebook-only providers or changing the provider catalog/selection logic.
- Not threading the Phase 1 tweak fields (`chunk_size`/`overlap`/`embedding_model`) into output if they are not already wired into "Generate Code".
- Not supporting alternative notebook formats (e.g. Google Colab-specific, R, `.Rmd`) in this iteration.

---

## User Stories

| #   | Persona                  | Want                                                            | So That                                                              | Priority |
| --- | ------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| 1   | RAG pipeline builder     | Generate a Jupyter notebook of my selected pipeline             | I can run and tweak the pipeline cell-by-cell in my own environment  | P0       |
| 2   | RAG pipeline builder     | See all package installs and keys collected in one setup cell   | I can configure my environment once before running the feature cells | P0       |
| 3   | RAG pipeline builder     | Have each pipeline stage in its own cell                        | I can run, debug, and re-run individual stages independently         | P0       |
| 4   | RAG pipeline builder     | Download the notebook as an `.ipynb` file                       | I can open it directly in Jupyter/VS Code without manual conversion  | P1       |

---

## UX

### User Flow

1. User completes their selections on the code-generation view (Phase 1 recommendation tweaks, or Phase 2 provider picks).
2. User sees two actions: the existing "Generate Code" button and a new "Generate Notebook" button.
3. User clicks "Generate Notebook".
4. System assembles a notebook from the same selections: a first setup cell (package installs + required keys/env vars) followed by one cell per pipeline stage in pipeline order.
5. User can preview the notebook's cell structure and download it as an `.ipynb` file (and/or copy it).

### Wireframes / Mockups

> _Link or embed mockups here._ Layout: the two buttons sit side-by-side in the generation action row. After generation, the notebook result is presented with the setup cell first, then one labeled cell per stage, mirroring the existing generated-code panel.

### Edge Cases & Empty States

| Scenario                              | Expected Behaviour                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| No providers / stages selected        | Button disabled or notebook contains a single explanatory cell noting nothing was selected |
| A stage has no required keys/packages | Setup cell omits that entry; no empty install lines                                          |
| No env vars required at all           | Setup cell still generated for package installs; keys section omitted gracefully            |
| API / generation error               | User sees an inline error message; no partial file is downloaded                            |
| Loading state                        | "Generate Notebook" shows a loading/generating indicator and is disabled while in flight    |

---

## Acceptance Criteria

### Functional

- [ ] Given valid selections, when the user clicks "Generate Notebook", then a valid `.ipynb` notebook is produced from the same selections used by "Generate Code".
- [ ] Given the generated notebook, when the user inspects it, then the first cell contains all package installs and all required keys/environment variables for the selected providers.
- [ ] Given multiple selected stages, when the notebook is generated, then each stage appears as its own separate cell, ordered to match the pipeline stage order.
- [ ] Given a generated notebook, when the user chooses to download it, then they receive a file that opens without errors in Jupyter/VS Code.
- [ ] Given the same selections, when comparing "Generate Code" and "Generate Notebook", then the pipeline logic is equivalent (the notebook is a cell-split presentation of the same output).

### Non-Functional

- [ ] Notebook generation completes within a comparable time to "Generate Code".
- [ ] Accessible — buttons are labeled and keyboard reachable; meets WCAG 2.1 AA.
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions).
- [ ] Mobile responsive at 375px and above.

### Out of Scope for This Release

- [ ] ~~Notebook execution / output capture~~
- [ ] ~~Colab-specific or non-Python notebook formats~~

---

## Open Questions

| #   | Question                                                                                      | Owner | Due | Resolution |
| --- | --------------------------------------------------------------------------------------------- | ----- | --- | ---------- |
| 1   | Should the notebook be downloaded as a file, previewed in-app, or both?                       |   as file download    |     |            |
| 2   | Should package installs use `%pip install` cells, or be listed as a requirements comment?     |       |     |          yes  |
| 3   | Are required keys rendered as `os.environ` placeholders, or as commented instructions?        |       |     |   commented         |
| 4   | Is "Generate Notebook" available in both Phase 1 and Phase 2, or only one to start?           |       |  yes in both    |            |
| 5   | Should each stage cell include its stage-label header comment like the current code blocks?   |       |    yes |            |

---

## Dependencies

- [ ] Existing `/api/generate` flow and provider catalog (selections → rendered pipeline) — _RAG Builder backend_
- [ ] Existing code-generation UI surfaces in Phase 1 and Phase 2 — _RAG Builder frontend_

---

## Notes & References

- Existing "Generate Code" flow: frontend `generateCode` in `services/api.ts`, `CodeViewer` component, `Phase1.tsx` / `Phase2.tsx`; backend `/api/generate` route → `code_generator.render_pipeline()`, which already builds the pipeline as per-stage blocks and collects `requires_env`.
- The notebook feature reuses the same selections and per-stage block structure; the key difference is presentation (separate cells) plus a dedicated setup cell for packages and keys.

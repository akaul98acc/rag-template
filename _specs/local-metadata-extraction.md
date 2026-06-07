# Feature: Local File Metadata Extraction for Upload

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-06-04
> **Last Updated:** 2026-06-04
> **Ticket:** [TBD]

---

## Overview

The `POST /api/upload` endpoint currently extracts document metadata by calling Azure Document Intelligence (ADI), which sends the uploaded file's contents to an external Azure service over the network. This feature replaces that remote call with fast, fully local metadata extraction using standard Python packages. The goal is sub-second extraction (~0.3s) that never transmits document content off the machine, while preserving the existing `UploadResponse` / `DocumentMetadata` contract.

---

## Goals

- [ ] Extract all upload metadata locally, removing the Azure Document Intelligence call from the `/upload` flow entirely.
- [ ] Map each metadata field to a specific local extraction source:
  - [ ] `filename`, `size_bytes` → `pathlib` (built-in).
  - [ ] `mime_type` → `filetype` (with a built-in fallback if the package is unavailable).
  - [ ] `page_count`, `is_scanned`, `images` → PyMuPDF (`fitz`).
  - [ ] `has_tables`, `tables` → `pdfplumber`.
  - [ ] `language` → `langdetect`, run on first-page text only.
- [ ] Keep total extraction time fast (target ~0.3s for a typical document).
- [ ] Guarantee no document content leaves the machine for any external service during upload.
- [ ] Preserve the existing `UploadResponse` shape so the frontend and downstream `/analyze` flow continue to work unchanged.
- [ ] Provide a graceful alternative when any listed package is unavailable, achieving the same result.

---

## Non-Goals

- Not modifying any endpoint other than `/upload` (`/analyze`, `/providers`, `/generate`, `/health` stay as-is).
- Not changing the `DocumentMetadata` / `UploadResponse` Pydantic schema fields.
- Not changing the derived content-statistics logic (`avg_words_per_page`, `text_density`, `table_ratio`, `doc_type`, `content_type`, `avg_sentence_length`) — only the source of the raw signals that feed it.
- Not removing Azure Document Intelligence code used by other parts of the codebase; only its use within the `/upload` path is removed.
- Not adding OCR for scanned documents in this iteration (scanned PDFs are detected, not transcribed).
- Not supporting new file formats beyond those already accepted by the endpoint.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | RAG pipeline designer | Upload a document and get metadata back quickly | I can move to the strategy recommendation step without waiting on a remote service | P0 |
| 2 | Security-conscious user | Be sure my document content is never sent to an external service | I can analyze sensitive/internal documents safely | P0 |
| 3 | Developer running locally | Use the upload flow without configuring Azure credentials | I can run the tool fully offline | P1 |

---

## UX

### User Flow

1. User selects and uploads a document on the Phase 1 screen.
2. Frontend posts the file to `POST /api/upload`.
3. Backend validates the file (non-empty, size limit, supported MIME type).
4. Backend extracts metadata locally (filename/size, MIME type, page count, scanned flag, image count, table presence/count, language).
5. Backend returns `{ doc_id, metadata }`; the UI displays the detected metadata and proceeds to the recommendation step.

### Wireframes / Mockups

> No UI changes. The existing upload component and metadata display are reused unchanged.

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| Empty file uploaded | 400 error, "Uploaded file is empty" (unchanged). |
| File exceeds size limit | 413 error with the configured max size (unchanged). |
| Unsupported MIME type | 415 error, "Unsupported file type" (unchanged). |
| Non-PDF supported file (e.g. plain text) | PDF-specific fields (`page_count`, `is_scanned`, `images`, `tables`) default sensibly; language still detected from text where possible. |
| Scanned PDF (no extractable text) | `is_scanned = true`; language and text-derived stats degrade gracefully without erroring. |
| PyMuPDF / pdfplumber / langdetect / filetype not installed | Endpoint falls back to an alternative that achieves the same field, or returns the field's safe default, without failing the upload. |
| Corrupt or unparseable PDF | Upload still succeeds with best-effort metadata; missing fields take their defaults rather than raising. |
| Language detection on very short / empty first-page text | `language` returns `null` rather than erroring. |

---

## Acceptance Criteria

### Functional

- [ ] Given a valid PDF upload, when `/upload` runs, then metadata is extracted entirely locally with no network call to Azure Document Intelligence.
- [ ] Given the response, when inspected, then it conforms to the existing `UploadResponse` schema (`doc_id` + full `DocumentMetadata`).
- [ ] Given a text-based PDF, when analyzed, then `page_count`, `is_scanned`, `images`, `has_tables`, `tables`, and `language` are populated from the local sources defined in Goals.
- [ ] Given `language` detection, when run, then it operates on first-page text only.
- [ ] Given any single extraction package is missing, when `/upload` runs, then the endpoint still returns a valid response using an equivalent alternative or a safe default for the affected field(s).
- [ ] Given the change, when the codebase is reviewed, then only the `/upload` endpoint path is modified and no other endpoint's behavior changes.

### Non-Functional

- [ ] Local metadata extraction completes in roughly ~0.3s for a typical document and does not regress overall upload latency versus the prior local fallback path.
- [ ] No document bytes or extracted text are transmitted to any external service during upload.
- [ ] Existing validation behavior (empty/size/MIME) is preserved.

### Out of Scope for This Release

- [ ] ~~OCR transcription of scanned PDFs~~
- [ ] ~~Removing Azure Document Intelligence code from non-upload code paths~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Which package replaces each listed dependency if it is unavailable in the target environment (e.g. `python-magic`/`mimetypes` for MIME, `pypdf` for page count)? | backend-agent | impl | Decide during implementation; must achieve the same field result. |
| 2 | Should the shared `analyze_file` service be branched/parameterized so only `/upload` uses the local path, or refactored in place? | backend-agent | impl | Constrain changes to the `/upload` path per the rules. |
| 3 | How are table/image counts defined for multi-page PDFs (per-document totals vs. per-page)? | backend-agent | impl | Match current `DocumentMetadata` semantics (document totals). |

---

## Dependencies

- [ ] `PyMuPDF` (`fitz`) — page count, scanned detection, image count. _Owner: backend-agent_
- [ ] `pdfplumber` — table presence and count. _Owner: backend-agent_
- [ ] `langdetect` — language detection on first-page text. _Owner: backend-agent_
- [ ] `filetype` — MIME type detection (fallback to stdlib `mimetypes` if unavailable). _Owner: backend-agent_
- [ ] `requirements.txt` updates and a clean local install. _Owner: backend-agent_

---

## Notes & References

- Current implementation: `backend/app/api/routes/upload.py` and `backend/app/services/document_analyzer.py` (Azure DI call with a `pypdf` local fallback).
- Response models: `backend/app/models/document.py` (`DocumentMetadata`, `UploadResponse`).
- Derived stats helper to keep feeding: `backend/app/services/content_stats.py`.
- Constraint: only `/upload` may change; the ADI call must be removed from this endpoint's path; no document content may be sent externally.

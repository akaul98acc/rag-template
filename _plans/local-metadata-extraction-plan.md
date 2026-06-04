# Implementation Plan: Local File Metadata Extraction for Upload

> Spec: `_specs/local-metadata-extraction.md`
> Branch: `claude/feature/local-metadata-extraction`
> Owner: backend-agent

---

## 1. Objective

Replace the Azure Document Intelligence (ADI) call in the `POST /api/upload` path with fully local metadata extraction, keeping the `UploadResponse` / `DocumentMetadata` contract byte-for-byte compatible. Target ~0.3s extraction, zero document content sent off-machine.

---

## 2. Key findings from the codebase

- `backend/app/api/routes/upload.py` is the only caller of `analyze_file(...)` (`document_analyzer.py`). `/analyze` only uses `get_document(...)`. **Therefore the upload extraction logic can be replaced without touching any other endpoint's behavior.**
- `analyze_file` currently: computes size + mime (`mimetypes`), PDF page count + scanned flag (`pypdf`), then calls Azure DI when configured (`is_azure_di_configured()`), falling back to a `pypdf` text path. It feeds raw signals (`word_count`, `sentence_count`, `total_char_count`, `table_char_count`) into `derive_content_stats(...)`.
- `derive_content_stats(...)` in `content_stats.py` is pure and **must keep receiving the same four raw signals** so all derived fields (`avg_words_per_page`, `text_density`, `table_ratio`, `doc_type`, `content_type`, `avg_sentence_length`) stay correct. We only change *where the signals come from*.
- `upload.py` imports the Azure DI exception types and maps them to 502/503 responses. Once ADI is removed from this path, **those imports and exception handlers must go**.
- MIME validation happens *before* extraction against `SUPPORTED_MIME_TYPES` (config.py). PDF-specific fields default sensibly for non-PDF supported types (images, DOCX).
- `requirements.txt` already has `pypdf` and `python-magic*`; it does **not** have PyMuPDF, pdfplumber, langdetect, or filetype.

---

## 3. Design decision

**Create a new local-only extraction service rather than mutating `analyze_file` in place.**

- New module: `backend/app/services/local_metadata.py` exposing `extract_metadata_local(path, original_name, content) -> DocumentMetadata`.
- `upload.py` calls `extract_metadata_local(...)` instead of `await analyze_file(...)`.
- Rationale: keeps the change surgical and obviously scoped to the upload path; leaves `document_analyzer.py` / `azure_document_intelligence.py` intact for non-upload code (spec non-goal: don't remove ADI from other paths). `register_document` / `get_document` stay in `document_analyzer.py` and are reused unchanged.
- The new function is **synchronous** (all extraction is local CPU work), so `upload.py`'s handler no longer needs the `await`.

Each extractor is wrapped so a missing package or parse failure degrades to a safe default instead of failing the upload.

---

## 4. Field → source mapping (and fallbacks)

| Field | Primary source | Fallback if unavailable |
|-------|----------------|-------------------------|
| `filename` | original upload name | — |
| `size_bytes` | `pathlib` `Path.stat().st_size` | `len(content)` |
| `mime_type` | `filetype.guess(content).mime` | `mimetypes.guess_type` (existing logic), then `application/octet-stream` |
| `page_count` | PyMuPDF `doc.page_count` | `pypdf` (`_pdf_page_count`) |
| `is_scanned` | PyMuPDF: pages have images and little/no extractable text | `pypdf` text-empty heuristic (`_is_scanned_pdf`) |
| `images` | PyMuPDF: `sum(len(page.get_images()) …)` | `0` |
| `has_tables` / `tables` | `pdfplumber`: count `page.find_tables()` across pages | `False` / `0` |
| `language` | `langdetect.detect()` on **first-page text only** (fitz `page[0].get_text()`) | `None` |
| raw: `word_count`, `sentence_count`, `total_char_count` | full text via PyMuPDF → `count_words` / `count_sentences` / `len` | `pypdf` extracted text, else `0` |
| raw: `table_char_count` | sum of characters across pdfplumber table cells | `0` |

Non-PDF supported types (images, DOCX): MIME still detected; PDF-only fields take defaults (`page_count=None`, `images=0`, `tables=0`, `is_scanned=False`); language attempted only if text is available.

Performance note: use PyMuPDF for text/pages/images (fast) and reserve pdfplumber for table detection only. If pdfplumber proves slow on large PDFs, cap table scanning (e.g. all pages but short-circuit) — keep within the ~0.3s target; document any cap.

---

## 5. Step-by-step changes

### Step 1 — Dependencies (`backend/requirements.txt`)
- Add: `PyMuPDF>=1.24`, `pdfplumber>=0.11`, `langdetect>=1.0.9`, `filetype>=1.2`.
- Keep `pypdf` (used as fallback) and Azure deps (still used by non-upload code).
- Install into the venv and confirm imports.

### Step 2 — New service `backend/app/services/local_metadata.py`
- `extract_metadata_local(path: Path, original_name: str, content: bytes) -> DocumentMetadata`.
- Helper functions, each defensive (try/except, lazy imports so the app still boots if a package is missing):
  - `_detect_mime(content, original_name)` — filetype → mimetypes fallback.
  - `_pdf_signals_fitz(path)` — returns page_count, images, is_scanned, full_text, first_page_text.
  - `_detect_language(first_page_text)` — langdetect on first page only; `None` on empty/short/failure.
  - `_table_signals_pdfplumber(path)` — returns table count + table_char_count.
- Assemble raw signals, call `derive_content_stats(...)` (reuse `count_words` / `count_sentences` from `content_stats.py`), and build `DocumentMetadata`.
- Keep one INFO log line summarizing local extraction (mirrors existing logging style; no document content in logs).

### Step 3 — Update `backend/app/api/routes/upload.py` (the only endpoint changed)
- Remove imports of `analyze_file` and the Azure DI exception types.
- Replace the `try/except Azure*` block + `await analyze_file(...)` with `metadata = extract_metadata_local(dest, file.filename, content)`.
- Decide MIME ordering: keep the pre-save validation against `SUPPORTED_MIME_TYPES` using the current best-guess, but let the stored `metadata.mime_type` come from `filetype` (more reliable via magic bytes). Ensure validation and stored value stay consistent (e.g. validate using the same `_detect_mime`).
- Keep `register_document(doc_id, dest, metadata)` and the `UploadResponse` return unchanged.
- Remove now-unused imports (`mimetypes` if fully superseded; keep if still used for fallback in-route).

### Step 4 — Leave untouched
- `document_analyzer.py` (`analyze_file`, `register_document`, `get_document`, `StoredDocument`) — `get_document`/`register_document` still used; `analyze_file` becomes dead code for upload but is intentionally left so no other path breaks. (Optional cleanup note below.)
- `azure_document_intelligence.py`, `content_stats.py`, `models/document.py`, `config.py`, all other routes.

---

## 6. Edge cases to handle (from spec)

- Empty file / oversize / unsupported MIME → keep existing 400 / 413 / 415 (validation stays in `upload.py`, before extraction).
- Scanned PDF → `is_scanned=True`, language/text stats degrade to `None`/`0` without error.
- Corrupt PDF → best-effort; each extractor returns defaults on exception, upload still succeeds.
- Missing package (any of the four) → fallback per table in §4; upload never fails because of a missing optional dep.
- Empty/short first-page text → `language=None`.

---

## 7. Verification

1. **App boots:** `python -c "import app.main"` from `backend/` (with venv active) — confirms imports resolve and no Azure import is required by the upload path.
2. **Type/health sanity:** start `uvicorn app.main:app --reload`; hit `GET /api/health`.
3. **Functional upload:** `POST /api/upload` with:
   - a text-based PDF → expect populated `page_count`, `images`, `has_tables`/`tables`, `language`, derived stats.
   - a scanned/image-only PDF → `is_scanned=True`, `language=None`.
   - a non-PDF image → MIME correct, PDF fields defaulted.
   - an empty file and an unsupported type → 400 / 415 unchanged.
4. **No external call:** confirm no Azure DI import or network call in the upload path (grep `upload.py` for `azure`; run with Azure env unset).
5. **Latency:** time a representative PDF upload; confirm ~0.3s extraction (log the elapsed time during dev; pdfplumber is the main risk — adjust if needed).
6. **Regression:** confirm `/analyze` still returns a recommendation for an uploaded `doc_id` (uses `get_document`).

> No automated test runner is configured (per CLAUDE.md); verification is manual via the running app. `npm run typecheck` is unaffected (frontend unchanged).

---

## 8. Files touched

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add PyMuPDF, pdfplumber, langdetect, filetype |
| `backend/app/services/local_metadata.py` | **New** — local extraction service |
| `backend/app/api/routes/upload.py` | Swap ADI/`analyze_file` for local extraction; drop Azure imports/handlers |

No frontend, model, config, or other-route changes.

---

## 9. Risks & open items

- **pdfplumber latency** on large/complex PDFs may threaten the ~0.3s target → measure; cap or skip table scan beyond N pages if needed (document the cap).
- **MIME source of truth** — using `filetype` (magic bytes) may classify a file differently than the current extension/`content_type` guess; ensure validation and stored value use the same detector to avoid a 415/stored-mime mismatch.
- **DOCX** isn't reliably handled by PyMuPDF/pdfplumber → it falls back to defaults (acceptable per spec; not a new format).
- **Optional cleanup (not in scope):** `analyze_file` becomes unused by the live path; leave as-is to honor "only modify /upload," or remove in a separate change if desired.

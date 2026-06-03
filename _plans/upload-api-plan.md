# POST /api/upload Endpoint Design Plan

## 1. Overview

This plan describes the implementation of `POST /api/upload` for the RAG Builder backend. The endpoint:

- Accepts a document via multipart/form-data from the frontend.
- Persists the file to the existing in-memory document store (file saved to `settings.upload_dir`, metadata tracked in `_DOCS` dict within `services/document_analyzer.py`).
- Calls **Azure Document Intelligence** (prebuilt-layout model) to extract rich metadata: page count, detected language, table count, and image/figure count.
- Returns `{ doc_id, metadata }` conforming to the existing `UploadResponse` Pydantic model.

**Architecture alignment:**

| Convention | How this feature follows it |
|------------|----------------------------|
| Thin routes in `api/routes/` | `upload.py` reads the file, delegates to service, returns Pydantic model. |
| Business logic in `services/` | New `services/azure_document_intelligence.py` encapsulates DI client + metadata extraction. Existing `services/document_analyzer.py` orchestrates local + Azure analysis. |
| Pydantic v2 models in `models/` | `DocumentMetadata` extended with `tables` and `images` fields; `UploadResponse` unchanged. |
| Routes mounted under `/api` | Router already mounted in `main.py` with `/api` prefix. |
| Managed Identity auth | `DefaultAzureCredential`; no API keys committed. |
| Import-light providers/services | Azure SDK imported inside async function, not at module top-level. |

---

## 2. API Contract

### Request

```
POST /api/upload
Content-Type: multipart/form-data

Form field: file (required) - the document to upload
```

Supported MIME types (initial scope):

- `application/pdf`
- `image/jpeg`, `image/png`, `image/tiff`, `image/bmp`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)

Maximum file size: 50 MB (configurable via `settings.max_upload_size_mb`).

### Response

```
HTTP 200 OK
Content-Type: application/json
```

**Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `doc_id` | `string` | Server-generated UUID hex identifier. |
| `metadata` | `DocumentMetadata` | Extracted document metadata object. |

**`DocumentMetadata` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `filename` | `string` | Original uploaded filename. |
| `size_bytes` | `int` | File size in bytes. |
| `mime_type` | `string` | Detected/supplied MIME type. |
| `page_count` | `int \| null` | Number of pages (from Azure DI). |
| `language` | `string \| null` | Detected language locale (e.g., `en`). |
| `has_tables` | `bool` | `true` if `tables > 0`. |
| `is_scanned` | `bool` | `true` if PDF has no extractable text. |
| `tables` | `int` | Count of detected tables. |
| `images` | `int` | Count of detected figures/images. |

**Example response:**

```json
{
  "doc_id": "a1b2c3d4e5f6789012345678abcdef01",
  "metadata": {
    "filename": "annual_report.pdf",
    "size_bytes": 2457600,
    "mime_type": "application/pdf",
    "page_count": 50,
    "language": "en",
    "has_tables": true,
    "is_scanned": false,
    "tables": 12,
    "images": 8
  }
}
```

---

## 3. Azure Document Intelligence Integration Approach

*This section incorporates the design produced by the azure-expert subagent.*

### Model choice

**Recommendation: `prebuilt-layout`**

| Field | prebuilt-read | prebuilt-layout | prebuilt-document (general) |
|-------|---------------|-----------------|------------------------------|
| Content type / detected doc type | Partial (no structure) | Yes (via content + structure) | Yes |
| Page count | Yes (pages) | Yes (pages) | Yes |
| Language detected | Yes (languages) | Yes (languages) | Yes |
| Tables count | No (read does not extract tables) | Yes (tables) | Yes (tables) |
| Images / figures count | No | Yes (figures) | Limited |

**Rationale:** `prebuilt-read` is OCR-only (no tables/figures). `prebuilt-document` was folded into `prebuilt-layout` in modern API versions (2023-07-31 / 2024-11-30). `prebuilt-layout` is the only single model that surfaces all 5 fields in one analyze call.

### Property mapping (AnalyzeResult)

| Metadata field | Source property | Notes |
|----------------|-----------------|-------|
| Content type (MIME / doc type) | Detect from uploaded file's MIME yourself (`UploadFile.content_type`); DI does not return MIME. | Treat HTTP-supplied MIME as source of truth, fall back to extension sniffing. |
| Number of pages | `len(result.pages)` | Each `DocumentPage` = one page. |
| Language (detected) | `result.languages` -> highest-confidence entry; use `.locale` | Requires `features=[DocumentAnalysisFeature.LANGUAGES]` add-on. |
| Tables detected (count) | `len(result.tables or [])` | Returned natively by layout. |
| Images detected (count) | `len(result.figures or [])` | "Figures" = embedded images/charts; available in API 2024-11-30 / 2023-07-31 GA. |

**Language nuance:** In modern `azure-ai-documentintelligence` SDK, language detection is a billable add-on feature, not on by default. Pass `features=[DocumentAnalysisFeature.LANGUAGES]`. Alternatively detect language client-side (`langdetect`/`fasttext` over `result.content`) to avoid the add-on cost.

### Async long-running operation (LRO)

Integration uses `begin_analyze_document(...)` -> poller -> `poller.result()` -> single `AnalyzeResult` (pages, languages, tables, figures, content).

In FastAPI, use the async client (`azure.ai.documentintelligence.aio.DocumentIntelligenceClient`) and `await poller.result()`.

### Environment variables

```
AZURE_DOCINT_ENDPOINT=https://<resource-name>.cognitiveservices.azure.com/
```

**Auth recommendation:** Managed Identity / Entra ID via `DefaultAzureCredential`. Do not ship API-key auth. DI resource must grant the identity the **Cognitive Services User** RBAC role. With Entra ID you only need `AZURE_DOCINT_ENDPOINT`, no key.

### Where logic lives

| Layer | File | Responsibility |
|-------|------|----------------|
| Route | `backend/app/api/routes/upload.py` | Read file bytes, call service, return `UploadResponse`. |
| Service (new) | `backend/app/services/azure_document_intelligence.py` | `async def extract_metadata(file_bytes, content_type) -> AzureDIResult` — encapsulates SDK client, LRO, error handling. |
| Service (existing) | `backend/app/services/document_analyzer.py` | Orchestrates: save file, call Azure DI service, merge with local analysis, register in `_DOCS`. |

### SDK code pattern (azure-expert design reference)

```python
import os
from azure.ai.documentintelligence.aio import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import (
    AnalyzeResult,
    DocumentAnalysisFeature,
)
from azure.identity.aio import DefaultAzureCredential
from azure.core.exceptions import HttpResponseError, ServiceRequestError


async def extract_metadata(file_bytes: bytes, content_type: str | None) -> dict:
    endpoint = os.environ["AZURE_DOCINT_ENDPOINT"]

    async with DefaultAzureCredential() as credential, \
            DocumentIntelligenceClient(endpoint, credential) as client:
        try:
            poller = await client.begin_analyze_document(
                model_id="prebuilt-layout",
                body=file_bytes,
                features=[DocumentAnalysisFeature.LANGUAGES],
                content_type="application/octet-stream",
            )
            result: AnalyzeResult = await poller.result()
        except HttpResponseError as exc:
            raise RuntimeError(f"Document Intelligence analyze failed: {exc.message}") from exc
        except ServiceRequestError as exc:
            raise RuntimeError(f"Could not reach Document Intelligence endpoint: {exc}") from exc

    page_count = len(result.pages or [])
    table_count = len(result.tables or [])
    image_count = len(result.figures or [])

    detected_language = None
    if result.languages:
        best = max(result.languages, key=lambda l: l.confidence or 0.0)
        detected_language = best.locale

    resolved_content_type = content_type or "application/octet-stream"

    return {
        "content_type": resolved_content_type,
        "page_count": page_count,
        "language": detected_language,
        "tables": table_count,
        "images": image_count,
    }
```

---

## 4. Pydantic Models

All models reside in `backend/app/models/document.py` and are re-exported via `backend/app/models/__init__.py`.

### Extended `DocumentMetadata`

```python
from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    """Metadata extracted from an uploaded document."""

    filename: str
    size_bytes: int
    mime_type: str
    page_count: int | None = None
    language: str | None = None
    has_tables: bool = False
    is_scanned: bool = False
    tables: int = Field(default=0, description="Count of detected tables")
    images: int = Field(default=0, description="Count of detected figures/images")
```

### `UploadResponse` (unchanged)

```python
class UploadResponse(BaseModel):
    """Response returned by POST /api/upload."""

    doc_id: str = Field(..., description="Server-generated identifier for the uploaded document")
    metadata: DocumentMetadata
```

### Internal DTO for Azure DI result (new)

```python
class AzureDIResult(BaseModel):
    """Internal DTO carrying Azure Document Intelligence extraction results."""

    page_count: int
    language: str | None
    tables: int
    images: int
```

This model lives in `backend/app/models/document.py` but is **not** exported in `__init__.py` (internal use only).

---

## 5. Error Handling Strategy

| Scenario | HTTP Status | Error Response Shape | Notes |
|----------|-------------|---------------------|-------|
| Missing filename | 400 Bad Request | `{ "detail": "filename missing" }` | Already implemented. |
| Unsupported file type | 415 Unsupported Media Type | `{ "detail": "Unsupported file type: <mime>" }` | Check against allowlist before processing. |
| File too large (>50 MB) | 413 Payload Too Large | `{ "detail": "File exceeds maximum size of 50 MB" }` | Check `len(content)` after read. |
| Empty file (0 bytes) | 400 Bad Request | `{ "detail": "Uploaded file is empty" }` | Check before calling Azure DI. |
| Azure DI auth failure (401/403) | 502 Bad Gateway | `{ "detail": "Document Intelligence authentication failed" }` | Catch `HttpResponseError` with status 401/403. |
| Azure DI timeout / network error | 504 Gateway Timeout | `{ "detail": "Document Intelligence service unavailable" }` | Catch `ServiceRequestError`. |
| Azure DI throttling (429) | 503 Service Unavailable | `{ "detail": "Document Intelligence rate limit exceeded", "retry_after": <seconds> }` | Catch `HttpResponseError` with status 429; extract `Retry-After` header if present. |
| Azure DI partial extraction | 200 OK | Return available fields; set missing fields to `null` / `0` | Log warning; do not fail the request. |
| Azure DI unknown error | 502 Bad Gateway | `{ "detail": "Document Intelligence error: <message>" }` | Catch-all for other `HttpResponseError`. |

**Implementation notes:**

- Wrap Azure DI calls in a `try/except` block within `services/azure_document_intelligence.py`.
- Raise custom exceptions (e.g., `AzureDIError`, `AzureDIAuthError`, `AzureDIThrottledError`) that the route can catch and map to appropriate `HTTPException`.
- Use FastAPI's `HTTPException` with structured `detail` (string or dict) for JSON error responses.

---

## 6. Cost Estimate Table

*Verbatim from azure-expert subagent.*

### Tier / SKU Recommendation

**Recommendation: S0 (Standard).**

| Tier | Throughput / limits | Fit |
|------|---------------------|-----|
| F0 (Free) | ~500 pages/month, max 2 pages per document, 1 transaction at a time | Dev smoke-test only; 2-page cap corrupts counts for a 50-page doc. |
| S0 (Standard) | Pay-per-page, full page processing, higher concurrency | Correct choice — processes whole document, supports layout + add-ons. |

**Rationale:** Metadata accuracy (page/table/figure counts) needs the whole document; F0's 2-page truncation silently corrupts counts feeding the Phase 1 strategy agent. S0 for anything real.

### Cost Estimate per Document

Assumptions: `prebuilt-layout`, East US, S0, 50-page doc, pay-as-you-go. Pricing as of 2026-01 (knowledge cutoff) — verify against Azure pricing calculator before quoting.

| Service | Tier | Unit Cost | Estimated Per-Document | Assumptions |
|---------|------|-----------|------------------------|-------------|
| Document Intelligence — prebuilt-layout (base) | S0 | ~$10 per 1,000 pages = $0.01/page | 50 pages x $0.01 = $0.50 | East US, pay-go, layout model, 2026-01 pricing |
| Language detection add-on (optional) | S0 | ~$1 per 1,000 pages = $0.001/page | 50 x $0.001 = $0.05 | Only if `features=[LANGUAGES]` enabled |
| **Total (layout + language add-on)** | S0 | — | **~$0.55 / document** | Drops to $0.50 if language detected client-side |

**F0 free-tier note:** $0 but capped ~500 pages/month and first 2 pages per document — not representative for a 50-page doc.

**Flags to verify:** $0.01/page layout base and $0.001/page language add-on are believed current for S0 East US; confirm on the DI pricing page. `prebuilt-read` is cheaper (~$1.50/1,000 pages) but cannot give tables/figures.

---

## 7. Implementation Order

1. **Update Pydantic models** (`backend/app/models/document.py`)
   - Add `tables: int = 0` and `images: int = 0` fields to `DocumentMetadata`.
   - Add internal `AzureDIResult` model.

2. **Update config** (`backend/app/core/config.py`)
   - Add `azure_docint_endpoint: str | None = None` setting.
   - Add `max_upload_size_mb: int = 50` setting.
   - Add supported MIME types list constant.

3. **Create Azure DI service** (`backend/app/services/azure_document_intelligence.py`)
   - Implement `async def extract_metadata(file_bytes: bytes, content_type: str | None) -> AzureDIResult`.
   - Use async `DocumentIntelligenceClient` with `DefaultAzureCredential`.
   - Define custom exception classes (`AzureDIError`, `AzureDIAuthError`, `AzureDIThrottledError`).
   - Handle all error scenarios per Section 5.

4. **Update document analyzer service** (`backend/app/services/document_analyzer.py`)
   - Convert `analyze_file` to async (`async def analyze_file`).
   - Call Azure DI service when `settings.azure_docint_endpoint` is configured.
   - Merge Azure DI results into `DocumentMetadata`.
   - Fall back to local-only analysis if Azure DI is not configured or fails (log warning).

5. **Update upload route** (`backend/app/api/routes/upload.py`)
   - Add file size validation (413 if > `max_upload_size_mb`).
   - Add MIME type validation (415 if not in allowlist).
   - Add empty file check (400 if 0 bytes).
   - Convert to async (`await analyze_file(...)`).
   - Catch Azure DI custom exceptions and map to appropriate `HTTPException`.

6. **Update `.env.example`** (`backend/.env.example`)
   - Add `AZURE_DOCINT_ENDPOINT=` placeholder.

7. **Update dependencies** (`backend/requirements.txt`)
   - Add `azure-ai-documentintelligence>=1.0.0`.
   - Add `azure-identity>=1.15.0`.

8. **Validation** (per CLAUDE.md)
   - **Backend:** Start FastAPI app (`uvicorn app.main:app --reload --port 8000`) and verify `/api/health` returns `{"status": "ok"}`. Import `app.main` in Python REPL to catch import errors.
   - **Frontend:** Run `npm run typecheck` to ensure no TS breakage from API contract changes (none expected since response schema is backward-compatible).
   - No test runner configured; manual verification via API client (curl / Postman / frontend) after implementation.

---

## Files to Touch (Summary)

| Order | File Path | Action |
|-------|-----------|--------|
| 1 | `backend/app/models/document.py` | Extend `DocumentMetadata`, add `AzureDIResult` |
| 2 | `backend/app/core/config.py` | Add Azure DI and upload settings |
| 3 | `backend/app/services/azure_document_intelligence.py` | **Create** new service |
| 4 | `backend/app/services/document_analyzer.py` | Make async, integrate Azure DI |
| 5 | `backend/app/api/routes/upload.py` | Add validations, async, error handling |
| 6 | `backend/.env.example` | Add Azure DI env var placeholder |
| 7 | `backend/requirements.txt` | Add Azure SDK dependencies |

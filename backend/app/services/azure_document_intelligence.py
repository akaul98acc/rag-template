"""Azure Document Intelligence service for document metadata extraction.

Uses the prebuilt-layout model with LANGUAGES add-on to extract:
- Page count
- Detected language
- Table count
- Figure/image count

SDK imports are guarded so the app can load without the azure packages installed.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.config import settings
from app.models.document import AzureDIResult
from app.services.content_stats import count_sentences, count_words

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# Custom exceptions for Azure DI errors
class AzureDIError(Exception):
    """Base exception for Azure Document Intelligence errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AzureDIAuthError(AzureDIError):
    """Authentication/authorization failure (401/403)."""

    pass


class AzureDIThrottledError(AzureDIError):
    """Rate limit exceeded (429)."""

    def __init__(
        self, message: str, retry_after: int | None = None, status_code: int | None = 429
    ) -> None:
        super().__init__(message, status_code)
        self.retry_after = retry_after


def is_azure_di_configured() -> bool:
    """Check if Azure Document Intelligence is configured."""
    return bool(settings.azure_docint_endpoint)


async def extract_metadata(file_bytes: bytes, content_type: str | None) -> AzureDIResult:
    """Extract document metadata using Azure Document Intelligence.

    Args:
        file_bytes: Raw bytes of the document file.
        content_type: MIME type of the document (optional).

    Returns:
        AzureDIResult with page count, language, table count, and image count.

    Raises:
        AzureDIError: Base error for DI failures.
        AzureDIAuthError: Authentication/authorization failure.
        AzureDIThrottledError: Rate limit exceeded.
        RuntimeError: If Azure DI is not configured.
    """
    if not settings.azure_docint_endpoint:
        raise RuntimeError("Azure Document Intelligence endpoint not configured")

    # Lazy import Azure SDK to allow app to load without packages
    try:
        from azure.ai.documentintelligence.aio import DocumentIntelligenceClient
        from azure.ai.documentintelligence.models import DocumentAnalysisFeature
        from azure.core.credentials import AzureKeyCredential
        from azure.core.exceptions import HttpResponseError, ServiceRequestError
        from azure.identity.aio import DefaultAzureCredential
    except ImportError as e:
        raise RuntimeError(
            f"Azure SDK packages not installed. Install azure-ai-documentintelligence and azure-identity: {e}"
        ) from e

    endpoint = settings.azure_docint_endpoint

    # When a key is configured, use key auth (AzureKeyCredential); otherwise fall
    # back to DefaultAzureCredential (Managed Identity / az login). AzureKeyCredential
    # is not an async context manager, so only DefaultAzureCredential needs closing.
    if settings.azure_docint_key:
        credential = AzureKeyCredential(settings.azure_docint_key)
    else:
        credential = DefaultAzureCredential()

    try:
        async with DocumentIntelligenceClient(endpoint, credential) as client:
            try:
                poller = await client.begin_analyze_document(
                    model_id="prebuilt-layout",
                    body=file_bytes,
                    features=[DocumentAnalysisFeature.LANGUAGES],
                    content_type="application/octet-stream",
                )
                result = await poller.result()
            except HttpResponseError as exc:
                status = exc.status_code
                if status in (401, 403):
                    raise AzureDIAuthError(
                        "Document Intelligence authentication failed", status_code=status
                    ) from exc
                elif status == 429:
                    retry_after = None
                    if exc.response and exc.response.headers:
                        retry_header = exc.response.headers.get("Retry-After")
                        if retry_header:
                            try:
                                retry_after = int(retry_header)
                            except ValueError:
                                pass
                    raise AzureDIThrottledError(
                        "Document Intelligence rate limit exceeded",
                        retry_after=retry_after,
                        status_code=status,
                    ) from exc
                else:
                    raise AzureDIError(
                        f"Document Intelligence error: {exc.message}", status_code=status
                    ) from exc
            except ServiceRequestError as exc:
                raise AzureDIError(
                    f"Could not reach Document Intelligence endpoint: {exc}", status_code=None
                ) from exc
    finally:
        # DefaultAzureCredential holds network sessions that must be closed;
        # AzureKeyCredential has no close() and needs no cleanup.
        close = getattr(credential, "close", None)
        if callable(close):
            await credential.close()

    # Extract metadata from result
    page_count = len(result.pages or [])
    table_count = len(result.tables or [])
    image_count = len(result.figures or [])

    detected_language: str | None = None
    if result.languages:
        best = max(result.languages, key=lambda lang: lang.confidence or 0.0)
        detected_language = best.locale

    # Extract text content for derived statistics
    content_text = result.content or ""
    total_char_count = len(content_text)
    word_count = count_words(content_text)
    sentence_count = count_sentences(content_text)

    # Compute total characters in table cells
    table_char_count = 0
    for table in result.tables or []:
        for cell in table.cells or []:
            cell_content = cell.content or ""
            table_char_count += len(cell_content)

    return AzureDIResult(
        page_count=page_count,
        language=detected_language,
        tables=table_count,
        images=image_count,
        word_count=word_count,
        sentence_count=sentence_count,
        total_char_count=total_char_count,
        table_char_count=table_char_count,
    )

import logging
import mimetypes
from dataclasses import dataclass
from pathlib import Path

from app.models import DocumentMetadata
from app.services.azure_document_intelligence import (
    AzureDIAuthError,
    AzureDIError,
    AzureDIThrottledError,
    extract_metadata as azure_di_extract,
    is_azure_di_configured,
)

logger = logging.getLogger(__name__)


@dataclass
class StoredDocument:
    path: Path
    metadata: DocumentMetadata


_DOCS: dict[str, StoredDocument] = {}


def register_document(doc_id: str, path: Path, metadata: DocumentMetadata) -> None:
    _DOCS[doc_id] = StoredDocument(path=path, metadata=metadata)


def get_document(doc_id: str) -> StoredDocument | None:
    return _DOCS.get(doc_id)


async def analyze_file(
    path: Path, original_name: str, file_bytes: bytes | None = None
) -> DocumentMetadata:
    """Analyze a document file and extract metadata.

    Uses Azure Document Intelligence when configured, falling back to local-only
    analysis if Azure DI is not configured or fails.

    Args:
        path: Path to the saved document file.
        original_name: Original filename from upload.
        file_bytes: Raw bytes of the file (optional, read from path if not provided).

    Returns:
        DocumentMetadata with extracted information.

    Raises:
        AzureDIAuthError: If Azure DI auth fails (caller should handle).
        AzureDIThrottledError: If Azure DI is rate-limited (caller should handle).
        AzureDIError: For other Azure DI errors (caller should handle).
    """
    size = path.stat().st_size
    mime, _ = mimetypes.guess_type(original_name)
    mime = mime or "application/octet-stream"

    # Start with local analysis
    page_count = _pdf_page_count(path) if mime == "application/pdf" else None
    is_scanned = _is_scanned_pdf(path) if mime == "application/pdf" else False
    language: str | None = None
    tables = 0
    images = 0
    has_tables = False

    # Try Azure Document Intelligence if configured
    if is_azure_di_configured():
        try:
            if file_bytes is None:
                file_bytes = path.read_bytes()

            azure_result = await azure_di_extract(file_bytes, mime)

            # Merge Azure DI results - prefer Azure values
            page_count = azure_result.page_count
            language = azure_result.language
            tables = azure_result.tables
            images = azure_result.images
            has_tables = tables > 0

            logger.info(
                "Azure DI extraction successful: pages=%d, language=%s, tables=%d, images=%d",
                page_count,
                language,
                tables,
                images,
            )
        except (AzureDIAuthError, AzureDIThrottledError):
            # Re-raise auth and throttle errors for route-level handling
            raise
        except AzureDIError as e:
            # Log and fall back to local analysis for other Azure DI errors
            logger.warning("Azure DI extraction failed, falling back to local analysis: %s", e)
        except RuntimeError as e:
            # SDK not installed or not configured properly
            logger.warning("Azure DI unavailable: %s", e)
    else:
        logger.info("Azure DI not configured, using local-only analysis")

    return DocumentMetadata(
        filename=original_name,
        size_bytes=size,
        mime_type=mime,
        page_count=page_count,
        language=language,
        has_tables=has_tables,
        is_scanned=is_scanned,
        tables=tables,
        images=images,
    )


def _pdf_page_count(path: Path) -> int | None:
    try:
        from pypdf import PdfReader

        return len(PdfReader(str(path)).pages)
    except Exception:
        return None


def _is_scanned_pdf(path: Path) -> bool:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        for page in reader.pages[:3]:
            if (page.extract_text() or "").strip():
                return False
        return True
    except Exception:
        return False

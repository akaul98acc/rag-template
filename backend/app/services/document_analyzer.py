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
from app.services.content_stats import (
    count_sentences,
    count_words,
    derive_content_stats,
)
from app.services.database import db_get_document, db_register_document

logger = logging.getLogger(__name__)


@dataclass
class StoredDocument:
    path: Path
    metadata: DocumentMetadata


async def register_document(
    doc_id: str,
    path: Path,
    metadata: DocumentMetadata,
    org_id: str | None = None,
    uploaded_by: str | None = None,
) -> None:
    """Persist a document record (PostgreSQL when configured, in-memory fallback)."""
    await db_register_document(
        doc_id=doc_id,
        file_path=path,
        metadata_dict=metadata.model_dump(),
        filename=metadata.filename,
        org_id=org_id,
        uploaded_by=uploaded_by,
    )


async def get_document(doc_id: str) -> StoredDocument | None:
    """Retrieve a document record by id."""
    row = await db_get_document(doc_id)
    if row is None:
        return None
    import json

    metadata_dict = json.loads(row.metadata_json)
    metadata = DocumentMetadata(**metadata_dict)
    return StoredDocument(path=Path(row.file_path), metadata=metadata)


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

    # Raw signals for derived stats (populated by Azure DI or local fallback)
    word_count = 0
    sentence_count = 0
    total_char_count = 0
    table_char_count = 0
    used_azure_di = False

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

            # Extract raw signals for derived stats
            word_count = azure_result.word_count
            sentence_count = azure_result.sentence_count
            total_char_count = azure_result.total_char_count
            table_char_count = azure_result.table_char_count
            used_azure_di = True

            logger.info(
                "[DI] Azure Document Intelligence USED for %s: pages=%d, language=%s, tables=%d, images=%d",
                original_name,
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
        except (RuntimeError, ImportError) as e:
            # SDK / async transport (e.g. aiohttp) not installed, or not configured properly
            logger.warning("[DI] Azure DI unavailable, falling back to local analysis: %s", e)
    else:
        logger.warning(
            "[DI] Azure DI NOT configured - using local pypdf fallback for %s "
            "(page_count from pypdf, language/tables/images unavailable)",
            original_name,
        )

    # Local fallback for text extraction if Azure DI was not used
    if not used_azure_di and mime == "application/pdf":
        extracted_text = _extract_pdf_text(path)
        if extracted_text:
            word_count = count_words(extracted_text)
            sentence_count = count_sentences(extracted_text)
            total_char_count = len(extracted_text)
            # table_char_count stays 0 - pypdf cannot detect tables

    # Compute derived content statistics
    content_stats = derive_content_stats(
        word_count=word_count,
        page_count=page_count,
        sentence_count=sentence_count,
        table_char_count=table_char_count,
        total_char_count=total_char_count,
        filename=original_name,
    )

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
        avg_words_per_page=content_stats["avg_words_per_page"],
        text_density=content_stats["text_density"],
        table_ratio=content_stats["table_ratio"],
        doc_type=content_stats["doc_type"],
        content_type=content_stats["content_type"],
        avg_sentence_length=content_stats["avg_sentence_length"],
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


def _extract_pdf_text(path: Path) -> str:
    """Extract all text content from a PDF using pypdf.

    Returns empty string if extraction fails or no text found.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text_parts: list[str] = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(page_text)
        return " ".join(text_parts)
    except Exception:
        return ""

"""Local metadata extraction using PyMuPDF, pdfplumber, and langdetect.

This module extracts document metadata without Azure Document Intelligence,
using local libraries for PDF parsing, table detection, and language detection.
"""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from app.models import DocumentMetadata
from app.services.content_stats import (
    count_sentences,
    count_words,
    derive_content_stats,
)

logger = logging.getLogger(__name__)

# Maximum pages to scan for tables (pdfplumber is slower than PyMuPDF)
# Balance between accuracy and performance (~0.3s target)
TABLE_SCAN_PAGE_LIMIT = 50


def extract_metadata_local(
    path: Path, original_name: str, content: bytes
) -> DocumentMetadata:
    """Extract document metadata using local libraries.

    Uses PyMuPDF for fast text/page/image extraction, pdfplumber for table detection,
    and langdetect for language identification. All extractors are wrapped in try/except
    with lazy imports so missing packages or parse failures degrade gracefully.

    Args:
        path: Path to the saved document file.
        original_name: Original filename from upload.
        content: Raw bytes of the file content.

    Returns:
        DocumentMetadata with extracted information.
    """
    # Basic metadata
    try:
        size_bytes = path.stat().st_size
    except Exception:
        size_bytes = len(content)

    # MIME type detection via filetype, fallback to mimetypes
    mime_type = detect_mime_type(content, original_name)

    # Initialize defaults
    page_count: int | None = None
    images = 0
    is_scanned = False
    language: str | None = None
    has_tables = False
    tables = 0
    table_char_count = 0
    full_text = ""
    first_page_text = ""

    # PDF-specific extraction
    if mime_type == "application/pdf":
        # Use PyMuPDF for pages, text, images (fast)
        pymupdf_result = _extract_with_pymupdf(path)
        if pymupdf_result is not None:
            page_count = pymupdf_result["page_count"]
            images = pymupdf_result["images"]
            full_text = pymupdf_result["full_text"]
            first_page_text = pymupdf_result["first_page_text"]
            is_scanned = pymupdf_result["is_scanned"]
        else:
            # Fallback to pypdf for page count and text
            page_count = _pdf_page_count_pypdf(path)
            full_text = _extract_pdf_text_pypdf(path)
            first_page_text = _extract_first_page_text_pypdf(path)
            is_scanned = _is_scanned_pdf_pypdf(path)

        # Use pdfplumber for table detection (slower, so limited page scan)
        table_result = _extract_tables_with_pdfplumber(path)
        tables = table_result["tables"]
        has_tables = tables > 0
        table_char_count = table_result["table_char_count"]

    # Language detection (first page only for speed and accuracy)
    language = _detect_language(first_page_text)

    # Compute raw signals
    word_count = count_words(full_text)
    sentence_count = count_sentences(full_text)
    total_char_count = len(full_text)

    # Compute derived content statistics
    content_stats = derive_content_stats(
        word_count=word_count,
        page_count=page_count,
        sentence_count=sentence_count,
        table_char_count=table_char_count,
        total_char_count=total_char_count,
        filename=original_name,
    )

    logger.info(
        "Local metadata extracted for %s: mime=%s, pages=%s, lang=%s, tables=%d, images=%d",
        original_name,
        mime_type,
        page_count,
        language,
        tables,
        images,
    )

    return DocumentMetadata(
        filename=original_name,
        size_bytes=size_bytes,
        mime_type=mime_type,
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


def detect_mime_type(content: bytes, filename: str) -> str:
    """Detect MIME type using filetype library, with mimetypes fallback.

    Shared by the upload route's validation and the stored metadata so both
    use the same detector and can never disagree.
    """
    try:
        import filetype

        kind = filetype.guess(content)
        if kind is not None:
            return kind.mime
    except Exception:
        pass

    # Fallback to mimetypes based on filename
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _extract_with_pymupdf(path: Path) -> dict | None:
    """Extract PDF metadata using PyMuPDF (fitz).

    Returns dict with page_count, images, full_text, first_page_text, is_scanned.
    Returns None if extraction fails.
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(str(path))
        page_count = doc.page_count
        total_images = 0
        text_parts: list[str] = []
        first_page_text = ""
        has_extractable_text = False

        for i, page in enumerate(doc):
            # Count images on this page
            total_images += len(page.get_images())

            # Extract text
            page_text = page.get_text() or ""
            if page_text.strip():
                text_parts.append(page_text)
                has_extractable_text = True

            # Capture first page text for language detection
            if i == 0:
                first_page_text = page_text

        doc.close()

        full_text = " ".join(text_parts)

        # Determine if scanned: has images but little/no extractable text
        is_scanned = total_images > 0 and not has_extractable_text

        return {
            "page_count": page_count,
            "images": total_images,
            "full_text": full_text,
            "first_page_text": first_page_text,
            "is_scanned": is_scanned,
        }
    except Exception:
        return None


def _extract_tables_with_pdfplumber(path: Path) -> dict:
    """Extract table information using pdfplumber.

    Scans up to TABLE_SCAN_PAGE_LIMIT pages for performance.
    Returns dict with tables (count) and table_char_count.
    """
    result = {"tables": 0, "table_char_count": 0}
    try:
        import pdfplumber

        with pdfplumber.open(str(path)) as pdf:
            # Limit page scan for performance (~0.3s target)
            pages_to_scan = pdf.pages[:TABLE_SCAN_PAGE_LIMIT]

            for page in pages_to_scan:
                found_tables = page.find_tables()
                result["tables"] += len(found_tables)

                # Sum characters from table cells
                for table in found_tables:
                    extracted = table.extract()
                    if extracted:
                        for row in extracted:
                            for cell in row:
                                if cell:
                                    result["table_char_count"] += len(str(cell))
    except Exception:
        pass

    return result


def _detect_language(text: str) -> str | None:
    """Detect language from text using langdetect.

    Returns None for empty/short text or on detection failure.
    Sets seed for deterministic results.
    """
    if not text or len(text.strip()) < 20:
        return None

    try:
        from langdetect import detect
        from langdetect import DetectorFactory

        # Set seed for deterministic results
        DetectorFactory.seed = 0

        return detect(text)
    except Exception:
        return None


# pypdf fallback functions (mirroring patterns from document_analyzer.py)


def _pdf_page_count_pypdf(path: Path) -> int | None:
    """Get PDF page count using pypdf as fallback."""
    try:
        from pypdf import PdfReader

        return len(PdfReader(str(path)).pages)
    except Exception:
        return None


def _extract_pdf_text_pypdf(path: Path) -> str:
    """Extract all text from PDF using pypdf as fallback."""
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


def _extract_first_page_text_pypdf(path: Path) -> str:
    """Extract first page text from PDF using pypdf as fallback."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        if reader.pages:
            return reader.pages[0].extract_text() or ""
        return ""
    except Exception:
        return ""


def _is_scanned_pdf_pypdf(path: Path) -> bool:
    """Check if PDF is scanned using pypdf as fallback."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        for page in reader.pages[:3]:
            if (page.extract_text() or "").strip():
                return False
        return True
    except Exception:
        return False

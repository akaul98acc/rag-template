import mimetypes
from dataclasses import dataclass
from pathlib import Path

from app.models import DocumentMetadata


@dataclass
class StoredDocument:
    path: Path
    metadata: DocumentMetadata


_DOCS: dict[str, StoredDocument] = {}


def register_document(doc_id: str, path: Path, metadata: DocumentMetadata) -> None:
    _DOCS[doc_id] = StoredDocument(path=path, metadata=metadata)


def get_document(doc_id: str) -> StoredDocument | None:
    return _DOCS.get(doc_id)


def analyze_file(path: Path, original_name: str) -> DocumentMetadata:
    size = path.stat().st_size
    mime, _ = mimetypes.guess_type(original_name)
    mime = mime or "application/octet-stream"

    page_count = _pdf_page_count(path) if mime == "application/pdf" else None
    is_scanned = _is_scanned_pdf(path) if mime == "application/pdf" else False

    return DocumentMetadata(
        filename=original_name,
        size_bytes=size,
        mime_type=mime,
        page_count=page_count,
        language=None,
        has_tables=False,
        is_scanned=is_scanned,
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

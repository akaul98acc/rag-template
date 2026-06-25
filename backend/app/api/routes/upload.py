import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings, SUPPORTED_MIME_TYPES
from app.models import UploadResponse
from app.services.document_analyzer import register_document
from app.services.local_metadata import detect_mime_type, extract_metadata_local

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    """Upload a document and extract metadata.

    Validates file size, MIME type, and non-empty content before processing.
    Uses local libraries (PyMuPDF, pdfplumber, langdetect) for metadata extraction.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename missing")

    # Read file content
    content = await file.read()

    # Validate: empty file
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Validate: file size
    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.max_upload_size_mb} MB",
        )

    # Determine MIME type using the same detector that produces the stored
    # metadata (magic bytes via filetype, mimetypes fallback) so validation
    # and metadata.mime_type can never disagree.
    mime_type = detect_mime_type(content, file.filename)

    # Validate: supported MIME type
    if mime_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=415, detail=f"Unsupported file type: {mime_type}"
        )

    # Save file
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    doc_id = uuid.uuid4().hex
    dest = Path(settings.upload_dir) / f"{doc_id}_{file.filename}"
    dest.write_bytes(content)

    # Extract metadata using local libraries
    metadata = extract_metadata_local(dest, file.filename, content)

    await register_document(doc_id, dest, metadata)
    return UploadResponse(doc_id=doc_id, metadata=metadata)

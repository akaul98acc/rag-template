import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings, SUPPORTED_MIME_TYPES
from app.models import UploadResponse
from app.services.azure_document_intelligence import (
    AzureDIAuthError,
    AzureDIError,
    AzureDIThrottledError,
)
from app.services.document_analyzer import analyze_file, register_document

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    """Upload a document and extract metadata.

    Validates file size, MIME type, and non-empty content before processing.
    Uses Azure Document Intelligence when configured for enhanced metadata extraction.
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

    # Determine MIME type: prefer UploadFile.content_type, fall back to extension guess
    mime_type = file.content_type
    if not mime_type or mime_type == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename)
        mime_type = guessed or "application/octet-stream"

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

    # Analyze document
    try:
        metadata = await analyze_file(dest, original_name=file.filename, file_bytes=content)
    except AzureDIAuthError as e:
        raise HTTPException(
            status_code=502, detail="Document Intelligence authentication failed"
        ) from e
    except AzureDIThrottledError as e:
        detail: dict[str, str | int] = {"detail": "Document Intelligence rate limit exceeded"}
        if e.retry_after is not None:
            detail["retry_after"] = e.retry_after
        raise HTTPException(status_code=503, detail=detail) from e  # type: ignore[arg-type]
    except AzureDIError as e:
        raise HTTPException(
            status_code=502, detail=f"Document Intelligence error: {e.message}"
        ) from e

    register_document(doc_id, dest, metadata)
    return UploadResponse(doc_id=doc_id, metadata=metadata)

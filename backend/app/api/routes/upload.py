import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings
from app.models import UploadResponse
from app.services.document_analyzer import analyze_file, register_document

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename missing")

    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    doc_id = uuid.uuid4().hex
    dest = Path(settings.upload_dir) / f"{doc_id}_{file.filename}"

    content = await file.read()
    dest.write_bytes(content)

    metadata = analyze_file(dest, original_name=file.filename)
    register_document(doc_id, dest, metadata)
    return UploadResponse(doc_id=doc_id, metadata=metadata)

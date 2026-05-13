from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    filename: str
    size_bytes: int
    mime_type: str
    page_count: int | None = None
    language: str | None = None
    has_tables: bool = False
    is_scanned: bool = False


class UploadResponse(BaseModel):
    doc_id: str = Field(..., description="Server-generated identifier for the uploaded document")
    metadata: DocumentMetadata

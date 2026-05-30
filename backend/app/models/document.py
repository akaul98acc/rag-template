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


class UploadResponse(BaseModel):
    """Response returned by POST /api/upload."""

    doc_id: str = Field(..., description="Server-generated identifier for the uploaded document")
    metadata: DocumentMetadata


class AzureDIResult(BaseModel):
    """Internal DTO carrying Azure Document Intelligence extraction results.

    Not exported in __init__.py - for internal service use only.
    """

    page_count: int
    language: str | None
    tables: int
    images: int

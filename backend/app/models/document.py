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

    # Derived content statistics
    avg_words_per_page: float | None = Field(
        default=None, description="Total word count / page count"
    )
    text_density: str | None = Field(
        default=None,
        description="Text density classification: 'high' (>500 words/page), 'medium' (200-500), 'low' (<200)",
    )
    table_ratio: float | None = Field(
        default=None,
        description="Fraction of document content in tables, [0.0, 1.0]",
    )
    doc_type: str | None = Field(
        default=None,
        description="Inferred document type based on filename and structure",
    )
    content_type: str | None = Field(
        default=None,
        description="Content classification: 'structured', 'prose', or 'mixed'",
    )
    avg_sentence_length: float | None = Field(
        default=None,
        description="Average words per sentence",
    )


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

    # Raw signals for derived content statistics
    word_count: int = Field(default=0, description="Total word count from document text")
    sentence_count: int = Field(
        default=0, description="Total sentence count from document text"
    )
    total_char_count: int = Field(
        default=0, description="Total character count from result.content"
    )
    table_char_count: int = Field(
        default=0, description="Total character count from table cells"
    )

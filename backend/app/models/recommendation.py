from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RecommendationRecord(BaseModel):
    """Internal record passed to recommendation_store.save_recommendation()."""

    rec_id: str
    doc_id: str | None
    source: Literal["llm", "rules", "ml"]
    model_version: str
    confidence: float | None
    raw_llm_response: dict | None
    # Metadata features
    filename: str | None
    size_bytes: int | None
    page_count: int | None
    is_scanned: bool | None
    has_tables: bool | None
    table_count: int | None
    image_count: int | None
    doc_type: str | None
    content_type: str | None
    text_density: str | None
    avg_words_per_page: float | None
    table_ratio: float | None
    avg_sentence_length: float | None
    # Labels
    chunking_strategy: str
    chunk_size: int
    overlap: int
    embedding_model: str
    llm_model: str
    top_k: int
    rationale: str | None


class FeedbackRequest(BaseModel):
    recommendation_id: str = Field(..., description="UUID of the recommendation to give feedback on")
    outcome: Literal["accepted", "modified", "rejected"]
    notes: str | None = None
    final_chunking_strategy: str | None = None
    final_chunk_size: int | None = None
    final_overlap: int | None = None
    final_embedding_model: str | None = None
    final_llm_model: str | None = None
    final_top_k: int | None = None


class FeedbackResponse(BaseModel):
    status: Literal["ok"] = "ok"

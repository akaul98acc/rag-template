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
    rating: int = Field(..., ge=1, le=5, description="Star rating 1-5")
    phase: int = Field(..., ge=1, le=2, description="1 = Phase 1 (pipeline strategy), 2 = Phase 2 (providers)")
    outcome: Literal["accepted", "modified", "rejected"] = "accepted"
    notes: str | None = None
    final_values: dict | None = None


class FeedbackResponse(BaseModel):
    status: Literal["ok"] = "ok"

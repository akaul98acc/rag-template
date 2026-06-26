from fastapi import APIRouter

from app.models import HistoryItem, HistoryResponse
from app.models.document import DocumentMetadata
from app.models.strategy import PipelineRecommendation, ProviderRecommendation
from app.services.database import db_get_history

router = APIRouter()


@router.get("/history", response_model=HistoryResponse)
async def get_history() -> HistoryResponse:
    rows = await db_get_history()
    items = []
    for row in rows:
        rec = None
        if row.get("chunking_strategy"):
            try:
                rec = PipelineRecommendation(
                    embedding_model=row["embedding_model"],
                    llm_model=row["llm_model"],
                    chunking_strategy=row["chunking_strategy"],
                    chunk_size=row["chunk_size"],
                    overlap=row["overlap"],
                    top_k=row["top_k"],
                    rationale=row["rationale"] or "",
                    confidence=row["confidence"] or 0.0,
                    source=row["source"],
                    recommendation_id=str(row["recommendation_id"]) if row.get("recommendation_id") else None,
                )
            except Exception:
                rec = None

        prov_rec = None
        if row.get("provider_recommendation"):
            try:
                prov_rec = ProviderRecommendation(**row["provider_recommendation"])
            except Exception:
                prov_rec = None

        items.append(
            HistoryItem(
                doc_id=row["doc_id"],
                filename=row["filename"],
                uploaded_at=row["created_at"],
                metadata=DocumentMetadata(**row["metadata"]),
                recommendation=rec,
                provider_recommendation=prov_rec,
            )
        )
    return HistoryResponse(items=items)

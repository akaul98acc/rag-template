from fastapi import APIRouter, HTTPException

from app.models import ProviderRecommendation, RecommendRequest
from app.services.database import db_save_provider_recommendation
from app.services.document_analyzer import get_document
from app.services.provider_recommender import recommend_providers

router = APIRouter()

_UPLOAD_AGAIN = "Document not found or expired — please upload the document again."


@router.post("/recommend-providers", response_model=ProviderRecommendation)
async def recommend_providers_route(req: RecommendRequest) -> ProviderRecommendation:
    doc = await get_document(req.doc_id)
    if doc is None:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)
    meta = doc.metadata
    if not meta.filename or not meta.size_bytes or not meta.mime_type:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)
    rec = await recommend_providers(meta, force_fresh=req.force_fresh)
    if rec.source != "past_recommendations":
        rec_id = await db_save_provider_recommendation(req.doc_id, rec.model_dump())
        rec = rec.model_copy(update={"recommendation_id": rec_id})
    return rec

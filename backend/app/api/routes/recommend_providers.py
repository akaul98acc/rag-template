from fastapi import APIRouter, HTTPException

from app.models import ProviderRecommendation, RecommendRequest
from app.services.document_analyzer import get_document
from app.services.provider_recommender import recommend_providers

router = APIRouter()

_UPLOAD_AGAIN = "Document not found or expired — please upload the document again."


@router.post("/recommend-providers", response_model=ProviderRecommendation)
async def recommend_providers_route(req: RecommendRequest) -> ProviderRecommendation:
    doc = get_document(req.doc_id)
    if doc is None:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)
    meta = doc.metadata
    if not meta.filename or not meta.size_bytes or not meta.mime_type:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)
    return await recommend_providers(meta)

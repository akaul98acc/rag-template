from fastapi import APIRouter, HTTPException

from app.models import PipelineRecommendation, RecommendRequest
from app.services.document_analyzer import get_document
from app.services.pipeline_recommender import recommend_pipeline

router = APIRouter()

_UPLOAD_AGAIN = "Document not found or expired — please upload the document again."


@router.post("/recommend", response_model=PipelineRecommendation)
async def recommend(req: RecommendRequest) -> PipelineRecommendation:
    doc = get_document(req.doc_id)
    if doc is None:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)

    meta = doc.metadata
    # Core fields must be present to make any recommendation. Other fields
    # (page_count, language, derived stats) may be None for images/scanned PDFs.
    if not meta.filename or not meta.size_bytes or not meta.mime_type:
        raise HTTPException(status_code=422, detail=_UPLOAD_AGAIN)

    return await recommend_pipeline(meta)

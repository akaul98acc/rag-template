from fastapi import APIRouter, HTTPException

from app.models import AnalyzeRequest, StrategyRecommendation
from app.services.document_analyzer import get_document
from app.services.strategy_agent import recommend_strategy

router = APIRouter()


@router.post("/analyze", response_model=StrategyRecommendation)
async def analyze(req: AnalyzeRequest) -> StrategyRecommendation:
    doc = get_document(req.doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="unknown doc_id")
    return await recommend_strategy(doc.metadata)

from fastapi import APIRouter, HTTPException, Query

from app.models import FeedbackRequest, FeedbackResponse
from app.services.recommendation_store import get_feedback_rating, save_feedback

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest) -> FeedbackResponse:
    result = await save_feedback(req)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Recommendation not found.")
    return FeedbackResponse()


@router.get("/feedback/{recommendation_id}")
async def get_feedback(
    recommendation_id: str,
    phase: int = Query(..., ge=1, le=2),
) -> dict:
    rating = await get_feedback_rating(recommendation_id, phase)
    return {"rating": rating}

from fastapi import APIRouter, HTTPException

from app.models import FeedbackRequest, FeedbackResponse
from app.services.recommendation_store import save_feedback

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest) -> FeedbackResponse:
    result = await save_feedback(req)
    if result == "not_found":
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )
    if result == "duplicate":
        raise HTTPException(
            status_code=409,
            detail="Feedback already submitted for this recommendation.",
        )
    return FeedbackResponse()

from fastapi import APIRouter, HTTPException

from app.models import GenerateRequest, GenerateResponse
from app.services.code_generator import render_pipeline

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    try:
        return render_pipeline(req.selections)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"unknown provider: {exc.args[0]}") from exc

from fastapi import APIRouter, HTTPException

from app.models import GenerateRequest, NotebookResponse
from app.services.notebook_generator import render_notebook

router = APIRouter()


@router.post("/generate-notebook", response_model=NotebookResponse)
def generate_notebook(req: GenerateRequest) -> NotebookResponse:
    try:
        notebook = render_notebook(req.selections, req.params)
        return NotebookResponse(notebook=notebook)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"unknown provider: {exc.args[0]}") from exc

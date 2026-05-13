from fastapi import APIRouter

from app.providers import full_catalog

router = APIRouter()


@router.get("/providers")
def list_providers() -> dict:
    return full_catalog()

from __future__ import annotations

from fastapi import APIRouter

from app.services.database import db_list_roles

router = APIRouter()


@router.get("/roles")
async def list_roles() -> list[dict]:
    return await db_list_roles()

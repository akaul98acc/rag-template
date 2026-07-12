from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.roles import RoleCreate, RoleListResponse, RoleResponse, RoleUpdate
from app.services.database import (
    _SEEDED_ROLE_NAMES,
    db_check_role_name,
    db_count_users_for_role,
    db_create_role,
    db_delete_role,
    db_get_role,
    db_list_roles,
    db_update_role,
)

router = APIRouter()


@router.get("/roles", response_model=RoleListResponse)
async def list_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
) -> RoleListResponse:
    result = await db_list_roles(page=page, page_size=page_size, search=search or None)
    return RoleListResponse(**result)


@router.post("/roles", response_model=RoleResponse, status_code=201)
async def create_role(body: RoleCreate) -> RoleResponse:
    taken = await db_check_role_name(body.name)
    if taken:
        raise HTTPException(status_code=409, detail="Role name already exists")
    try:
        row = await db_create_role({"name": body.name})
    except Exception:
        raise HTTPException(status_code=409, detail="Role name already exists")
    return RoleResponse(**row)


# check-name MUST be declared before /{role_id} so FastAPI matches it first
@router.get("/roles/check-name")
async def check_role_name(name: str = Query(...)) -> dict:
    taken = await db_check_role_name(name)
    return {"available": not taken}


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(role_id: str) -> RoleResponse:
    row = await db_get_role(role_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return RoleResponse(**row)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(role_id: str, body: RoleUpdate) -> RoleResponse:
    existing = await db_get_role(role_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if existing["name"] in _SEEDED_ROLE_NAMES:
        raise HTTPException(status_code=403, detail="Seeded roles cannot be edited")
    if body.name.lower() != existing["name"].lower():
        taken = await db_check_role_name(body.name)
        if taken:
            raise HTTPException(status_code=409, detail="Role name already exists")
    row = await db_update_role(role_id, {"name": body.name})
    if row is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return RoleResponse(**row)


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(role_id: str) -> None:
    existing = await db_get_role(role_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if existing["name"] in _SEEDED_ROLE_NAMES:
        raise HTTPException(status_code=403, detail="Seeded roles cannot be deleted")
    user_count = await db_count_users_for_role(role_id)
    if user_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role assigned to {user_count} active user(s)",
        )
    await db_delete_role(role_id)

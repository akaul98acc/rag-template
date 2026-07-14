from __future__ import annotations

import psycopg2
import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.api.deps import ScopedSession, get_or_404, get_scoped_session
from app.models.users import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.database import (
    db_check_email,
    db_create_user,
    db_delete_user,
    db_get_role,
    db_get_user,
    db_list_users,
    db_update_user,
)

router = APIRouter()


def validate_user_org_role(role_name: str, org_id: str | None) -> None:
    """Raise HTTP 422 if org_id is absent for a non-Super-Admin role."""
    if role_name != "Super Admin" and not org_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="org_id is required for non-Super-Admin users",
        )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    session: ScopedSession = Depends(get_scoped_session),
) -> UserListResponse:
    result = await db_list_users(
        page=page, page_size=page_size, search=search, org_id_filter=session.org_id_filter
    )
    return UserListResponse(**result)


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate) -> UserResponse:
    role = await db_get_role(body.role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="role_id does not exist")
    validate_user_org_role(role["name"], body.org_id)
    try:
        row = await db_create_user(
            {**body.model_dump(), "created_by": "system", "updated_by": "system"}
        )
    except (psycopg2.errors.UniqueViolation, ValueError):
        raise HTTPException(status_code=409, detail="email already exists")
    return UserResponse(**row)


@router.get("/users/check-email")  # must come BEFORE /{user_id}
async def check_email(email: str = Query(..., min_length=1)) -> dict:
    taken = await db_check_email(email)
    return {"available": not taken}


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str) -> UserResponse:
    row = await get_or_404(db_get_user(user_id), detail="User not found")
    return UserResponse(**row)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, body: UserUpdate) -> UserResponse:
    row = await get_or_404(
        db_update_user(user_id, {**body.model_dump(), "updated_by": "system"}),
        detail="User not found",
    )
    return UserResponse(**row)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str) -> Response:
    deleted = await db_delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=204)

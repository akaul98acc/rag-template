from __future__ import annotations

import psycopg2
import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.models.users import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.database import (
    db_check_email,
    db_create_user,
    db_delete_user,
    db_get_user,
    db_list_users,
    db_update_user,
)

router = APIRouter()


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
) -> UserListResponse:
    result = await db_list_users(page=page, page_size=page_size, search=search)
    return UserListResponse(**result)


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate) -> UserResponse:
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
    row = await db_get_user(user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**row)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, body: UserUpdate) -> UserResponse:
    row = await db_update_user(user_id, {**body.model_dump(), "updated_by": "system"})
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**row)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str) -> Response:
    deleted = await db_delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=204)

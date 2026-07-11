from __future__ import annotations

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str
    phone_number: str | None = None
    org_id: str
    role_id: str


class UserUpdate(BaseModel):
    name: str
    phone_number: str | None = None
    role_id: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone_number: str | None
    org_id: str | None
    org_name: str | None = None
    role_id: str | None
    role_name: str | None = None
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str
    deleted_by: str | None
    deleted_on: str | None


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int

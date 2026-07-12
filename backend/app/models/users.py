from __future__ import annotations

from pydantic import BaseModel

from app.models.base import AuditBase, SoftDeleteMixin


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


class UserResponse(AuditBase, SoftDeleteMixin):
    id: str
    name: str
    email: str
    phone_number: str | None
    org_id: str | None
    org_name: str | None = None
    role_id: str | None
    role_name: str | None = None


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int

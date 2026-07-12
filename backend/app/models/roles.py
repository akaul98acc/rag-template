from __future__ import annotations

from pydantic import BaseModel

from app.models.base import AuditBase, SoftDeleteMixin


class RoleCreate(BaseModel):
    name: str


class RoleUpdate(BaseModel):
    name: str


class RoleResponse(AuditBase, SoftDeleteMixin):
    id: str
    name: str


class RoleListResponse(BaseModel):
    items: list[RoleResponse]
    total: int
    page: int
    page_size: int

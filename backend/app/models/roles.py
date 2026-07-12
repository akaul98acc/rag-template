from __future__ import annotations

from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str


class RoleUpdate(BaseModel):
    name: str


class RoleResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str
    deleted_by: str | None
    deleted_on: str | None


class RoleListResponse(BaseModel):
    items: list[RoleResponse]
    total: int
    page: int
    page_size: int

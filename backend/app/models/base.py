from __future__ import annotations

from pydantic import BaseModel


class AuditBase(BaseModel):
    created_by: str
    created_on: str
    updated_by: str
    updated_on: str


class SoftDeleteMixin(BaseModel):
    deleted_by: str | None
    deleted_on: str | None

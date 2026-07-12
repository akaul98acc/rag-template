from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

from app.models.base import AuditBase


class PlanType(str, Enum):
    free = "free"
    pro = "pro"
    team = "team"
    enterprise = "enterprise"


class OrganizationCreate(BaseModel):
    name: str
    org_code: str
    website: str | None = None
    phone_number: str | None = None
    contact_person: str
    plan_selected: PlanType
    created_from: str | None = None


class OrganizationUpdate(BaseModel):
    name: str
    website: str | None = None
    phone_number: str | None = None
    contact_person: str
    plan_selected: PlanType


class OrganizationResponse(AuditBase):
    org_id: str
    name: str
    org_code: str
    website: str | None
    phone_number: str | None
    contact_person: str
    plan_selected: str
    created_from: str | None


class OrganizationListResponse(BaseModel):
    items: list[OrganizationResponse]
    total: int
    page: int
    page_size: int

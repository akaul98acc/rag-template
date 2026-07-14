from __future__ import annotations

import psycopg2
import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.models.organization import (
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.api.deps import get_or_404, require_super_admin
from app.services.database import (
    db_check_org_code,
    db_create_organization,
    db_delete_organization,
    db_get_organization,
    db_list_organizations,
    db_update_organization,
)

router = APIRouter()


@router.get("/organizations", response_model=OrganizationListResponse)
async def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    plan: str | None = Query(None),
    _: dict = Depends(require_super_admin),
) -> OrganizationListResponse:
    result = await db_list_organizations(
        page=page, page_size=page_size, search=search, plan=plan
    )
    return OrganizationListResponse(**result)


@router.post("/organizations", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    _: dict = Depends(require_super_admin),
) -> OrganizationResponse:
    try:
        row = await db_create_organization(
            {**body.model_dump(), "created_by": "system", "updated_by": "system"}
        )
    except (psycopg2.errors.UniqueViolation, ValueError):
        raise HTTPException(status_code=409, detail="org_code already exists")
    return OrganizationResponse(**row)


@router.get("/organizations/check-org-code")
async def check_org_code(
    org_code: str = Query(..., min_length=1),
    _: dict = Depends(require_super_admin),
) -> dict:
    """Returns {"available": true} if the org_code is not taken, {"available": false} otherwise."""
    taken = await db_check_org_code(org_code)
    return {"available": not taken}


@router.get("/organizations/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str) -> OrganizationResponse:
    row = await get_or_404(db_get_organization(org_id), detail="Organization not found")
    return OrganizationResponse(**row)


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    _: dict = Depends(require_super_admin),
) -> OrganizationResponse:
    row = await get_or_404(
        db_update_organization(org_id, {**body.model_dump(), "updated_by": "system"}),
        detail="Organization not found",
    )
    return OrganizationResponse(**row)


@router.delete("/organizations/{org_id}", status_code=204)
async def delete_organization(
    org_id: str,
    _: dict = Depends(require_super_admin),
) -> Response:
    deleted = await db_delete_organization(org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Organization not found")
    return Response(status_code=204)

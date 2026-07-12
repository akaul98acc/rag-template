"""Authentication routes — public endpoints (no JWT required)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.auth_service import create_access_token
from app.services.database import db_get_pending_otp, db_get_user_by_email_and_org, db_mark_otp_used
from app.services.otp_service import create_and_send_otp, verify_otp_hash

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    org_code: str


class VerifyOtpRequest(BaseModel):
    email: str
    org_code: str
    otp: str


class LoginResponse(BaseModel):
    message: str
    masked_phone: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


def _mask_phone(phone: str) -> str:
    digits = phone[-4:] if len(phone) >= 4 else phone
    return f"***-***-{digits}"


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    """Step 1 — validate email + org code, send OTP to registered phone number."""
    user = await db_get_user_by_email_and_org(body.email, body.org_code)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    phone = user.get("phone_number")
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No phone number on file for this account",
        )
    await create_and_send_otp(user["id"], phone)
    return LoginResponse(message="OTP sent", masked_phone=_mask_phone(phone))


@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(body: VerifyOtpRequest) -> TokenResponse:
    """Step 2 — verify OTP and issue a JWT."""
    user = await db_get_user_by_email_and_org(body.email, body.org_code)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    otp_row = await db_get_pending_otp(user["id"])
    if otp_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP expired or not found",
        )
    if not verify_otp_hash(body.otp, otp_row["otp_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP",
        )
    await db_mark_otp_used(otp_row["id"])

    from app.core.config import settings

    token = create_access_token(
        user_id=user["id"],
        email=user["email"],
        org_id=user.get("org_id") or "",
        org_code=user.get("org_code") or "",
        role=user.get("role_name") or "",
    )
    return TokenResponse(access_token=token, expires_in=settings.jwt_expire_minutes * 60)

"""JWT creation and decoding for the RAG Builder auth layer."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


def create_access_token(
    user_id: str,
    email: str,
    org_id: str,
    org_code: str,
    role: str,
) -> str:
    """Encode a signed JWT with the user's identity and role name."""
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "user_id": user_id,
        "email": email,
        "org_id": org_id,
        "org_code": org_code,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jose.JWTError on invalid or expired token."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

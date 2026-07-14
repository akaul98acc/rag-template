from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.services.auth_service import decode_access_token


async def get_or_404(coro: Any, detail: str = "Not found") -> dict:
    """Await a DB getter coroutine and raise 404 if the result is None."""
    row = await coro
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return row


_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — decode JWT and return claims dict, or raise 401."""
    try:
        return decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


@dataclass
class ScopedSession:
    org_id_filter: str | None


def build_scoped_session(role: str, org_id: str | None) -> ScopedSession:
    """Pure function — derive org scope from JWT claims.

    Returns ScopedSession(org_id_filter=None) for Super Admin (unscoped).
    Raises HTTP 403 if org_id is empty and the role is not Super Admin.
    """
    if role == "Super Admin":
        return ScopedSession(org_id_filter=None)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: no organization assigned to this account",
        )
    return ScopedSession(org_id_filter=org_id)


async def get_scoped_session(
    current_user: dict = Depends(get_current_user),
) -> ScopedSession:
    """FastAPI dependency — build a ScopedSession from JWT claims."""
    return build_scoped_session(
        role=current_user.get("role", ""),
        org_id=current_user.get("org_id") or None,
    )


async def require_super_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """FastAPI dependency — raise 403 unless the caller is a Super Admin."""
    if current_user.get("role") != "Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Super Admin role required",
        )
    return current_user

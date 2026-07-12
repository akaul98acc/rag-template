from __future__ import annotations

from typing import Any

from fastapi import HTTPException


async def get_or_404(coro: Any, detail: str = "Not found") -> dict:
    """Await a DB getter coroutine and raise 404 if the result is None."""
    row = await coro
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return row

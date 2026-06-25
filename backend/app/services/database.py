"""PostgreSQL-backed document store.

Provides the same register_document / get_document interface as the old
in-memory dict, but persists records to a ``documents`` table.  When
DATABASE_URL is not configured the module falls back to the in-memory
implementation so the app continues to work without a database.

Connection lifecycle
--------------------
Call ``init_db()`` on application startup and ``close_db()`` on shutdown.
Both are async-safe and idempotent.  The module uses a single
``psycopg2`` connection wrapped in a threading lock — the FastAPI app is
async but psycopg2 is synchronous; every DB call is wrapped in
``asyncio.to_thread`` to avoid blocking the event loop.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_conn: Any = None  # psycopg2 connection or None

# In-memory fallback — used when DATABASE_URL is not set or DB is unavailable
_DOCS_FALLBACK: dict[str, "_StoredDocumentRow"] = {}


@dataclass
class _StoredDocumentRow:
    doc_id: str
    filename: str
    file_path: str
    metadata_json: str  # JSON-serialised DocumentMetadata


# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id      TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    metadata    JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------


def _open_connection(database_url: str) -> Any:
    """Open and return a psycopg2 connection (synchronous, run in thread)."""
    import psycopg2  # lazy import — only needed when DB is configured
    import psycopg2.extras  # registers UUID / JSON adapters

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    return conn


def _ensure_schema(conn: Any) -> None:
    """Run CREATE TABLE IF NOT EXISTS (synchronous)."""
    with conn.cursor() as cur:
        cur.execute(_CREATE_TABLE_SQL)


async def init_db(database_url: str) -> None:
    """Initialise the connection pool and create the schema.

    Safe to call multiple times; subsequent calls are no-ops.
    """
    global _conn

    def _setup() -> None:
        global _conn
        with _lock:
            if _conn is not None:
                return
            conn = _open_connection(database_url)
            _ensure_schema(conn)
            _conn = conn
            logger.info("PostgreSQL document store initialised")

    await asyncio.to_thread(_setup)


async def close_db() -> None:
    """Close the database connection gracefully."""
    global _conn

    def _close() -> None:
        global _conn
        with _lock:
            if _conn is not None:
                try:
                    _conn.close()
                except Exception:
                    pass
                _conn = None
                logger.info("PostgreSQL connection closed")

    await asyncio.to_thread(_close)


# ---------------------------------------------------------------------------
# Public document-store API
# ---------------------------------------------------------------------------


async def db_register_document(
    doc_id: str,
    file_path: Path,
    metadata_dict: dict[str, Any],
    filename: str,
) -> None:
    """Persist a document record to PostgreSQL (or in-memory fallback)."""
    if _conn is None:
        # Fallback: store in memory
        _DOCS_FALLBACK[doc_id] = _StoredDocumentRow(
            doc_id=doc_id,
            filename=filename,
            file_path=str(file_path),
            metadata_json=json.dumps(metadata_dict),
        )
        return

    metadata_json = json.dumps(metadata_dict)
    path_str = str(file_path)

    def _insert() -> None:
        with _lock:
            with _conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO documents (doc_id, filename, file_path, metadata)
                    VALUES (%s, %s, %s, %s::jsonb)
                    ON CONFLICT (doc_id) DO UPDATE
                        SET filename  = EXCLUDED.filename,
                            file_path = EXCLUDED.file_path,
                            metadata  = EXCLUDED.metadata
                    """,
                    (doc_id, filename, path_str, metadata_json),
                )

    await asyncio.to_thread(_insert)


async def db_get_document(doc_id: str) -> _StoredDocumentRow | None:
    """Fetch a document record from PostgreSQL (or in-memory fallback)."""
    if _conn is None:
        return _DOCS_FALLBACK.get(doc_id)

    def _select() -> _StoredDocumentRow | None:
        with _lock:
            with _conn.cursor() as cur:
                cur.execute(
                    "SELECT doc_id, filename, file_path, metadata FROM documents WHERE doc_id = %s",
                    (doc_id,),
                )
                row = cur.fetchone()
        if row is None:
            return None
        doc_id_r, filename_r, file_path_r, metadata_r = row
        # psycopg2 returns JSONB as a Python dict when psycopg2.extras is
        # imported; serialise back to a JSON string for a uniform interface.
        if isinstance(metadata_r, dict):
            metadata_json = json.dumps(metadata_r)
        else:
            metadata_json = metadata_r
        return _StoredDocumentRow(
            doc_id=doc_id_r,
            filename=filename_r,
            file_path=file_path_r,
            metadata_json=metadata_json,
        )

    return await asyncio.to_thread(_select)

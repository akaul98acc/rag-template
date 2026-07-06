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
_conn: Any = None          # psycopg2 connection or None
_database_url: str | None = None  # stored on init so reconnect can reuse it

# In-memory fallback — used when DATABASE_URL is not set or DB is unavailable
_DOCS_FALLBACK: dict[str, "_StoredDocumentRow"] = {}

# In-memory fallback for provider recommendations (keyed by doc_id)
_PROVIDER_RECS_FALLBACK: dict[str, dict] = {}


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

_CREATE_RECOMMENDATIONS_SQL = """
CREATE TABLE IF NOT EXISTS recommendations (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id               TEXT        REFERENCES documents(doc_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source               TEXT        NOT NULL CHECK (source IN ('llm', 'rules', 'ml')),
    model_version        TEXT        NOT NULL,
    confidence           FLOAT       CHECK (confidence BETWEEN 0 AND 1),
    raw_llm_response     JSONB,
    filename             TEXT,
    size_bytes           BIGINT,
    page_count           INT,
    is_scanned           BOOLEAN,
    has_tables           BOOLEAN,
    table_count          INT,
    image_count          INT,
    doc_type             TEXT,
    content_type         TEXT,
    text_density         TEXT,
    avg_words_per_page   FLOAT,
    table_ratio          FLOAT,
    avg_sentence_length  FLOAT,
    chunking_strategy    TEXT        NOT NULL,
    chunk_size           INT         NOT NULL,
    overlap              INT         NOT NULL,
    embedding_model      TEXT        NOT NULL,
    llm_model            TEXT        NOT NULL,
    top_k                INT         NOT NULL,
    rationale            TEXT
);
CREATE INDEX IF NOT EXISTS idx_recommendations_source     ON recommendations(source);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_doc_id     ON recommendations(doc_id);
"""

_CREATE_RECOMMENDATION_FEEDBACK_SQL = """
CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id        UUID        NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome                  TEXT        NOT NULL CHECK (outcome IN ('accepted', 'modified', 'rejected')),
    notes                    TEXT,
    final_chunking_strategy  TEXT,
    final_chunk_size         INT,
    final_overlap            INT,
    final_embedding_model    TEXT,
    final_llm_model          TEXT,
    final_top_k              INT,
    UNIQUE (recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_recommendation_id ON recommendation_feedback(recommendation_id);
"""

# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------


def _open_connection(database_url: str) -> Any:
    """Open and return a psycopg2 connection (synchronous, run in thread)."""
    import psycopg2  # lazy import — only needed when DB is configured
    import psycopg2.extras  # registers UUID / JSON adapters

    conn = psycopg2.connect(database_url, connect_timeout=10)
    conn.autocommit = True
    return conn


def _reconnect_locked() -> None:
    """Re-open a dropped connection. Caller must already hold _lock."""
    global _conn
    if _database_url is None:
        raise RuntimeError("Cannot reconnect: DATABASE_URL was never set")
    try:
        if _conn is not None:
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None
        conn = _open_connection(_database_url)
        _ensure_schema(conn)
        _conn = conn
        logger.info("PostgreSQL connection re-established")
    except Exception as exc:
        _conn = None
        logger.error("PostgreSQL reconnect failed: %s", exc)
        raise


def _run(fn: "Any") -> "Any":
    """Run fn() under _lock; on a stale-connection error reconnect once and retry."""
    import psycopg2

    with _lock:
        try:
            return fn()
        except (psycopg2.InterfaceError, psycopg2.OperationalError) as exc:
            logger.warning("DB connection lost (%s) — reconnecting…", exc)
            _reconnect_locked()
            return fn()


def _ensure_schema(conn: Any) -> None:
    """Run CREATE TABLE IF NOT EXISTS for all tables (synchronous).

    Includes a one-time migration: if the recommendations table exists with
    a TEXT primary key (old schema), it is dropped and recreated with UUID.
    """
    with conn.cursor() as cur:
        cur.execute(_CREATE_TABLE_SQL)

        # One-time migration: drop old TEXT-id recommendations table if present
        cur.execute(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'recommendations' AND column_name = 'id'"
        )
        row = cur.fetchone()
        if row is not None and row[0] == "text":
            cur.execute("DROP TABLE IF EXISTS recommendation_feedback CASCADE")
            cur.execute("DROP TABLE IF EXISTS recommendations CASCADE")

        cur.execute(_CREATE_RECOMMENDATIONS_SQL)
        cur.execute(_CREATE_RECOMMENDATION_FEEDBACK_SQL)
        cur.execute(
            "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS provider_recommendation JSONB"
        )


async def init_db(database_url: str) -> None:
    """Initialise the connection pool and create the schema.

    Safe to call multiple times; subsequent calls are no-ops.
    """
    global _conn

    def _setup() -> None:
        global _conn, _database_url
        with _lock:
            if _conn is not None:
                return
            _database_url = database_url
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

    def _do() -> None:
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

    await asyncio.to_thread(lambda: _run(_do))


async def db_get_document(doc_id: str) -> _StoredDocumentRow | None:
    """Fetch a document record from PostgreSQL (or in-memory fallback)."""
    if _conn is None:
        return _DOCS_FALLBACK.get(doc_id)

    def _do() -> _StoredDocumentRow | None:
        with _conn.cursor() as cur:
            cur.execute(
                "SELECT doc_id, filename, file_path, metadata FROM documents WHERE doc_id = %s",
                (doc_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        doc_id_r, filename_r, file_path_r, metadata_r = row
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

    return await asyncio.to_thread(lambda: _run(_do))


async def db_save_provider_recommendation(doc_id: str, provider_rec_dict: dict) -> None:
    """Persist a provider recommendation against the most-recent recommendations row."""
    if _conn is None:
        _PROVIDER_RECS_FALLBACK[doc_id] = provider_rec_dict
        return

    provider_rec_json = json.dumps(provider_rec_dict)

    def _do() -> None:
        with _conn.cursor() as cur:
            cur.execute(
                """
                UPDATE recommendations
                SET provider_recommendation = %s::jsonb
                WHERE id = (
                    SELECT id FROM recommendations
                    WHERE doc_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                )
                """,
                (provider_rec_json, doc_id),
            )

    await asyncio.to_thread(lambda: _run(_do))


async def db_get_history() -> list[dict]:
    """Return all documents joined with their latest recommendation, newest first."""
    if _conn is None:
        from datetime import datetime, timezone

        rows: list[dict] = []
        for stored in _DOCS_FALLBACK.values():
            metadata = json.loads(stored.metadata_json)
            rows.append(
                {
                    "doc_id": stored.doc_id,
                    "filename": stored.filename,
                    "metadata": metadata,
                    "created_at": datetime.now(tz=timezone.utc),
                    "recommendation_id": None,
                    "chunking_strategy": None,
                    "chunk_size": None,
                    "overlap": None,
                    "embedding_model": None,
                    "llm_model": None,
                    "top_k": None,
                    "rationale": None,
                    "confidence": None,
                    "source": None,
                    "provider_recommendation": _PROVIDER_RECS_FALLBACK.get(stored.doc_id),
                }
            )
        # newest first by insertion order isn't guaranteed, but this is best-effort
        return list(reversed(rows))

    def _do() -> list[dict]:
        with _conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.doc_id,
                    d.filename,
                    d.metadata,
                    d.created_at,
                    r.id                      AS recommendation_id,
                    r.chunking_strategy,
                    r.chunk_size,
                    r.overlap,
                    r.embedding_model,
                    r.llm_model,
                    r.top_k,
                    r.rationale,
                    r.confidence,
                    r.source,
                    r.provider_recommendation
                FROM documents d
                LEFT JOIN LATERAL (
                    SELECT * FROM recommendations
                    WHERE doc_id = d.doc_id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) r ON true
                ORDER BY d.created_at DESC
                """
            )
            columns = [col.name for col in cur.description]
            db_rows = cur.fetchall()

        result: list[dict] = []
        for db_row in db_rows:
            row_dict = dict(zip(columns, db_row))
            metadata = row_dict.get("metadata")
            if isinstance(metadata, str):
                row_dict["metadata"] = json.loads(metadata)
            prov_rec = row_dict.get("provider_recommendation")
            if isinstance(prov_rec, str):
                row_dict["provider_recommendation"] = json.loads(prov_rec)
            result.append(row_dict)
        return result

    return await asyncio.to_thread(lambda: _run(_do))


# ---------------------------------------------------------------------------
# Connection accessors (for use by recommendation_store and other services)
# ---------------------------------------------------------------------------


def get_connection() -> Any:
    """Return the active psycopg2 connection, or None if not initialised."""
    return _conn


def get_lock() -> threading.Lock:
    """Return the shared threading lock for serialising psycopg2 calls."""
    return _lock

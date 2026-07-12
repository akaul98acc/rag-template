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

# In-memory fallback for organizations (keyed by org id)
_ORGS_FALLBACK: dict[str, dict] = {}

# In-memory fallback for users (keyed by user id)
_USERS_FALLBACK: dict[str, dict] = {}

# In-memory fallback for roles (seeded with defaults)
_ROLES_FALLBACK: dict[str, dict] = {
    "00000001-0000-0000-0000-000000000001": {
        "id": "00000001-0000-0000-0000-000000000001", "name": "Admin",
        "created_by": "system", "created_on": "2024-01-01T00:00:00+00:00",
        "updated_by": "system", "updated_on": "2024-01-01T00:00:00+00:00",
        "deleted_by": None, "deleted_on": None,
    },
    "00000001-0000-0000-0000-000000000002": {
        "id": "00000001-0000-0000-0000-000000000002", "name": "Manager",
        "created_by": "system", "created_on": "2024-01-01T00:00:00+00:00",
        "updated_by": "system", "updated_on": "2024-01-01T00:00:00+00:00",
        "deleted_by": None, "deleted_on": None,
    },
    "00000001-0000-0000-0000-000000000003": {
        "id": "00000001-0000-0000-0000-000000000003", "name": "User",
        "created_by": "system", "created_on": "2024-01-01T00:00:00+00:00",
        "updated_by": "system", "updated_on": "2024-01-01T00:00:00+00:00",
        "deleted_by": None, "deleted_on": None,
    },
    "00000001-0000-0000-0000-000000000004": {
        "id": "00000001-0000-0000-0000-000000000004", "name": "Viewer",
        "created_by": "system", "created_on": "2024-01-01T00:00:00+00:00",
        "updated_by": "system", "updated_on": "2024-01-01T00:00:00+00:00",
        "deleted_by": None, "deleted_on": None,
    },
}

_SEEDED_ROLE_NAMES: frozenset[str] = frozenset({"Admin", "Manager", "User", "Viewer"})

# In-memory fallback for OTP tokens (keyed by token id str)
_OTP_TOKENS_FALLBACK: dict[str, dict] = {}


@dataclass
class _StoredDocumentRow:
    doc_id: str
    filename: str
    file_path: str
    metadata_json: str  # JSON-serialised DocumentMetadata
    org_id: str | None = None
    uploaded_by: str | None = None


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

_CREATE_ORGANIZATIONS_SQL = """
CREATE TABLE IF NOT EXISTS organizations (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT        NOT NULL,
    org_code       TEXT        NOT NULL UNIQUE,
    website        TEXT,
    phone_number   TEXT,
    contact_person TEXT        NOT NULL,
    plan_selected  TEXT        NOT NULL,
    created_from   TEXT,
    created_by     TEXT        NOT NULL DEFAULT 'system',
    created_on     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     TEXT        NOT NULL DEFAULT 'system',
    updated_on     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_org_code ON organizations(org_code);
"""

_CREATE_ROLES_SQL = """
CREATE TABLE IF NOT EXISTS roles (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);
"""

_CREATE_USERS_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    email        TEXT        NOT NULL UNIQUE,
    phone_number TEXT,
    org_id       UUID,
    role_id      UUID,
    created_by   TEXT        NOT NULL DEFAULT 'system',
    created_on   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by   TEXT        NOT NULL DEFAULT 'system',
    updated_on   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by   TEXT,
    deleted_on   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
"""

_CREATE_RECOMMENDATION_FEEDBACK_SQL = """
CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID        NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome           TEXT        NOT NULL CHECK (outcome IN ('accepted', 'modified', 'rejected')),
    notes             TEXT,
    final_values      JSONB,
    UNIQUE (recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_recommendation_id ON recommendation_feedback(recommendation_id);
"""

_CREATE_OTP_TOKENS_SQL = """
CREATE TABLE IF NOT EXISTS otp_tokens (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash     TEXT        NOT NULL,
    otp_value    TEXT        NOT NULL,
    phone_number TEXT        NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    used         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_user_id ON otp_tokens(user_id);
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
    """Create all tables then run column migrations.

    Tables are created first so they always exist even if a migration step
    below raises (e.g. duplicate-constraint on Neon on repeated startups).
    """
    with conn.cursor() as cur:
        # ── 1. Create all tables (safe, idempotent) ───────────────────────────
        cur.execute(_CREATE_TABLE_SQL)  # documents

        # One-time migration: drop old TEXT-pk recommendations table if present
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
        cur.execute(_CREATE_ORGANIZATIONS_SQL)
        # Migration: if org table was previously created with 'org_id' PK column
        # (from a short-lived schema experiment), rename it back to 'id'.
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='organizations' AND column_name='org_id'"
        )
        if cur.fetchone() is not None:
            try:
                cur.execute("ALTER TABLE organizations RENAME COLUMN org_id TO id")
            except Exception:
                pass  # already renamed or DDL not supported — safe to ignore
        cur.execute(_CREATE_ROLES_SQL)
        # ── Roles audit column migrations (idempotent) ────────────────────────
        for _col, _defn in (
            ("created_by", "TEXT NOT NULL DEFAULT 'system'"),
            ("created_on", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
            ("updated_by", "TEXT NOT NULL DEFAULT 'system'"),
            ("updated_on", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
            ("deleted_by", "TEXT"),
            ("deleted_on", "TIMESTAMPTZ"),
        ):
            cur.execute(f"ALTER TABLE roles ADD COLUMN IF NOT EXISTS {_col} {_defn}")
        cur.execute(_CREATE_USERS_SQL)
        cur.execute(_CREATE_OTP_TOKENS_SQL)
        cur.execute("ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS otp_value TEXT NOT NULL DEFAULT ''")

        # ── 2. Column migrations on recommendations ───────────────────────────
        cur.execute(
            "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS provider_recommendation JSONB"
        )

        # ── 3. Column / constraint migrations on recommendation_feedback ──────
        cur.execute(
            "ALTER TABLE recommendation_feedback ADD COLUMN IF NOT EXISTS "
            "rating INT CHECK (rating >= 1 AND rating <= 5)"
        )
        cur.execute(
            "ALTER TABLE recommendation_feedback ADD COLUMN IF NOT EXISTS "
            "phase INT CHECK (phase IN (1, 2))"
        )
        cur.execute(
            "ALTER TABLE recommendation_feedback "
            "ADD COLUMN IF NOT EXISTS final_values JSONB"
        )
        for col in (
            "final_chunking_strategy", "final_chunk_size", "final_overlap",
            "final_embedding_model", "final_llm_model", "final_top_k",
        ):
            cur.execute(
                f"ALTER TABLE recommendation_feedback DROP COLUMN IF EXISTS {col}"
            )
        # Migrate unique constraint to (recommendation_id, phase).
        # Wrapped in try/except because ADD CONSTRAINT raises DuplicateObject
        # on Neon when the constraint already exists from a previous startup.
        cur.execute(
            "ALTER TABLE recommendation_feedback "
            "DROP CONSTRAINT IF EXISTS recommendation_feedback_recommendation_id_key"
        )
        cur.execute(
            "ALTER TABLE recommendation_feedback "
            "DROP CONSTRAINT IF EXISTS recommendation_feedback_rec_phase_unique"
        )
        try:
            cur.execute(
                "ALTER TABLE recommendation_feedback "
                "ADD CONSTRAINT recommendation_feedback_rec_phase_unique "
                "UNIQUE (recommendation_id, phase)"
            )
        except Exception:
            pass  # already exists — safe to ignore with autocommit

        # ── 4. Seed default roles ─────────────────────────────────────────────
        cur.execute("SELECT COUNT(*) FROM roles")
        if cur.fetchone()[0] == 0:
            for rname in ("Admin", "Manager", "User", "Viewer"):
                cur.execute(
                    "INSERT INTO roles (name, created_by, updated_by) VALUES (%s, 'system', 'system') ON CONFLICT (name) DO NOTHING",
                    (rname,),
                )

        # ── 5. Column migrations on users ─────────────────────────────────────
        # role TEXT (intermediate schema) → role_id UUID
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='role'"
        )
        if cur.fetchone() is not None:
            cur.execute("ALTER TABLE users DROP COLUMN role")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID")

        # org_code TEXT → org_id UUID
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='org_code'"
        )
        if cur.fetchone() is not None:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID")
            cur.execute(
                """
                UPDATE users u SET org_id = o.id
                FROM organizations o
                WHERE o.org_code = u.org_code AND u.org_id IS NULL
                """
            )
            cur.execute("ALTER TABLE users DROP COLUMN org_code")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id)"
        )

        # ── 6. Column migrations on documents (org-scoped upload history) ─────
        cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS org_id UUID")
        cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by UUID")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id)"
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
    org_id: str | None = None,
    uploaded_by: str | None = None,
) -> None:
    """Persist a document record to PostgreSQL (or in-memory fallback)."""
    if _conn is None:
        # Fallback: store in memory
        _DOCS_FALLBACK[doc_id] = _StoredDocumentRow(
            doc_id=doc_id,
            filename=filename,
            file_path=str(file_path),
            metadata_json=json.dumps(metadata_dict),
            org_id=org_id,
            uploaded_by=uploaded_by,
        )
        return

    metadata_json = json.dumps(metadata_dict)
    path_str = str(file_path)

    def _do() -> None:
        with _conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents (doc_id, filename, file_path, metadata, org_id, uploaded_by)
                VALUES (%s, %s, %s, %s::jsonb, %s::uuid, %s::uuid)
                ON CONFLICT (doc_id) DO UPDATE
                    SET filename  = EXCLUDED.filename,
                        file_path = EXCLUDED.file_path,
                        metadata  = EXCLUDED.metadata
                """,
                (doc_id, filename, path_str, metadata_json, org_id, uploaded_by),
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


async def db_save_provider_recommendation(doc_id: str, provider_rec_dict: dict) -> str | None:
    """Persist a provider recommendation against the most-recent recommendations row.

    Returns the recommendation_id that was updated, or None if no row matched.
    """
    if _conn is None:
        _PROVIDER_RECS_FALLBACK[doc_id] = provider_rec_dict
        return None

    provider_rec_json = json.dumps(provider_rec_dict)

    def _do() -> str | None:
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
                RETURNING id
                """,
                (provider_rec_json, doc_id),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None

    return await asyncio.to_thread(lambda: _run(_do))


async def db_get_history(
    org_id: str | None = None,
    user_id: str | None = None,
    role: str | None = None,
) -> list[dict]:
    """Return documents joined with their latest recommendation, newest first.

    When org_id is provided, results are filtered to that org. Admin-role callers
    see all documents in the org (with uploaded_by_email); others see only their own.
    """
    is_admin = role == "Admin"

    if _conn is None:
        from datetime import datetime, timezone

        rows: list[dict] = []
        for stored in _DOCS_FALLBACK.values():
            if org_id is not None:
                if stored.org_id != org_id:
                    continue
                if not is_admin and stored.uploaded_by != user_id:
                    continue
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
                    "uploaded_by_email": None,
                }
            )
        return list(reversed(rows))

    def _do() -> list[dict]:
        with _conn.cursor() as cur:
            if org_id is None:
                # No auth context — return everything (backwards compatibility)
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
                        r.provider_recommendation,
                        NULL::text                AS uploaded_by_email
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
            elif is_admin:
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
                        r.provider_recommendation,
                        u.email                   AS uploaded_by_email
                    FROM documents d
                    LEFT JOIN users u ON d.uploaded_by = u.id
                    LEFT JOIN LATERAL (
                        SELECT * FROM recommendations
                        WHERE doc_id = d.doc_id
                        ORDER BY created_at DESC
                        LIMIT 1
                    ) r ON true
                    WHERE d.org_id = %s::uuid
                    ORDER BY d.created_at DESC
                    """,
                    (org_id,),
                )
            else:
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
                        r.provider_recommendation,
                        NULL::text                AS uploaded_by_email
                    FROM documents d
                    LEFT JOIN LATERAL (
                        SELECT * FROM recommendations
                        WHERE doc_id = d.doc_id
                        ORDER BY created_at DESC
                        LIMIT 1
                    ) r ON true
                    WHERE d.org_id = %s::uuid AND d.uploaded_by = %s::uuid
                    ORDER BY d.created_at DESC
                    """,
                    (org_id, user_id),
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


# ---------------------------------------------------------------------------
# Shared serialisation helpers
# ---------------------------------------------------------------------------


def serialize_row(
    row_dict: dict,
    uuid_cols: tuple[str, ...] = (),
    nullable_uuid_cols: tuple[str, ...] = (),
    ts_cols: tuple[str, ...] = (),
    nullable_ts_cols: tuple[str, ...] = (),
) -> dict:
    """Convert UUID and datetime columns to strings in-place. Returns row_dict."""
    for col in uuid_cols:
        row_dict[col] = str(row_dict[col])
    for col in nullable_uuid_cols:
        if row_dict.get(col) is not None:
            row_dict[col] = str(row_dict[col])
    for col in ts_cols:
        row_dict[col] = str(row_dict[col])
    for col in nullable_ts_cols:
        if row_dict.get(col) is not None:
            row_dict[col] = str(row_dict[col])
    return row_dict


def _db_list_entity_sync(
    *,
    select_sql: str,
    count_sql: str,
    all_filters: list[tuple[str, list]],
    serialize: Any,
    page: int,
    page_size: int,
    order_by: str,
) -> dict:
    """Paginated list query — must be called inside _run() with _conn live."""
    conditions = [f[0] for f in all_filters if f[0]]
    params: list[Any] = []
    for _, p in all_filters:
        params.extend(p)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    with _conn.cursor() as cur:
        cur.execute(f"{count_sql} {where_clause}", params)
        total: int = cur.fetchone()[0]
        offset = (page - 1) * page_size
        cur.execute(
            f"{select_sql} {where_clause} ORDER BY {order_by} LIMIT %s OFFSET %s",
            params + [page_size, offset],
        )
        columns = [col.name for col in cur.description]
        rows = cur.fetchall()
    items = [serialize(dict(zip(columns, row))) for row in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Organization CRUD API
# ---------------------------------------------------------------------------


_ORG_SELECT = (
    "SELECT id AS org_id, name, org_code, website, phone_number, contact_person, "
    "plan_selected, created_from, created_by, created_on, updated_by, updated_on "
    "FROM organizations"
)


async def db_list_organizations(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    plan: str | None = None,
) -> dict:
    """Return a paginated list of organizations with optional search and plan filter."""
    if _conn is None:
        items = list(_ORGS_FALLBACK.values())
        if search:
            term = search.lower()
            items = [
                r for r in items
                if term in r.get("name", "").lower() or term in r.get("org_code", "").lower()
            ]
        if plan:
            items = [r for r in items if r.get("plan_selected") == plan]
        total = len(items)
        items = sorted(items, key=lambda r: r.get("created_on", ""), reverse=True)
        offset = (page - 1) * page_size
        items = items[offset: offset + page_size]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def _do() -> dict:
        all_filters: list[tuple[str, list[Any]]] = []
        if search:
            all_filters.append(("(name ILIKE %s OR org_code ILIKE %s)", [f"%{search}%", f"%{search}%"]))
        if plan:
            all_filters.append(("plan_selected = %s", [plan]))
        return _db_list_entity_sync(
            select_sql=_ORG_SELECT,
            count_sql="SELECT COUNT(*) FROM organizations",
            all_filters=all_filters,
            serialize=lambda r: serialize_row(r, uuid_cols=("org_id",), ts_cols=("created_on", "updated_on")),
            page=page,
            page_size=page_size,
            order_by="created_on DESC",
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_get_organization(org_id: str) -> dict | None:
    """Fetch a single organization by id, or None if not found."""
    if _conn is None:
        return _ORGS_FALLBACK.get(org_id)

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"{_ORG_SELECT} WHERE id = %s",
                (org_id,),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(dict(zip(columns, row)), uuid_cols=("org_id",), ts_cols=("created_on", "updated_on"))

    return await asyncio.to_thread(lambda: _run(_do))


async def db_check_org_code(org_code: str) -> bool:
    """Return True if org_code is already taken, False if it is available."""
    if _conn is None:
        return any(
            v["org_code"] == org_code for v in _ORGS_FALLBACK.values()
        )

    def _do() -> bool:
        with _conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM organizations WHERE org_code = %s LIMIT 1",
                (org_code,),
            )
            return cur.fetchone() is not None

    return await asyncio.to_thread(lambda: _run(_do))


async def db_create_organization(data: dict) -> dict:
    """Insert a new organization row and return the full row dict.

    Raises ``psycopg2.errors.UniqueViolation`` on duplicate org_code.
    """
    if _conn is None:
        import uuid
        from datetime import datetime, timezone

        # Check for duplicate org_code in fallback store
        org_code = data["org_code"]
        for existing_row in _ORGS_FALLBACK.values():
            if existing_row.get("org_code") == org_code:
                raise ValueError("org_code already exists")

        org_id = str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc).isoformat()
        row: dict = {
            "org_id": org_id,
            "name": data["name"],
            "org_code": org_code,
            "website": data.get("website"),
            "phone_number": data.get("phone_number"),
            "contact_person": data["contact_person"],
            "plan_selected": data["plan_selected"],
            "created_from": data.get("created_from"),
            "created_by": data.get("created_by", "system"),
            "created_on": now,
            "updated_by": "system",
            "updated_on": now,
        }
        _ORGS_FALLBACK[org_id] = row
        return row

    def _do() -> dict:
        with _conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO organizations
                    (name, org_code, website, phone_number, contact_person,
                     plan_selected, created_from, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id AS org_id, name, org_code, website, phone_number, contact_person,
                          plan_selected, created_from, created_by, created_on,
                          updated_by, updated_on
                """,
                (
                    data["name"],
                    data["org_code"],
                    data.get("website"),
                    data.get("phone_number"),
                    data["contact_person"],
                    data["plan_selected"],
                    data.get("created_from"),
                    data.get("created_by", "system"),
                ),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        return serialize_row(dict(zip(columns, row)), uuid_cols=("org_id",), ts_cols=("created_on", "updated_on"))

    return await asyncio.to_thread(lambda: _run(_do))


async def db_update_organization(org_id: str, data: dict) -> dict | None:
    """Update mutable fields on an organization row and return the updated row.

    Returns None if no row matched the given id.
    """
    if _conn is None:
        if org_id not in _ORGS_FALLBACK:
            return None
        from datetime import datetime, timezone

        existing = _ORGS_FALLBACK[org_id]
        existing.update(
            {
                "name": data["name"],
                "website": data.get("website"),
                "phone_number": data.get("phone_number"),
                "contact_person": data["contact_person"],
                "plan_selected": data["plan_selected"],
                "updated_by": "system",
                "updated_on": datetime.now(tz=timezone.utc).isoformat(),
            }
        )
        return existing

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                """
                UPDATE organizations
                SET name=%s, website=%s, phone_number=%s, contact_person=%s,
                    plan_selected=%s, updated_by='system', updated_on=NOW()
                WHERE id=%s
                RETURNING id AS org_id, name, org_code, website, phone_number, contact_person,
                          plan_selected, created_from, created_by, created_on,
                          updated_by, updated_on
                """,
                (
                    data["name"],
                    data.get("website"),
                    data.get("phone_number"),
                    data["contact_person"],
                    data["plan_selected"],
                    org_id,
                ),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(dict(zip(columns, row)), uuid_cols=("org_id",), ts_cols=("created_on", "updated_on"))

    return await asyncio.to_thread(lambda: _run(_do))


async def db_delete_organization(org_id: str) -> bool:
    """Delete an organization row by id. Returns True if a row was deleted."""
    if _conn is None:
        if org_id in _ORGS_FALLBACK:
            del _ORGS_FALLBACK[org_id]
            return True
        return False

    def _do() -> bool:
        with _conn.cursor() as cur:
            cur.execute("DELETE FROM organizations WHERE id=%s", (org_id,))
            return cur.rowcount > 0

    return await asyncio.to_thread(lambda: _run(_do))


# ---------------------------------------------------------------------------
# User CRUD API
# ---------------------------------------------------------------------------

_USER_SELECT = """
    SELECT u.id, u.name, u.email, u.phone_number,
           u.org_id, o.name AS org_name,
           u.role_id, r.name AS role_name,
           u.created_by, u.created_on, u.updated_by, u.updated_on,
           u.deleted_by, u.deleted_on
    FROM users u
    LEFT JOIN organizations o ON o.id = u.org_id
    LEFT JOIN roles r ON r.id = u.role_id
"""


async def db_list_users(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
) -> dict:
    """Return a paginated list of non-deleted users with optional search."""
    if _conn is None:
        items = [r for r in _USERS_FALLBACK.values() if r.get("deleted_on") is None]
        if search:
            term = search.lower()
            items = [
                r for r in items
                if term in r.get("name", "").lower() or term in r.get("email", "").lower()
            ]
        total = len(items)
        items = sorted(items, key=lambda r: r.get("created_on", ""), reverse=True)
        offset = (page - 1) * page_size
        items = items[offset: offset + page_size]
        for item in items:
            org = _ORGS_FALLBACK.get(item.get("org_id", ""), {})
            role = _ROLES_FALLBACK.get(item.get("role_id", ""), {})
            item["org_name"] = org.get("name")
            item["role_name"] = role.get("name")
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def _do() -> dict:
        all_filters: list[tuple[str, list[Any]]] = [("u.deleted_on IS NULL", [])]
        if search:
            all_filters.append(("(u.name ILIKE %s OR u.email ILIKE %s)", [f"%{search}%", f"%{search}%"]))
        return _db_list_entity_sync(
            select_sql=_USER_SELECT,
            count_sql="SELECT COUNT(*) FROM users u",
            all_filters=all_filters,
            serialize=lambda r: serialize_row(
                r,
                uuid_cols=("id",),
                nullable_uuid_cols=("org_id", "role_id"),
                ts_cols=("created_on", "updated_on"),
                nullable_ts_cols=("deleted_on",),
            ),
            page=page,
            page_size=page_size,
            order_by="u.created_on DESC",
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_get_user(user_id: str) -> dict | None:
    """Fetch a single non-deleted user by id, or None if not found."""
    if _conn is None:
        row = _USERS_FALLBACK.get(user_id)
        if row is None or row.get("deleted_on") is not None:
            return None
        org = _ORGS_FALLBACK.get(row.get("org_id", ""), {})
        role = _ROLES_FALLBACK.get(row.get("role_id", ""), {})
        return {**row, "org_name": org.get("name"), "role_name": role.get("name")}

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"{_USER_SELECT} WHERE u.id = %s AND u.deleted_on IS NULL",
                (user_id,),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            nullable_uuid_cols=("org_id", "role_id"),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_check_email(email: str) -> bool:
    """Return True if email is already taken, False if available."""
    if _conn is None:
        return any(
            v["email"].lower() == email.lower()
            for v in _USERS_FALLBACK.values()
            if v.get("deleted_on") is None
        )

    def _do() -> bool:
        with _conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM users WHERE email = %s AND deleted_on IS NULL LIMIT 1",
                (email,),
            )
            return cur.fetchone() is not None

    return await asyncio.to_thread(lambda: _run(_do))


async def db_create_user(data: dict) -> dict:
    """Insert a new user row and return the full row dict.

    Raises ``psycopg2.errors.UniqueViolation`` on duplicate email.
    """
    if _conn is None:
        import uuid
        from datetime import datetime, timezone

        email = data["email"]
        for existing in _USERS_FALLBACK.values():
            if existing.get("email", "").lower() == email.lower() and existing.get("deleted_on") is None:
                raise ValueError("email already exists")

        user_id = str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc).isoformat()
        org = _ORGS_FALLBACK.get(data.get("org_id", ""), {})
        role = _ROLES_FALLBACK.get(data.get("role_id", ""), {})
        row: dict = {
            "id": user_id,
            "name": data["name"],
            "email": email,
            "phone_number": data.get("phone_number"),
            "org_id": data.get("org_id"),
            "org_name": org.get("name"),
            "role_id": data.get("role_id"),
            "role_name": role.get("name"),
            "created_by": data.get("created_by", "system"),
            "created_on": now,
            "updated_by": "system",
            "updated_on": now,
            "deleted_by": None,
            "deleted_on": None,
        }
        _USERS_FALLBACK[user_id] = row
        return row

    def _do() -> dict:
        with _conn.cursor() as cur:
            cur.execute(
                f"""
                WITH ins AS (
                    INSERT INTO users (name, email, phone_number, org_id, role_id, created_by)
                    VALUES (%s, %s, %s, %s::uuid, %s::uuid, %s)
                    RETURNING *
                )
                SELECT ins.id, ins.name, ins.email, ins.phone_number,
                       ins.org_id, o.name AS org_name,
                       ins.role_id, r.name AS role_name,
                       ins.created_by, ins.created_on, ins.updated_by, ins.updated_on,
                       ins.deleted_by, ins.deleted_on
                FROM ins
                LEFT JOIN organizations o ON o.id = ins.org_id
                LEFT JOIN roles r ON r.id = ins.role_id
                """,
                (
                    data["name"],
                    data["email"],
                    data.get("phone_number"),
                    data.get("org_id"),
                    data.get("role_id"),
                    data.get("created_by", "system"),
                ),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            nullable_uuid_cols=("org_id", "role_id"),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_update_user(user_id: str, data: dict) -> dict | None:
    """Update mutable fields (name, phone_number, role_id) and return updated row.

    Returns None if no active row matched the given id.
    """
    if _conn is None:
        if user_id not in _USERS_FALLBACK or _USERS_FALLBACK[user_id].get("deleted_on") is not None:
            return None
        from datetime import datetime, timezone

        existing = _USERS_FALLBACK[user_id]
        role = _ROLES_FALLBACK.get(data.get("role_id", ""), {})
        existing.update(
            {
                "name": data["name"],
                "phone_number": data.get("phone_number"),
                "role_id": data.get("role_id"),
                "role_name": role.get("name"),
                "updated_by": "system",
                "updated_on": datetime.now(tz=timezone.utc).isoformat(),
            }
        )
        return existing

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                """
                WITH upd AS (
                    UPDATE users
                    SET name=%s, phone_number=%s, role_id=%s::uuid,
                        updated_by='system', updated_on=NOW()
                    WHERE id=%s AND deleted_on IS NULL
                    RETURNING *
                )
                SELECT upd.id, upd.name, upd.email, upd.phone_number,
                       upd.org_id, o.name AS org_name,
                       upd.role_id, r.name AS role_name,
                       upd.created_by, upd.created_on, upd.updated_by, upd.updated_on,
                       upd.deleted_by, upd.deleted_on
                FROM upd
                LEFT JOIN organizations o ON o.id = upd.org_id
                LEFT JOIN roles r ON r.id = upd.role_id
                """,
                (data["name"], data.get("phone_number"), data.get("role_id"), user_id),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            nullable_uuid_cols=("org_id", "role_id"),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


_ROLE_SELECT = "SELECT id, name, created_by, created_on, updated_by, updated_on, deleted_by, deleted_on FROM roles"


async def db_list_roles(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
) -> dict:
    """Return a paginated list of non-deleted roles with optional name search."""
    if _conn is None:
        items = [r for r in _ROLES_FALLBACK.values() if r.get("deleted_on") is None]
        if search:
            term = search.lower()
            items = [r for r in items if term in r["name"].lower()]
        total = len(items)
        items = sorted(items, key=lambda r: r["name"])
        offset = (page - 1) * page_size
        items = items[offset: offset + page_size]
        return {"items": list(items), "total": total, "page": page, "page_size": page_size}

    def _do() -> dict:
        all_filters: list[tuple[str, list[Any]]] = [("deleted_on IS NULL", [])]
        if search:
            all_filters.append(("name ILIKE %s", [f"%{search}%"]))
        return _db_list_entity_sync(
            select_sql=_ROLE_SELECT,
            count_sql="SELECT COUNT(*) FROM roles",
            all_filters=all_filters,
            serialize=lambda r: serialize_row(
                r,
                uuid_cols=("id",),
                ts_cols=("created_on", "updated_on"),
                nullable_ts_cols=("deleted_on",),
            ),
            page=page,
            page_size=page_size,
            order_by="name",
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_get_role(role_id: str) -> dict | None:
    """Fetch a single non-deleted role by id, or None if not found."""
    if _conn is None:
        row = _ROLES_FALLBACK.get(role_id)
        return row if row and row.get("deleted_on") is None else None

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"{_ROLE_SELECT} WHERE id = %s AND deleted_on IS NULL",
                (role_id,),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_check_role_name(name: str) -> bool:
    """Return True if name is already taken (including soft-deleted rows)."""
    if _conn is None:
        return any(v["name"].lower() == name.lower() for v in _ROLES_FALLBACK.values())

    def _do() -> bool:
        with _conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM roles WHERE LOWER(name) = LOWER(%s) LIMIT 1",
                (name,),
            )
            return cur.fetchone() is not None

    return await asyncio.to_thread(lambda: _run(_do))


async def db_create_role(data: dict) -> dict:
    """Insert a new role and return the full row dict.

    Raises ``psycopg2.errors.UniqueViolation`` on duplicate name.
    """
    if _conn is None:
        import uuid
        from datetime import datetime, timezone

        name = data["name"]
        if any(v["name"].lower() == name.lower() for v in _ROLES_FALLBACK.values()):
            raise ValueError("role name already exists")

        role_id = str(uuid.uuid4())
        now = datetime.now(tz=timezone.utc).isoformat()
        row: dict = {
            "id": role_id, "name": name,
            "created_by": "system", "created_on": now,
            "updated_by": "system", "updated_on": now,
            "deleted_by": None, "deleted_on": None,
        }
        _ROLES_FALLBACK[role_id] = row
        return row

    def _do() -> dict:
        with _conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO roles (name, created_by, updated_by)
                VALUES (%s, 'system', 'system')
                RETURNING {', '.join(['id', 'name', 'created_by', 'created_on', 'updated_by', 'updated_on', 'deleted_by', 'deleted_on'])}
                """,
                (data["name"],),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_update_role(role_id: str, data: dict) -> dict | None:
    """Update role name. Returns None if not found or already deleted."""
    if _conn is None:
        row = _ROLES_FALLBACK.get(role_id)
        if row is None or row.get("deleted_on") is not None:
            return None
        from datetime import datetime, timezone

        row["name"] = data["name"]
        row["updated_by"] = "system"
        row["updated_on"] = datetime.now(tz=timezone.utc).isoformat()
        return row

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE roles
                SET name=%s, updated_by='system', updated_on=NOW()
                WHERE id=%s AND deleted_on IS NULL
                RETURNING {', '.join(['id', 'name', 'created_by', 'created_on', 'updated_by', 'updated_on', 'deleted_by', 'deleted_on'])}
                """,
                (data["name"], role_id),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_count_users_for_role(role_id: str) -> int:
    """Count active (non-deleted) users assigned to this role."""
    if _conn is None:
        return sum(
            1 for u in _USERS_FALLBACK.values()
            if u.get("role_id") == role_id and u.get("deleted_on") is None
        )

    def _do() -> int:
        with _conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM users WHERE role_id=%s::uuid AND deleted_on IS NULL",
                (role_id,),
            )
            return cur.fetchone()[0]

    return await asyncio.to_thread(lambda: _run(_do))


async def db_delete_role(role_id: str) -> dict | None:
    """Soft-delete a role. Returns the updated row or None if not found."""
    if _conn is None:
        row = _ROLES_FALLBACK.get(role_id)
        if row is None or row.get("deleted_on") is not None:
            return None
        from datetime import datetime, timezone

        row["deleted_by"] = "system"
        row["deleted_on"] = datetime.now(tz=timezone.utc).isoformat()
        return row

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE roles
                SET deleted_by='system', deleted_on=NOW()
                WHERE id=%s AND deleted_on IS NULL
                RETURNING {', '.join(['id', 'name', 'created_by', 'created_on', 'updated_by', 'updated_on', 'deleted_by', 'deleted_on'])}
                """,
                (role_id,),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        return serialize_row(
            dict(zip(columns, row)),
            uuid_cols=("id",),
            ts_cols=("created_on", "updated_on"),
            nullable_ts_cols=("deleted_on",),
        )

    return await asyncio.to_thread(lambda: _run(_do))


async def db_delete_user(user_id: str) -> bool:
    """Soft-delete a user by setting deleted_by and deleted_on. Returns True if found."""
    if _conn is None:
        if user_id not in _USERS_FALLBACK or _USERS_FALLBACK[user_id].get("deleted_on") is not None:
            return False
        from datetime import datetime, timezone

        _USERS_FALLBACK[user_id]["deleted_by"] = "system"
        _USERS_FALLBACK[user_id]["deleted_on"] = datetime.now(tz=timezone.utc).isoformat()
        return True

    def _do() -> bool:
        with _conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET deleted_by='system', deleted_on=NOW() WHERE id=%s AND deleted_on IS NULL",
                (user_id,),
            )
            return cur.rowcount > 0

    return await asyncio.to_thread(lambda: _run(_do))


# ---------------------------------------------------------------------------
# Auth / OTP API
# ---------------------------------------------------------------------------

_AUTH_USER_SELECT = """
    SELECT u.id, u.email, u.phone_number,
           u.org_id, o.org_code,
           u.role_id, r.name AS role_name
    FROM users u
    JOIN organizations o ON o.id = u.org_id
    LEFT JOIN roles r ON r.id = u.role_id
"""


async def db_get_user_by_email_and_org(email: str, org_code: str) -> dict | None:
    """Fetch a non-deleted user matching email + org code. Returns None if not found."""
    if _conn is None:
        for user in _USERS_FALLBACK.values():
            if (
                user.get("email", "").lower() == email.lower()
                and user.get("deleted_on") is None
            ):
                org = _ORGS_FALLBACK.get(user.get("org_id", ""), {})
                if org.get("org_code") == org_code:
                    role = _ROLES_FALLBACK.get(user.get("role_id", ""), {})
                    return {
                        "id": user["id"],
                        "email": user["email"],
                        "phone_number": user.get("phone_number"),
                        "org_id": user.get("org_id"),
                        "org_code": org.get("org_code"),
                        "role_name": role.get("name"),
                    }
        return None

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                f"{_AUTH_USER_SELECT} WHERE LOWER(u.email) = LOWER(%s)"
                " AND o.org_code = %s AND u.deleted_on IS NULL LIMIT 1",
                (email, org_code),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        result = dict(zip(columns, row))
        result["id"] = str(result["id"])
        if result.get("org_id"):
            result["org_id"] = str(result["org_id"])
        return result

    return await asyncio.to_thread(lambda: _run(_do))


async def db_create_otp(user_id: str, otp_hash: str, otp_value: str, phone_number: str, expires_at: Any) -> dict:
    """Insert a new OTP token row and return it."""
    if _conn is None:
        import uuid
        from datetime import datetime, timezone

        token_id = str(uuid.uuid4())
        row: dict = {
            "id": token_id,
            "user_id": user_id,
            "otp_hash": otp_hash,
            "otp_value": otp_value,
            "phone_number": phone_number,
            "expires_at": expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at),
            "used": False,
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        _OTP_TOKENS_FALLBACK[token_id] = row
        return row

    def _do() -> dict:
        with _conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO otp_tokens (user_id, otp_hash, otp_value, phone_number, expires_at)
                VALUES (%s::uuid, %s, %s, %s, %s)
                RETURNING id, user_id, otp_hash, otp_value, phone_number, expires_at, used, created_at
                """,
                (user_id, otp_hash, otp_value, phone_number, expires_at),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        result = dict(zip(columns, row))
        result["id"] = str(result["id"])
        result["user_id"] = str(result["user_id"])
        return result

    return await asyncio.to_thread(lambda: _run(_do))


async def db_invalidate_user_otps(user_id: str) -> None:
    """Mark all pending (unused) OTPs for a user as used."""
    if _conn is None:
        for row in _OTP_TOKENS_FALLBACK.values():
            if row["user_id"] == user_id and not row["used"]:
                row["used"] = True
        return

    def _do() -> None:
        with _conn.cursor() as cur:
            cur.execute(
                "UPDATE otp_tokens SET used = TRUE WHERE user_id = %s::uuid AND used = FALSE",
                (user_id,),
            )

    await asyncio.to_thread(lambda: _run(_do))


async def db_get_pending_otp(user_id: str) -> dict | None:
    """Return the most recent valid (non-used, non-expired) OTP for the user, or None."""
    if _conn is None:
        from datetime import datetime, timezone

        now = datetime.now(tz=timezone.utc)
        candidates = [
            r for r in _OTP_TOKENS_FALLBACK.values()
            if r["user_id"] == user_id and not r["used"]
        ]
        for row in sorted(candidates, key=lambda r: r["created_at"], reverse=True):
            expires = row["expires_at"]
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires.tzinfo is None:
                from datetime import timezone as tz
                expires = expires.replace(tzinfo=tz.utc)
            if expires > now:
                return row
        return None

    def _do() -> dict | None:
        with _conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, otp_hash, phone_number, expires_at, used, created_at
                FROM otp_tokens
                WHERE user_id = %s::uuid AND used = FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1
                """,
                (user_id,),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
        if row is None:
            return None
        result = dict(zip(columns, row))
        result["id"] = str(result["id"])
        result["user_id"] = str(result["user_id"])
        return result

    return await asyncio.to_thread(lambda: _run(_do))


async def db_mark_otp_used(otp_id: str) -> None:
    """Mark an OTP token as used (invalidate on first successful verify)."""
    if _conn is None:
        if otp_id in _OTP_TOKENS_FALLBACK:
            _OTP_TOKENS_FALLBACK[otp_id]["used"] = True
        return

    def _do() -> None:
        with _conn.cursor() as cur:
            cur.execute(
                "UPDATE otp_tokens SET used = TRUE WHERE id = %s::uuid",
                (otp_id,),
            )

    await asyncio.to_thread(lambda: _run(_do))

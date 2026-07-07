"""Persistence layer for recommendations and feedback.

Exposes:
  - save_recommendation(record)                   — write one row to recommendations
  - save_feedback(request)                        — upsert one row to recommendation_feedback;
                                                    returns 'ok' | 'not_found'
  - get_reusable_phase1_recommendation(...)       — find a highly-rated Phase 1 match
  - get_reusable_phase2_recommendation(...)       — find a highly-rated Phase 2 match

Uses the shared psycopg2 connection managed by database.py. Falls back to
in-memory dicts when the DB is unavailable so the app never hard-fails.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal

import psycopg2.errors

from app.models.recommendation import FeedbackRequest, RecommendationRecord
from app.services.database import get_connection, get_lock

logger = logging.getLogger(__name__)

# In-memory fallback stores (keyed by rec_id / recommendation_id)
_RECS_FALLBACK: dict[str, dict] = {}
_FEEDBACK_FALLBACK: dict[str, dict] = {}  # keyed by (recommendation_id, phase)


async def save_recommendation(record: RecommendationRecord) -> None:
    """Persist a recommendation row. Non-blocking — failures are logged, not raised."""
    conn = get_connection()

    if conn is None:
        _RECS_FALLBACK[record.rec_id] = record.model_dump()
        return

    lock = get_lock()
    raw_json = json.dumps(record.raw_llm_response) if record.raw_llm_response else None

    def _insert() -> None:
        with lock:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO recommendations (
                        id, doc_id, source, model_version, confidence, raw_llm_response,
                        filename, size_bytes, page_count, is_scanned, has_tables,
                        table_count, image_count, doc_type, content_type, text_density,
                        avg_words_per_page, table_ratio, avg_sentence_length,
                        chunking_strategy, chunk_size, overlap,
                        embedding_model, llm_model, top_k, rationale
                    ) VALUES (
                        %(rec_id)s, %(doc_id)s, %(source)s, %(model_version)s,
                        %(confidence)s, %(raw_json)s::jsonb,
                        %(filename)s, %(size_bytes)s, %(page_count)s, %(is_scanned)s,
                        %(has_tables)s, %(table_count)s, %(image_count)s,
                        %(doc_type)s, %(content_type)s, %(text_density)s,
                        %(avg_words_per_page)s, %(table_ratio)s, %(avg_sentence_length)s,
                        %(chunking_strategy)s, %(chunk_size)s, %(overlap)s,
                        %(embedding_model)s, %(llm_model)s, %(top_k)s, %(rationale)s
                    )
                    ON CONFLICT (id) DO NOTHING
                    """,
                    {**record.model_dump(), "raw_json": raw_json},
                )

    await asyncio.to_thread(_insert)


async def save_feedback(
    request: FeedbackRequest,
) -> Literal["ok", "not_found"]:
    """Upsert a feedback row keyed on (recommendation_id, phase).

    Returns:
        'ok'        — feedback written/updated successfully
        'not_found' — recommendation_id does not exist
    """
    conn = get_connection()

    if conn is None:
        if request.recommendation_id not in _RECS_FALLBACK:
            return "not_found"
        key = str((request.recommendation_id, request.phase))
        _FEEDBACK_FALLBACK[key] = request.model_dump()
        return "ok"

    lock = get_lock()
    final_values_json = json.dumps(request.final_values) if request.final_values else None

    def _write() -> Literal["ok", "not_found"]:
        with lock:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM recommendations WHERE id = %s",
                    (request.recommendation_id,),
                )
                if cur.fetchone() is None:
                    return "not_found"

                cur.execute(
                    """
                    INSERT INTO recommendation_feedback (
                        recommendation_id, phase, outcome, notes, rating, final_values
                    ) VALUES (
                        %(recommendation_id)s, %(phase)s, %(outcome)s, %(notes)s,
                        %(rating)s, %(final_values)s::jsonb
                    )
                    ON CONFLICT (recommendation_id, phase) DO UPDATE SET
                        rating       = EXCLUDED.rating,
                        outcome      = EXCLUDED.outcome,
                        notes        = EXCLUDED.notes,
                        final_values = EXCLUDED.final_values
                    """,
                    {
                        "recommendation_id": request.recommendation_id,
                        "phase": request.phase,
                        "outcome": request.outcome,
                        "notes": request.notes,
                        "rating": request.rating,
                        "final_values": final_values_json,
                    },
                )
                return "ok"

    return await asyncio.to_thread(_write)


async def get_feedback_rating(recommendation_id: str, phase: int) -> int | None:
    """Return the stored star rating for (recommendation_id, phase), or None if not found."""
    conn = get_connection()

    if conn is None:
        key = str((recommendation_id, phase))
        entry = _FEEDBACK_FALLBACK.get(key)
        return entry.get("rating") if entry else None

    lock = get_lock()

    def _query() -> int | None:
        with lock:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT rating FROM recommendation_feedback "
                    "WHERE recommendation_id = %s AND phase = %s",
                    (recommendation_id, phase),
                )
                row = cur.fetchone()
            return int(row[0]) if row and row[0] is not None else None

    return await asyncio.to_thread(_query)


def _page_count_condition(size_bucket: str) -> str:
    """Return a SQL fragment (no params) for matching page_count to a size bucket."""
    if size_bucket == "small":
        return "(r.page_count IS NULL OR r.page_count < 10)"
    if size_bucket == "large":
        return "r.page_count > 200"
    return "(r.page_count >= 10 AND r.page_count <= 200)"


def _matches_size_bucket(page_count: int | None, size_bucket: str) -> bool:
    if size_bucket == "small":
        return page_count is None or page_count < 10
    if size_bucket == "large":
        return page_count is not None and page_count > 200
    return page_count is not None and 10 <= page_count <= 200


def _reusable_phase1_from_memory(
    doc_type: str,
    size_bucket: str,
) -> dict | None:
    for rec_id, rec in _RECS_FALLBACK.items():
        if rec.get("doc_type") != doc_type:
            continue
        if not _matches_size_bucket(rec.get("page_count"), size_bucket):
            continue
        fb = _FEEDBACK_FALLBACK.get(str((rec_id, 1)))
        if fb is None or (fb.get("rating") or 0) < 4:
            continue
        return {
            "recommendation_id": rec_id,
            "chunking_strategy": rec.get("chunking_strategy"),
            "chunk_size": rec.get("chunk_size"),
            "overlap": rec.get("overlap"),
            "embedding_model": rec.get("embedding_model"),
            "llm_model": rec.get("llm_model"),
            "top_k": rec.get("top_k"),
            "rationale": rec.get("rationale"),
            "confidence": rec.get("confidence"),
        }
    return None


_REUSE_COLS = [
    "recommendation_id", "chunking_strategy", "chunk_size", "overlap",
    "embedding_model", "llm_model", "top_k", "rationale", "confidence",
]

_REUSE_P1_BASE = """
    SELECT r.id, r.chunking_strategy, r.chunk_size, r.overlap,
           r.embedding_model, r.llm_model, r.top_k, r.rationale, r.confidence
    FROM recommendations r
    JOIN recommendation_feedback rf ON rf.recommendation_id = r.id
    JOIN documents d ON d.doc_id = r.doc_id
    WHERE rf.rating >= 4
      AND rf.phase = 1
"""


async def get_reusable_phase1_recommendation(
    doc_type: str | None,
    language: str | None,
    size_bucket: str,
) -> dict | None:
    """Find the most-recent Phase 1 recommendation rated >= 4 stars for a matching profile.

    Tries doc_type + language + size_bucket first; falls back to doc_type + size_bucket
    when language is not extracted consistently. Returns None when no qualified match exists.
    """
    conn = get_connection()
    if conn is None:
        if not doc_type:
            return None
        return _reusable_phase1_from_memory(doc_type, size_bucket)

    lock = get_lock()
    size_cond = _page_count_condition(size_bucket)

    def _query() -> dict | None:
        with lock:
            with conn.cursor() as cur:
                # Pass 1: match on doc_type + language + size_bucket (when all are known)
                if doc_type and language:
                    cur.execute(
                        _REUSE_P1_BASE
                        + f"  AND r.doc_type = %s\n"
                        + f"  AND d.metadata->>'language' = %s\n"
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [doc_type, language],
                    )
                    row = cur.fetchone()
                    if row:
                        return dict(zip(_REUSE_COLS, row))

                # Pass 2: relax language (or skip entirely when doc_type is unknown)
                if doc_type:
                    cur.execute(
                        _REUSE_P1_BASE
                        + f"  AND r.doc_type = %s\n"
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [doc_type],
                    )
                else:
                    # No doc_type: match on size bucket only as a last resort
                    cur.execute(
                        _REUSE_P1_BASE
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [],
                    )
                row = cur.fetchone()
                return dict(zip(_REUSE_COLS, row)) if row else None

    return await asyncio.to_thread(_query)


_REUSE_P2_BASE = """
    SELECT r.id, r.provider_recommendation
    FROM recommendations r
    JOIN recommendation_feedback rf ON rf.recommendation_id = r.id
    JOIN documents d ON d.doc_id = r.doc_id
    WHERE rf.rating >= 4
      AND rf.phase = 2
      AND r.provider_recommendation IS NOT NULL
"""


async def get_reusable_phase2_recommendation(
    doc_type: str | None,
    language: str | None,
    size_bucket: str,
) -> tuple[str, dict] | None:
    """Find the most-recent Phase 2 provider recommendation rated >= 4 stars for a matching profile.

    Mirrors the Phase 1 two-pass strategy: tries doc_type + language first, then relaxes.
    Returns (recommendation_id, provider_rec_dict) or None if no match.
    """
    conn = get_connection()
    if conn is None:
        return None

    lock = get_lock()
    size_cond = _page_count_condition(size_bucket)

    def _parse(row: tuple) -> tuple[str, dict]:
        rec_id, provider_rec = row
        if isinstance(provider_rec, str):
            provider_rec = json.loads(provider_rec)
        return str(rec_id), provider_rec

    def _query() -> tuple[str, dict] | None:
        with lock:
            with conn.cursor() as cur:
                if doc_type and language:
                    cur.execute(
                        _REUSE_P2_BASE
                        + f"  AND r.doc_type = %s\n"
                        + f"  AND d.metadata->>'language' = %s\n"
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [doc_type, language],
                    )
                    row = cur.fetchone()
                    if row:
                        return _parse(row)

                if doc_type:
                    cur.execute(
                        _REUSE_P2_BASE
                        + f"  AND r.doc_type = %s\n"
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [doc_type],
                    )
                else:
                    cur.execute(
                        _REUSE_P2_BASE
                        + f"  AND {size_cond}\n"
                        + "ORDER BY r.created_at DESC LIMIT 1",
                        [],
                    )
                row = cur.fetchone()
                return _parse(row) if row else None

    return await asyncio.to_thread(_query)

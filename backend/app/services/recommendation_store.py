"""Persistence layer for recommendations and feedback.

Exposes two async functions:
  - save_recommendation(record) — write one row to recommendations
  - save_feedback(request)      — write one row to recommendation_feedback;
                                  returns 'ok' | 'not_found' | 'duplicate'

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
_FEEDBACK_FALLBACK: dict[str, dict] = {}  # keyed by recommendation_id (enforces uniqueness)


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
) -> Literal["ok", "not_found", "duplicate"]:
    """Persist a feedback row.

    Returns:
        'ok'        — feedback written successfully
        'not_found' — recommendation_id does not exist
        'duplicate' — feedback already exists for this recommendation
    """
    conn = get_connection()

    if conn is None:
        if request.recommendation_id not in _RECS_FALLBACK:
            return "not_found"
        if request.recommendation_id in _FEEDBACK_FALLBACK:
            return "duplicate"
        _FEEDBACK_FALLBACK[request.recommendation_id] = request.model_dump()
        return "ok"

    lock = get_lock()

    def _write() -> Literal["ok", "not_found", "duplicate"]:
        with lock:
            with conn.cursor() as cur:
                # 404 check
                cur.execute(
                    "SELECT 1 FROM recommendations WHERE id = %s",
                    (request.recommendation_id,),
                )
                if cur.fetchone() is None:
                    return "not_found"

                try:
                    cur.execute(
                        """
                        INSERT INTO recommendation_feedback (
                            recommendation_id, outcome, notes,
                            final_chunking_strategy, final_chunk_size, final_overlap,
                            final_embedding_model, final_llm_model, final_top_k
                        ) VALUES (
                            %(recommendation_id)s, %(outcome)s, %(notes)s,
                            %(final_chunking_strategy)s, %(final_chunk_size)s, %(final_overlap)s,
                            %(final_embedding_model)s, %(final_llm_model)s, %(final_top_k)s
                        )
                        """,
                        request.model_dump(),
                    )
                    return "ok"
                except psycopg2.errors.UniqueViolation:
                    return "duplicate"

    return await asyncio.to_thread(_write)

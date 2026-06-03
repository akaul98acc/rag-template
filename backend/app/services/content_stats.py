"""Pure derivation logic for document content statistics.

This module contains threshold constants and the derive_content_stats function
that computes derived fields from raw extraction signals. No side effects,
no SDK imports - purely computational.
"""

from __future__ import annotations

import re
from typing import TypedDict

# Thresholds for text_density classification
TEXT_DENSITY_HIGH_THRESHOLD = 500  # words per page
TEXT_DENSITY_MEDIUM_THRESHOLD = 200  # words per page (inclusive lower bound)

# Thresholds for content_type classification
TABLE_RATIO_STRUCTURED_THRESHOLD = 0.5  # >= 0.5 means structured
TABLE_RATIO_PROSE_THRESHOLD = 0.2  # < 0.2 for prose
SENTENCE_LENGTH_STRUCTURED_THRESHOLD = 10  # < 10 means structured
SENTENCE_LENGTH_PROSE_THRESHOLD = 15  # >= 15 for prose

# Filename keyword patterns for doc_type inference (lowercased)
DOC_TYPE_KEYWORDS: dict[str, list[str]] = {
    "financial_statement": ["statement", "balance", "income", "cash flow", "cashflow"],
    "invoice": ["invoice"],
    "legal_contract": ["contract", "agreement", "nda"],
    "resume": ["resume", "cv"],
    "research_paper": ["paper", "journal", "abstract"],
    "report": ["report"],
}


class ContentStats(TypedDict):
    """Derived content statistics."""

    avg_words_per_page: float | None
    text_density: str | None
    table_ratio: float | None
    doc_type: str | None
    content_type: str | None
    avg_sentence_length: float | None


def derive_content_stats(
    word_count: int,
    page_count: int | None,
    sentence_count: int,
    table_char_count: int,
    total_char_count: int,
    filename: str,
) -> ContentStats:
    """Compute derived content statistics from raw extraction signals.

    Args:
        word_count: Total number of words in the document.
        page_count: Number of pages (may be None).
        sentence_count: Number of sentences in the document.
        table_char_count: Total characters across all table cells.
        total_char_count: Total characters in document content.
        filename: Original filename for doc_type inference.

    Returns:
        ContentStats dict with all derived fields.
    """
    # avg_words_per_page
    avg_words_per_page: float | None = None
    if page_count and page_count > 0 and word_count > 0:
        avg_words_per_page = round(word_count / page_count, 1)

    # text_density
    text_density: str | None = None
    if avg_words_per_page is not None:
        if avg_words_per_page > TEXT_DENSITY_HIGH_THRESHOLD:
            text_density = "high"
        elif avg_words_per_page >= TEXT_DENSITY_MEDIUM_THRESHOLD:
            text_density = "medium"
        else:
            text_density = "low"

    # table_ratio
    table_ratio: float | None = None
    if total_char_count > 0:
        raw_ratio = table_char_count / total_char_count
        # Clamp to [0, 1]
        clamped = max(0.0, min(1.0, raw_ratio))
        table_ratio = round(clamped, 2)
    elif table_char_count == 0:
        # No content and no tables -> 0.0
        table_ratio = 0.0

    # avg_sentence_length
    avg_sentence_length: float | None = None
    effective_sentence_count = sentence_count if sentence_count > 0 else 1
    if word_count > 0:
        avg_sentence_length = round(word_count / effective_sentence_count, 1)

    # doc_type - filename heuristic first
    doc_type = _infer_doc_type_from_filename(filename)
    if doc_type is None:
        # Fallback to structure-based inference
        if table_ratio is not None and table_ratio > 0.5:
            doc_type = "structured_data"
        else:
            doc_type = "general"

    # content_type
    content_type = _classify_content_type(table_ratio, avg_sentence_length)

    return ContentStats(
        avg_words_per_page=avg_words_per_page,
        text_density=text_density,
        table_ratio=table_ratio,
        doc_type=doc_type,
        content_type=content_type,
        avg_sentence_length=avg_sentence_length,
    )


def _infer_doc_type_from_filename(filename: str) -> str | None:
    """Infer document type from filename using keyword matching.

    Returns None if no match found.
    """
    lower_name = filename.lower()
    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in lower_name:
                return doc_type
    return None


def _classify_content_type(
    table_ratio: float | None, avg_sentence_length: float | None
) -> str | None:
    """Classify content as structured, prose, or mixed.

    Rules:
    - "structured" if table_ratio >= 0.5 OR avg_sentence_length < 10
    - "prose" if table_ratio < 0.2 AND avg_sentence_length >= 15
    - "mixed" otherwise
    """
    if table_ratio is None and avg_sentence_length is None:
        return None

    # Check structured conditions
    is_table_heavy = table_ratio is not None and table_ratio >= TABLE_RATIO_STRUCTURED_THRESHOLD
    is_short_sentences = (
        avg_sentence_length is not None
        and avg_sentence_length < SENTENCE_LENGTH_STRUCTURED_THRESHOLD
    )

    if is_table_heavy or is_short_sentences:
        return "structured"

    # Check prose conditions
    is_table_light = table_ratio is not None and table_ratio < TABLE_RATIO_PROSE_THRESHOLD
    is_long_sentences = (
        avg_sentence_length is not None
        and avg_sentence_length >= SENTENCE_LENGTH_PROSE_THRESHOLD
    )

    if is_table_light and is_long_sentences:
        return "prose"

    return "mixed"


def count_words(text: str) -> int:
    """Count words in text by splitting on whitespace."""
    if not text:
        return 0
    return len(text.split())


def count_sentences(text: str) -> int:
    """Count sentences by splitting on sentence-ending punctuation.

    Splits on '.', '!', '?' and ignores empty fragments.
    """
    if not text:
        return 0
    # Split on sentence-ending punctuation
    fragments = re.split(r"[.!?]+", text)
    # Filter out empty/whitespace-only fragments
    non_empty = [f for f in fragments if f.strip()]
    return len(non_empty)

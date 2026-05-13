from collections.abc import Callable
from dataclasses import dataclass

from app.core.config import settings
from app.models import DocumentMetadata, StrategyRecommendation


@dataclass
class RuleHit:
    chunk_size_tokens: int
    chunk_overlap_tokens: int
    embedding_model: str
    search_method: str
    rationale: str
    confidence: float


Rule = Callable[[DocumentMetadata], RuleHit | None]


def _tiny(meta: DocumentMetadata) -> RuleHit | None:
    if meta.size_bytes < 2 * 1024 * 1024 and (meta.page_count or 0) < 10:
        return RuleHit(
            chunk_size_tokens=256,
            chunk_overlap_tokens=32,
            embedding_model="text-embedding-3-small",
            search_method="cosine",
            rationale="Tiny document (<10 pages, <2MB) — small chunks + brute-force cosine is enough.",
            confidence=0.95,
        )
    return None


def _scanned(meta: DocumentMetadata) -> RuleHit | None:
    if meta.is_scanned:
        return RuleHit(
            chunk_size_tokens=1024,
            chunk_overlap_tokens=128,
            embedding_model="text-embedding-3-large",
            search_method="hybrid_bm25_dense",
            rationale="Scanned PDF — OCR upstream, larger chunks, hybrid search to compensate for OCR noise.",
            confidence=0.85,
        )
    return None


def _large(meta: DocumentMetadata) -> RuleHit | None:
    if (meta.page_count or 0) > 200 or meta.size_bytes > 50 * 1024 * 1024:
        return RuleHit(
            chunk_size_tokens=1024,
            chunk_overlap_tokens=128,
            embedding_model="text-embedding-3-large",
            search_method="hybrid_bm25_dense",
            rationale="Large document (>200 pages) — bigger chunks + hybrid retrieval.",
            confidence=0.9,
        )
    return None


def _medium(meta: DocumentMetadata) -> RuleHit | None:
    return RuleHit(
        chunk_size_tokens=512,
        chunk_overlap_tokens=64,
        embedding_model="text-embedding-3-large",
        search_method="faiss",
        rationale="Medium document — balanced chunk size with FAISS for fast ANN search.",
        confidence=0.75,
    )


RULES: list[Rule] = [_tiny, _scanned, _large, _medium]


async def recommend_strategy(meta: DocumentMetadata) -> StrategyRecommendation:
    for rule in RULES:
        hit = rule(meta)
        if hit is None:
            continue
        if hit.confidence >= settings.rule_confidence_threshold:
            return StrategyRecommendation(
                chunk_size_tokens=hit.chunk_size_tokens,
                chunk_overlap_tokens=hit.chunk_overlap_tokens,
                embedding_model=hit.embedding_model,
                search_method=hit.search_method,
                rationale=hit.rationale,
                source="rules",
                confidence=hit.confidence,
            )

    return await _llm_fallback(meta)


async def _llm_fallback(meta: DocumentMetadata) -> StrategyRecommendation:
    # Placeholder: real implementation should call Anthropic/OpenAI with `meta`
    # and parse a structured response. Returning a safe default for now.
    return StrategyRecommendation(
        chunk_size_tokens=512,
        chunk_overlap_tokens=64,
        embedding_model="text-embedding-3-large",
        search_method="faiss",
        rationale="LLM fallback not yet wired; returning safe defaults.",
        source="llm_fallback",
        confidence=0.5,
    )

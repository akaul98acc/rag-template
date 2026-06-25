"""Metadata-driven pipeline recommender for POST /api/recommend.

Tries Azure OpenAI (GPT-4o-mini) first to pick an embedding model, LLM model,
and chunking strategy from the document metadata, returning constrained JSON.
On any failure (not configured, SDK missing, transport/throttle/auth error,
malformed JSON, or out-of-vocab pick) it falls back to the existing
deterministic rules engine, so the endpoint never hard-fails. The ``source``
field on the result reflects which path produced it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, get_args

from fastapi import BackgroundTasks

from app.core.config import settings
from app.models import DocumentMetadata, PipelineRecommendation, RecommendationRecord
from app.models.strategy import ChunkingStrategy, EmbeddingModel, LLMModel
from app.services.recommendation_store import save_recommendation
from app.services.strategy_agent import recommend_strategy

logger = logging.getLogger(__name__)

# Allowed option vocabularies (derived from the Literal types so they cannot
# drift out of sync with the response model).
EMBEDDING_MODELS: tuple[str, ...] = get_args(EmbeddingModel)
LLM_MODELS: tuple[str, ...] = get_args(LLMModel)
CHUNKING_STRATEGIES: tuple[str, ...] = get_args(ChunkingStrategy)

# Defaults mirroring frontend/src/config/configuratorOptions.ts PARAMETER_CONFIGS.
DEFAULT_CHUNK_SIZE = 512
DEFAULT_OVERLAP = 64
DEFAULT_TOP_K = 5
DEFAULT_LLM_MODEL = "gpt-4o-mini"
DEFAULT_CONFIDENCE = 0.7

# Bound a single LLM call so a slow/hung request degrades to the rules path.
LLM_TIMEOUT_SECONDS = 20.0


def is_azure_openai_configured() -> bool:
    """True when endpoint, key, and deployment are all set."""
    return bool(
        settings.azure_openai_endpoint
        and settings.azure_openai_key
        and settings.azure_openai_deployment
    )


async def recommend_pipeline(
    meta: DocumentMetadata,
    background_tasks: BackgroundTasks | None = None,
    doc_id: str | None = None,
) -> PipelineRecommendation:
    """Recommend a pipeline configuration from document metadata.

    LLM-first with a deterministic rules fallback. Never raises for an
    LLM-side problem; only programming errors would propagate.
    Persists every result asynchronously via BackgroundTasks.
    """
    rec_id = str(uuid.uuid4())
    raw_llm_response: dict[str, Any] | None = None
    model_version: str

    if is_azure_openai_configured():
        try:
            result, raw_llm_response = await _llm_recommend(meta)
            model_version = (
                f"{settings.azure_openai_deployment}-{settings.azure_openai_api_version}"
            )
            logger.info(
                "Pipeline recommendation via LLM for %s: embedding=%s, llm=%s, chunking=%s",
                meta.filename,
                result.embedding_model,
                result.llm_model,
                result.chunking_strategy,
            )
        except Exception as exc:  # noqa: BLE001 - degrade gracefully on any LLM failure
            logger.warning(
                "Azure OpenAI recommendation failed, falling back to rules: %s", exc
            )
            result = await _rules_recommend(meta)
            model_version = "rules-v1"
    else:
        logger.info(
            "Azure OpenAI not configured - using rules engine for %s", meta.filename
        )
        result = await _rules_recommend(meta)
        model_version = "rules-v1"

    record = _build_record(rec_id, doc_id, meta, result, model_version, raw_llm_response)
    if background_tasks is not None:
        background_tasks.add_task(_persist_recommendation, record)
    else:
        asyncio.create_task(_persist_recommendation(record))

    return result.model_copy(update={"recommendation_id": rec_id})


def _build_record(
    rec_id: str,
    doc_id: str | None,
    meta: DocumentMetadata,
    result: PipelineRecommendation,
    model_version: str,
    raw_llm_response: dict[str, Any] | None,
) -> RecommendationRecord:
    return RecommendationRecord(
        rec_id=rec_id,
        doc_id=doc_id,
        source=result.source,
        model_version=model_version,
        confidence=result.confidence,
        raw_llm_response=raw_llm_response,
        filename=meta.filename,
        size_bytes=meta.size_bytes,
        page_count=meta.page_count,
        is_scanned=meta.is_scanned,
        has_tables=meta.has_tables,
        table_count=meta.tables,
        image_count=meta.images,
        doc_type=meta.doc_type,
        content_type=meta.content_type,
        text_density=meta.text_density,
        avg_words_per_page=meta.avg_words_per_page,
        table_ratio=meta.table_ratio,
        avg_sentence_length=meta.avg_sentence_length,
        chunking_strategy=result.chunking_strategy,
        chunk_size=result.chunk_size,
        overlap=result.overlap,
        embedding_model=result.embedding_model,
        llm_model=result.llm_model,
        top_k=result.top_k,
        rationale=result.rationale,
    )


async def _persist_recommendation(record: RecommendationRecord) -> None:
    try:
        await save_recommendation(record)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to persist recommendation %s: %s", record.rec_id, exc)


async def _llm_recommend(
    meta: DocumentMetadata,
) -> tuple[PipelineRecommendation, dict[str, Any]]:
    """Call Azure OpenAI and parse a validated recommendation.

    Returns the parsed recommendation and the raw LLM response dict.
    Raises on missing SDK, transport/API errors, malformed JSON, or an
    out-of-vocab pick (Pydantic Literal validation) - all caught by the caller.
    """
    from openai import AzureOpenAI  # lazy import: app boots without the SDK

    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_key,
        api_version=settings.azure_openai_api_version,
        timeout=LLM_TIMEOUT_SECONDS,
    )

    system_prompt = _build_system_prompt()
    user_prompt = (
        "Recommend a RAG pipeline configuration for a document with this metadata "
        "(JSON). Any null field is genuinely unknown.\n\n"
        f"{json.dumps(meta.model_dump(), indent=2)}"
    )

    # The OpenAI SDK is synchronous; run it off the event loop.
    completion = await asyncio.to_thread(
        client.chat.completions.create,
        model=settings.azure_openai_deployment,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    content = completion.choices[0].message.content or ""
    data = json.loads(content)

    # Clamp model-reported confidence to [0, 1]; default if absent/unparseable.
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence", DEFAULT_CONFIDENCE))))
    except (TypeError, ValueError):
        confidence = DEFAULT_CONFIDENCE

    # Literal validation rejects out-of-vocab picks -> raises -> rules fallback.
    rec = PipelineRecommendation(
        embedding_model=data["embedding_model"],
        llm_model=data["llm_model"],
        chunking_strategy=data["chunking_strategy"],
        chunk_size=int(data.get("chunk_size", DEFAULT_CHUNK_SIZE)),
        overlap=int(data.get("overlap", DEFAULT_OVERLAP)),
        top_k=int(data.get("top_k", DEFAULT_TOP_K)),
        rationale=str(data.get("rationale", "")),
        confidence=confidence,
        source="llm",
    )
    return rec, data


async def _rules_recommend(meta: DocumentMetadata) -> PipelineRecommendation:
    """Map the existing rules-engine output into a PipelineRecommendation."""
    strategy = await recommend_strategy(meta)
    return PipelineRecommendation(
        embedding_model=strategy.embedding_model,
        llm_model=DEFAULT_LLM_MODEL,
        chunking_strategy=_chunking_from_search_method(strategy.search_method),
        chunk_size=strategy.chunk_size_tokens,
        overlap=strategy.chunk_overlap_tokens,
        top_k=DEFAULT_TOP_K,
        rationale=strategy.rationale,
        confidence=strategy.confidence,
        source="rules",
    )


def _chunking_from_search_method(search_method: str) -> str:
    """Heuristic map (rules engine has no chunking-strategy concept).

    Hybrid retrieval (large/scanned docs) benefits from hierarchical splitting;
    everything else gets a predictable fixed strategy.
    """
    if search_method == "hybrid_bm25_dense":
        return "recursive"
    return "fixed"


def _build_system_prompt() -> str:
    return (
        "You are a RAG pipeline architect. Given document metadata, choose the best "
        "embedding model, LLM model, and chunking strategy, plus chunk_size, overlap, "
        "and top_k. Respond with a single JSON object and nothing else, using exactly "
        "these keys: embedding_model, llm_model, chunking_strategy, chunk_size, "
        "overlap, top_k, rationale, confidence.\n\n"
        f"embedding_model must be one of: {', '.join(EMBEDDING_MODELS)}.\n"
        f"llm_model must be one of: {', '.join(LLM_MODELS)}.\n"
        f"chunking_strategy must be one of: {', '.join(CHUNKING_STRATEGIES)}.\n"
        "chunk_size, overlap, and top_k are positive integers. "
        "confidence is a float in [0, 1]. rationale is one or two sentences "
        "explaining the choice based on the metadata."
    )

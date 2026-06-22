"""LLM-first provider recommender for POST /api/recommend-providers.

Given document metadata, picks the best provider ID for each pipeline stage
(storage, document_extraction, embedding, vector_search) from the live catalog.
Falls back to deterministic rules on any LLM failure.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.core.config import settings
from app.models import DocumentMetadata, ProviderRecommendation
from app.providers import full_catalog, get_provider
from app.services.pipeline_recommender import is_azure_openai_configured

logger = logging.getLogger(__name__)

# Bound a single LLM call so a slow/hung request degrades to the rules path.
LLM_TIMEOUT_SECONDS = 20.0

DEFAULT_CONFIDENCE = 0.6


async def recommend_providers(meta: DocumentMetadata) -> ProviderRecommendation:
    """Recommend a provider for each pipeline stage from document metadata.

    LLM-first with a deterministic rules fallback. Never raises for an
    LLM-side problem; only programming errors would propagate.
    """
    if is_azure_openai_configured():
        try:
            result = await _llm_recommend(meta)
            logger.info(
                "Provider recommendation via LLM for %s: storage=%s, doc_extraction=%s, "
                "embedding=%s, vector_search=%s",
                meta.filename,
                result.storage,
                result.document_extraction,
                result.embedding,
                result.vector_search,
            )
            return result
        except Exception as exc:  # noqa: BLE001 - degrade gracefully on any LLM failure
            logger.warning(
                "Azure OpenAI provider recommendation failed, falling back to rules: %s", exc
            )
    else:
        logger.info(
            "Azure OpenAI not configured - using rules engine for %s", meta.filename
        )

    return await _rules_recommend(meta)


async def _llm_recommend(meta: DocumentMetadata) -> ProviderRecommendation:
    """Call Azure OpenAI and parse a validated provider recommendation.

    Raises on missing SDK, transport/API errors, malformed JSON, or an
    invalid provider ID - all caught by the caller.
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
        "Recommend a RAG pipeline provider for each stage for a document with this metadata "
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

    storage_id = str(data["storage"])
    doc_extraction_id = str(data["document_extraction"])
    embedding_id = str(data["embedding"])
    vector_search_id = str(data["vector_search"])

    # Validate each provider ID exists in the catalog. KeyError -> rules fallback.
    get_provider("storage", storage_id)
    get_provider("document_extraction", doc_extraction_id)
    get_provider("embedding", embedding_id)
    get_provider("vector_search", vector_search_id)

    return ProviderRecommendation(
        storage=storage_id,
        document_extraction=doc_extraction_id,
        embedding=embedding_id,
        vector_search=vector_search_id,
        rationale=str(data.get("rationale", "")),
        confidence=confidence,
        source="llm",
    )


async def _rules_recommend(meta: DocumentMetadata) -> ProviderRecommendation:
    """Deterministic fallback using document metadata."""
    document_extraction = (
        "azure_di" if (meta.is_scanned or meta.has_tables) else "unstructured"
    )
    embedding = "azure_openai" if is_azure_openai_configured() else "openai"
    storage = "azure_blob"
    vector_search = "azure_ai_search" if (meta.page_count or 0) > 200 else "faiss_local"

    return ProviderRecommendation(
        storage=storage,
        document_extraction=document_extraction,
        embedding=embedding,
        vector_search=vector_search,
        rationale="Rules-based fallback: selected common providers for the document characteristics.",
        confidence=DEFAULT_CONFIDENCE,
        source="rules",
    )


def _build_system_prompt() -> str:
    catalog = full_catalog()
    catalog_lines: list[str] = []
    for stage, providers in catalog.items():
        for provider in providers:
            pid = provider["id"]
            name = provider.get("name", pid)
            description = provider.get("description", "")
            catalog_lines.append(f"  {stage}: {pid} ({name}) - {description}")

    valid_ids: dict[str, list[str]] = {}
    for stage, providers in catalog.items():
        valid_ids[stage] = [p["id"] for p in providers]

    catalog_block = "\n".join(catalog_lines)
    valid_block = "\n".join(
        f"  {stage}: {', '.join(ids)}" for stage, ids in valid_ids.items()
    )

    return (
        "You are a RAG pipeline architect. Given document metadata, choose the best "
        "provider for each pipeline stage. Respond with a single JSON object and nothing "
        "else, using exactly these keys: storage, document_extraction, embedding, "
        "vector_search, rationale, confidence.\n\n"
        "Available providers (stage: provider_id (Name) - description):\n"
        f"{catalog_block}\n\n"
        "Valid provider IDs per stage (you MUST pick from these):\n"
        f"{valid_block}\n\n"
        "confidence is a float in [0, 1]. rationale is one or two sentences "
        "explaining the choice based on the document metadata."
    )

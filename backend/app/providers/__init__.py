from app.providers.document_extraction import CATALOG as DOCEXTRACT
from app.providers.embedding import CATALOG as EMBEDDING
from app.providers.storage import CATALOG as STORAGE
from app.providers.vector_search import CATALOG as VECTOR

STAGES: dict[str, dict[str, dict]] = {
    "storage": STORAGE,
    "document_extraction": DOCEXTRACT,
    "embedding": EMBEDDING,
    "vector_search": VECTOR,
}


def full_catalog() -> dict:
    return {
        stage: [{"id": pid, **meta} for pid, meta in providers.items()]
        for stage, providers in STAGES.items()
    }


def get_provider(stage: str, provider_id: str) -> dict:
    try:
        meta = STAGES[stage][provider_id]
    except KeyError as exc:
        raise KeyError(provider_id) from exc
    return {"id": provider_id, **meta}

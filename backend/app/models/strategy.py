from typing import Literal

from pydantic import BaseModel, Field

# Allowed option vocabularies for the pipeline recommender. Mirrors
# frontend/src/config/configuratorOptions.ts so the recommender can only pick
# options the configurator UI knows about.
EmbeddingModel = Literal[
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
]
LLMModel = Literal["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
ChunkingStrategy = Literal[
    "auto",
    "fixed",
    "semantic",
    "sliding",
    "recursive",
    "sentence",
]


class StrategyRecommendation(BaseModel):
    chunk_size_tokens: int
    chunk_overlap_tokens: int
    embedding_model: str
    search_method: str = Field(..., description="e.g. 'cosine', 'faiss', 'hybrid_bm25_dense'")
    rationale: str
    source: str = Field(..., description="'rules' or 'llm_fallback'")
    confidence: float


class RecommendRequest(BaseModel):
    doc_id: str
    document_type: str | None = None


class PipelineRecommendation(BaseModel):
    """LLM- or rules-derived recommendation returned by POST /api/recommend.

    Enum fields are constrained to the known configurator vocabularies so an
    out-of-vocab LLM pick fails validation (and triggers the rules fallback)
    rather than reaching the client.
    """

    embedding_model: EmbeddingModel
    llm_model: LLMModel
    chunking_strategy: ChunkingStrategy
    chunk_size: int
    overlap: int
    top_k: int
    rationale: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["llm", "rules"]
    recommendation_id: str | None = None


class ProviderSelections(BaseModel):
    storage: str | None = None
    document_extraction: str | None = None
    embedding: str | None = None
    vector_search: str | None = None


class PipelineParams(BaseModel):
    chunk_size: int = 512
    overlap: int = 64
    embedding_model: str = "text-embedding-3-large"
    llm_model: str = "gpt-4o"
    chunking_strategy: str = "fixed"
    top_k: int = 5


class GenerateRequest(BaseModel):
    selections: ProviderSelections
    params: PipelineParams = Field(default_factory=PipelineParams)


class GenerateResponse(BaseModel):
    code: str
    language: str = "python"
    requires_env: list[str] = []


class NotebookResponse(BaseModel):
    notebook: dict
    filename: str = "rag_pipeline.ipynb"


class ProviderRecommendation(BaseModel):
    storage: str
    document_extraction: str
    embedding: str
    vector_search: str
    rationale: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["llm", "rules"]

from pydantic import BaseModel, Field


class StrategyRecommendation(BaseModel):
    chunk_size_tokens: int
    chunk_overlap_tokens: int
    embedding_model: str
    search_method: str = Field(..., description="e.g. 'cosine', 'faiss', 'hybrid_bm25_dense'")
    rationale: str
    source: str = Field(..., description="'rules' or 'llm_fallback'")
    confidence: float


class AnalyzeRequest(BaseModel):
    doc_id: str


class ProviderSelections(BaseModel):
    storage: str | None = None
    document_extraction: str | None = None
    embedding: str | None = None
    vector_search: str | None = None


class GenerateRequest(BaseModel):
    selections: ProviderSelections


class GenerateResponse(BaseModel):
    code: str
    language: str = "python"
    requires_env: list[str] = []

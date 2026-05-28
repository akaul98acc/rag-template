export type StageId =
  | "storage"
  | "document_extraction"
  | "embedding"
  | "vector_search";

export interface DocumentMetadata {
  size_bytes?: number;
  page_count?: number;
  mime_type?: string;
  language?: string;
  [key: string]: unknown;
}

export interface UploadResult {
  doc_id: string;
  metadata: DocumentMetadata;
}

export interface Recommendation {
  chunk_size_tokens: number;
  chunk_overlap_tokens: number;
  embedding_model: string;
  search_method: string;
  source: "rule" | "llm" | string;
  confidence: number;
  rationale: string;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  pricing_notes: string;
  requires_env: string[];
}

export type ProviderCatalog = Record<StageId, Provider[]>;

export interface GenerateResult {
  code: string;
  requires_env: string[];
}

export type Selections = Partial<Record<StageId, string>>;

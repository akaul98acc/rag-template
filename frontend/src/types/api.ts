export type StageId =
  | "storage"
  | "document_extraction"
  | "embedding"
  | "vector_search";

export interface DocumentMetadata {
  filename?: string;
  size_bytes?: number;
  page_count?: number;
  mime_type?: string;
  language?: string;
  has_tables?: boolean;
  is_scanned?: boolean;
  tables?: number;
  images?: number;
  // Derived content statistics (Azure Document Intelligence)
  avg_words_per_page?: number | null;
  text_density?: string | null;
  table_ratio?: number | null;
  doc_type?: string | null;
  content_type?: string | null;
  avg_sentence_length?: number | null;
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

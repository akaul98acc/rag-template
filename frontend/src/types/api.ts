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

/**
 * Response from POST /api/recommend (PipelineRecommendation). Richer than
 * Recommendation: also picks an LLM model, chunking strategy, and top_k.
 * `source` is "llm" when Azure OpenAI produced it, "rules" on local fallback.
 */
export interface PipelineRecommendation {
  embedding_model: string;
  llm_model: string;
  chunking_strategy: string;
  chunk_size: number;
  overlap: number;
  top_k: number;
  rationale: string;
  confidence: number;
  source: "llm" | "rules" | "past_recommendations";
  recommendation_id?: string | null;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  pricing_notes: string;
  requires_env: string[];
}

export type ProviderCatalog = Record<StageId, Provider[]>;

export interface PipelineParams {
  chunk_size: number;
  overlap: number;
  embedding_model: string;
  llm_model: string;
  chunking_strategy: string;
  top_k: number;
}

export interface GenerateResult {
  code: string;
  requires_env: string[];
}

export interface NotebookResult {
  notebook: Record<string, unknown>;
  filename: string;
}

export interface ProviderRecommendation {
  storage: string;
  document_extraction: string;
  embedding: string;
  vector_search: string;
  rationale: string;
  confidence: number;
  source: "llm" | "rules" | "past_recommendations";
  recommendation_id?: string | null;
}

export interface FeedbackRequest {
  recommendation_id: string;
  rating: number;
  phase: 1 | 2;
  outcome?: "accepted" | "modified" | "rejected";
  final_values?: Record<string, unknown>;
}

export type Selections = Partial<Record<StageId, string>>;

export interface HistoryItem {
  doc_id: string;
  filename: string;
  uploaded_at: string;
  metadata: DocumentMetadata;
  recommendation: PipelineRecommendation | null;
  provider_recommendation: ProviderRecommendation | null;
}

export interface Organization {
  org_id: string;
  name: string;
  org_code: string;
  website?: string | null;
  phone_number?: string | null;
  contact_person: string;
  plan_selected: string;
  created_from?: string | null;
  created_by: string;
  created_on: string;
  updated_on: string;
  updated_by: string;
}

export interface OrganizationListResponse {
  items: Organization[];
  total: number;
  page: number;
  page_size: number;
}

export interface OrganizationCreate {
  name: string;
  org_code: string;
  website?: string;
  phone_number?: string;
  contact_person: string;
  plan_selected: string;
  created_from?: string;
}

export interface OrganizationUpdate {
  name: string;
  website?: string;
  phone_number?: string;
  contact_person: string;
  plan_selected: string;
}

export interface Role {
  id: string;
  name: string;
  created_by: string;
  created_on: string;
  updated_by: string;
  updated_on: string;
  deleted_by?: string | null;
  deleted_on?: string | null;
}

export interface RoleListResponse {
  items: Role[];
  total: number;
  page: number;
  page_size: number;
}

export interface RoleCreate {
  name: string;
}

export interface RoleUpdate {
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone_number?: string | null;
  org_id: string | null;
  org_name?: string | null;
  role_id: string | null;
  role_name?: string | null;
  created_by: string;
  created_on: string;
  updated_by: string;
  updated_on: string;
  deleted_by?: string | null;
  deleted_on?: string | null;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserCreate {
  name: string;
  email: string;
  phone_number?: string;
  org_id: string;
  role_id: string;
}

export interface UserUpdate {
  name: string;
  phone_number?: string;
  role_id: string;
}

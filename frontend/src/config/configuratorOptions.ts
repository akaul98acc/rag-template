import type { OptionItem } from "@/components/OptionCard";

/**
 * Document size classification options.
 * These help the strategy agent pick appropriate chunking parameters.
 *
 * To add a new size option:
 * { id: "xlarge", title: "Extra Large", description: "1000+ pages" }
 */
export const DOCUMENT_SIZE_OPTIONS: OptionItem[] = [
  {
    id: "small",
    title: "Small",
    description: "<50 pages · 100KB",
  },
  {
    id: "medium",
    title: "Medium",
    description: "50–500 pages · 1–10MB",
  },
  {
    id: "large",
    title: "Large",
    description: "500+ pages · 10MB+",
  },
];

/**
 * Document type classification options.
 * Different document types benefit from different chunking strategies.
 */
export const DOCUMENT_TYPE_OPTIONS: OptionItem[] = [
  {
    id: "technical",
    title: "Technical docs",
    description: "Code, APIs, manuals",
  },
  {
    id: "legal",
    title: "Legal / contracts",
    description: "Dense, precise text",
  },
  {
    id: "research",
    title: "Research papers",
    description: "Academic, structured",
  },
  {
    id: "general",
    title: "General / mixed",
    description: "Reports, wikis, misc",
  },
];

/**
 * Embedding model options.
 * To add a new model, add an object to this array:
 *
 * Example:
 * { id: "cohere-embed-v3", title: "Cohere Embed v3", description: "Multilingual, high accuracy" }
 */
export const EMBEDDING_MODEL_OPTIONS: OptionItem[] = [
  {
    id: "auto",
    title: "Auto-select",
    description: "Agent picks: text-embedding-3-large",
    badge: { label: "recommended", variant: "recommended" },
  },
  {
    id: "text-embedding-3-small",
    title: "Ada 3 Small",
    description: "Fast · low cost · 1536 dims",
    badge: { label: "cost", variant: "cost" },
  },
  {
    id: "text-embedding-3-large",
    title: "Ada 3 Large",
    description: "High quality · 3072 dims",
    badge: { label: "perf", variant: "perf" },
  },
  {
    id: "text-embedding-ada-002",
    title: "Ada 002",
    description: "Legacy · widely deployed",
  },
];

/**
 * LLM model options for the RAG pipeline query phase.
 */
export const LLM_MODEL_OPTIONS: OptionItem[] = [
  {
    id: "auto",
    title: "Auto-select",
    description: "Agent picks: gpt-4o",
    badge: { label: "recommended", variant: "recommended" },
  },
  {
    id: "gpt-4o",
    title: "GPT-4o",
    description: "Best quality · higher cost",
    badge: { label: "perf", variant: "perf" },
  },
  {
    id: "gpt-4o-mini",
    title: "GPT-4o mini",
    description: "Fast · cost-efficient",
    badge: { label: "cost", variant: "cost" },
  },
  {
    id: "gpt-4-turbo",
    title: "GPT-4 Turbo",
    description: "128K context window",
  },
];

/**
 * Chunking strategy options.
 * Each strategy has different trade-offs for retrieval quality.
 */
export const CHUNKING_STRATEGY_OPTIONS: OptionItem[] = [
  {
    id: "auto",
    title: "Auto",
    description: "Agent decides",
    badge: { label: "recommended", variant: "recommended" },
  },
  {
    id: "fixed",
    title: "Fixed size",
    description: "Predictable · fast",
  },
  {
    id: "semantic",
    title: "Semantic",
    description: "Meaning-aware boundaries",
  },
  {
    id: "sliding",
    title: "Sliding window",
    description: "Overlap for continuity",
  },
  {
    id: "recursive",
    title: "Recursive",
    description: "Hierarchical splitting",
  },
  {
    id: "sentence",
    title: "Sentence",
    description: "NLP sentence detection",
  },
];

/**
 * Parameter slider configurations.
 */
export interface ParameterConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export const PARAMETER_CONFIGS: ParameterConfig[] = [
  {
    id: "chunk_size",
    label: "Chunk size (tokens)",
    min: 64,
    max: 2048,
    step: 64,
    defaultValue: 512,
  },
  {
    id: "chunk_overlap",
    label: "Chunk overlap",
    min: 0,
    max: 256,
    step: 8,
    defaultValue: 64,
  },
  {
    id: "top_k",
    label: "Top-K results",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: 5,
  },
];

/**
 * Helper to get the vector dimensions for an embedding model.
 */
export function getEmbeddingDimensions(modelId: string): number {
  const dims: Record<string, number> = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    auto: 3072, // Assume large for auto
  };
  return dims[modelId] ?? 1536;
}

/**
 * Helper to estimate embedding cost per 1K tokens.
 */
export function getEmbeddingCost(modelId: string): string {
  const costs: Record<string, string> = {
    "text-embedding-3-small": "$0.00002",
    "text-embedding-3-large": "$0.00013",
    "text-embedding-ada-002": "$0.00010",
    auto: "$0.00013",
  };
  return costs[modelId] ?? "N/A";
}

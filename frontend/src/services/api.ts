import axios from "axios";

import type {
  GenerateResult,
  PipelineRecommendation,
  ProviderCatalog,
  Selections,
  UploadResult,
} from "@/types/api";

const client = axios.create({ baseURL: "/api" });

export type UploadProgressCallback = (progress: number) => void;

export async function uploadDocument(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<UploadResult>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percent);
          }
        }
      : undefined,
  });
  // End-to-end integration check: log the raw /api/upload response.
  console.log("[upload] /api/upload response:", data);
  return data;
}

/**
 * Get an LLM-driven pipeline recommendation for an uploaded document.
 *
 * Called straight after `/upload` using the `doc_id` from its response. The
 * backend tries Azure OpenAI first and transparently falls back to the local
 * rules engine (reflected in `source`), so this never hard-fails on LLM issues.
 */
export async function recommendPipeline(
  docId: string
): Promise<PipelineRecommendation> {
  const { data } = await client.post<PipelineRecommendation>("/recommend", {
    doc_id: docId,
  });
  return data;
}

export async function fetchProviders(): Promise<ProviderCatalog> {
  const { data } = await client.get<ProviderCatalog>("/providers");
  return data;
}

export async function generateCode(
  selections: Selections
): Promise<GenerateResult> {
  const { data } = await client.post<GenerateResult>("/generate", {
    selections,
  });
  return data;
}

import axios from "axios";

import type {
  GenerateResult,
  HistoryItem,
  NotebookResult,
  PipelineParams,
  PipelineRecommendation,
  ProviderCatalog,
  ProviderRecommendation,
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
  docId: string,
  documentType?: string
): Promise<PipelineRecommendation> {
  const { data } = await client.post<PipelineRecommendation>("/recommend", {
    doc_id: docId,
    ...(documentType ? { document_type: documentType } : {}),
  });
  return data;
}

export async function recommendProviders(
  docId: string
): Promise<ProviderRecommendation> {
  const { data } = await client.post<ProviderRecommendation>(
    "/recommend-providers",
    { doc_id: docId }
  );
  return data;
}

export async function fetchProviders(): Promise<ProviderCatalog> {
  const { data } = await client.get<ProviderCatalog>("/providers");
  return data;
}

export async function generateCode(
  selections: Selections,
  params?: PipelineParams
): Promise<GenerateResult> {
  const { data } = await client.post<GenerateResult>("/generate", {
    selections,
    ...(params ? { params } : {}),
  });
  return data;
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const response = await client.get<{ items: HistoryItem[] }>("/history");
  return response.data.items;
}

export async function generateNotebook(
  selections: Selections,
  params?: PipelineParams
): Promise<void> {
  const { data } = await client.post<NotebookResult>("/generate-notebook", {
    selections,
    ...(params ? { params } : {}),
  });
  const blob = new Blob([JSON.stringify(data.notebook, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename;
  a.click();
  URL.revokeObjectURL(url);
}

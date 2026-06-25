import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUpload } from "@/contexts/UploadContext";

import DocumentUploadSection from "@/components/DocumentUploadSection";
import { OptionCardGrid, type OptionItem } from "@/components/OptionCard";
import { ParameterSliders } from "@/components/ParameterSlider";
import { StatCards } from "@/components/StatCard";
import CodeViewer from "@/components/CodeViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { recommendPipeline, generateCode, generateNotebook } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type {
  PipelineRecommendation,
  UploadResult,
  GenerateResult,
} from "@/types/api";
import {
  DOCUMENT_SIZE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  EMBEDDING_MODEL_OPTIONS,
  LLM_MODEL_OPTIONS,
  CHUNKING_STRATEGY_OPTIONS,
  PARAMETER_CONFIGS,
  getEmbeddingDimensions,
  getEmbeddingCost,
} from "@/config/configuratorOptions";

type TabValue = "configure" | "decisions" | "code" | "features";

interface ConfigState {
  documentSize: string;
  documentType: string;
  embeddingModel: string;
  llmModel: string;
  chunkingStrategy: string;
  parameters: Record<string, number>;
}

const DEFAULT_CONFIG: ConfigState = {
  documentSize: "",
  documentType: "",
  embeddingModel: "auto",
  llmModel: "auto",
  chunkingStrategy: "auto",
  parameters: {
    chunk_size: 512,
    chunk_overlap: 64,
    top_k: 5,
  },
};

/**
 * Infer document size from metadata.
 */
function inferDocumentSize(pageCount?: number, sizeBytes?: number): string {
  if (!pageCount && !sizeBytes) return "";
  const pages = pageCount ?? 0;
  const sizeMB = (sizeBytes ?? 0) / (1024 * 1024);

  if (pages < 50 && sizeMB < 0.1) return "small";
  if (pages >= 500 || sizeMB >= 10) return "large";
  return "medium";
}

/**
 * Generic helper to update option arrays with recommendation-based badges.
 * Strips "recommended" badge from the "auto" option and moves it to the
 * actual recommended option. Keeps cost/perf badges on other options.
 */
function applyRecommendationBadge(
  options: OptionItem[],
  recommendedId: string | undefined,
  autoDescription?: string
): OptionItem[] {
  if (!recommendedId) return options;

  return options.map((opt) => {
    // Update auto-select description and strip its "recommended" badge
    if (opt.id === "auto") {
      return {
        ...opt,
        description: autoDescription ?? opt.description,
        badge: undefined,
      };
    }
    // Add recommended badge to the option that matches recommendation
    if (opt.id === recommendedId) {
      return {
        ...opt,
        badge: { label: "recommended", variant: "recommended" as const },
      };
    }
    // Remove stale "recommended" badges from other options; keep cost/perf
    if (opt.badge?.variant === "recommended") {
      return { ...opt, badge: undefined };
    }
    return opt;
  });
}

export default function Step1() {
  const [activeTab, setActiveTab] = useState<TabValue>("configure");
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [recommendation, setRecommendation] =
    useState<PipelineRecommendation | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [generated, setGenerated] = useState<GenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingNotebook, setGeneratingNotebook] = useState(false);

  const { setUploadResult } = useUpload();
  const navigate = useNavigate();

  // Update options based on recommendation
  const embeddingOptions = useMemo(
    () =>
      applyRecommendationBadge(
        EMBEDDING_MODEL_OPTIONS,
        recommendation?.embedding_model,
        recommendation
          ? `Agent picks: ${recommendation.embedding_model}`
          : undefined
      ),
    [recommendation]
  );

  const llmOptions = useMemo(
    () =>
      applyRecommendationBadge(
        LLM_MODEL_OPTIONS,
        recommendation?.llm_model,
        recommendation ? `Agent picks: ${recommendation.llm_model}` : undefined
      ),
    [recommendation]
  );

  const chunkingOptions = useMemo(
    () =>
      applyRecommendationBadge(
        CHUNKING_STRATEGY_OPTIONS,
        recommendation?.chunking_strategy,
        recommendation
          ? `Agent picks: ${recommendation.chunking_strategy}`
          : undefined
      ),
    [recommendation]
  );

  async function handleUploaded(result: UploadResult) {
    setUpload(result);
    setUploadResult(result);
    setRecommendation(null);
    setGenerated(null);
    setAnalyzing(true);

    // Auto-infer document size and type from metadata
    const inferredSize = inferDocumentSize(
      result.metadata.page_count,
      result.metadata.size_bytes
    );
    const inferredDocType = result.metadata.doc_type ?? "";
    setConfig((prev) => ({
      ...prev,
      documentSize: inferredSize || prev.documentSize,
      documentType: inferredDocType || prev.documentType,
    }));

    try {
      // Feed the doc_id and inferred doc type into /recommend. The backend
      // uses Azure OpenAI when configured and falls back to the local rules
      // engine otherwise (rec.source reflects which path produced the result).
      const rec = await recommendPipeline(result.doc_id, inferredDocType || undefined);
      setRecommendation(rec);

      // Apply the recommended picks + parameters to the configurator so the
      // agent's choices are reflected in the UI.
      setConfig((prev) => ({
        ...prev,
        embeddingModel: rec.embedding_model,
        llmModel: rec.llm_model,
        chunkingStrategy: rec.chunking_strategy,
        parameters: {
          ...prev.parameters,
          chunk_size: rec.chunk_size,
          chunk_overlap: rec.overlap,
          top_k: rec.top_k,
        },
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Recommendation failed";
      toast({
        variant: "destructive",
        title: "Recommendation failed",
        description: message,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function updateConfig<K extends keyof ConfigState>(
    key: K,
    value: ConfigState[K]
  ) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function updateParameter(id: string, value: number) {
    setConfig((prev) => ({
      ...prev,
      parameters: { ...prev.parameters, [id]: value },
    }));
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const params = {
        chunk_size: config.parameters.chunk_size ?? 512,
        overlap: config.parameters.chunk_overlap ?? 64,
        embedding_model:
          config.embeddingModel === "auto"
            ? "text-embedding-3-large"
            : config.embeddingModel,
        llm_model:
          config.llmModel === "auto" ? "gpt-4o" : config.llmModel,
        chunking_strategy:
          config.chunkingStrategy === "auto" ? "fixed" : config.chunkingStrategy,
        top_k: config.parameters.top_k ?? 5,
      };
      // Step 1 uses Azure-locked selections
      const result = await generateCode(
        {
          storage: "azure_blob",
          document_extraction: "azure_di",
          embedding: "azure_openai",
          vector_search: "azure_ai_search",
        },
        params
      );
      setGenerated(result);
      setActiveTab("code");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Code generation failed";
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: message,
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateNotebook() {
    setGeneratingNotebook(true);
    try {
      const params = {
        chunk_size: config.parameters.chunk_size ?? 512,
        overlap: config.parameters.chunk_overlap ?? 64,
        embedding_model:
          config.embeddingModel === "auto"
            ? "text-embedding-3-large"
            : config.embeddingModel,
        llm_model:
          config.llmModel === "auto" ? "gpt-4o" : config.llmModel,
        chunking_strategy:
          config.chunkingStrategy === "auto" ? "fixed" : config.chunkingStrategy,
        top_k: config.parameters.top_k ?? 5,
      };
      await generateNotebook(
        {
          storage: "azure_blob",
          document_extraction: "azure_di",
          embedding: "azure_openai",
          vector_search: "azure_ai_search",
        },
        params
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Notebook generation failed";
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: message,
      });
    } finally {
      setGeneratingNotebook(false);
    }
  }

  function handleReset() {
    setUpload(null);
    setUploadResult(null);
    setRecommendation(null);
    setGenerated(null);
    setConfig(DEFAULT_CONFIG);
    setActiveTab("configure");
  }

  // Calculate stats for display
  const selectedEmbedding =
    config.embeddingModel === "auto" && recommendation
      ? recommendation.embedding_model
      : config.embeddingModel;
  const vectorDims = getEmbeddingDimensions(selectedEmbedding);
  const embedCost = getEmbeddingCost(selectedEmbedding);

  const stats = [
    { value: config.parameters.chunk_size ?? 512, label: "Chunk tokens" },
    { value: vectorDims ?? 3072, label: "Vector dims", highlight: true },
    { value: `${embedCost}/1K`, label: "Embed cost" },
    { value: "~$0.01/query", label: "Query cost" },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold mt-0 mb-1">
            Step 1: Strategy Agent
          </h2>
          <p className="text-fg-muted text-sm m-0">
            Upload a document and configure your RAG pipeline strategy.
          </p>
        </div>
        {upload && (
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset
          </Button>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="decisions" disabled={!recommendation}>
            Agent Decisions
          </TabsTrigger>
          <TabsTrigger value="code" disabled={!generated}>
            Generated Code
          </TabsTrigger>
          <TabsTrigger value="features" disabled>
            Features
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configure">
          <DocumentUploadSection
            onUploaded={handleUploaded}
            uploadResult={upload}
          />

          {analyzing && (
            <div className="bg-surface border border-border rounded-lg p-6 mb-6 text-center">
              <p className="text-fg-muted">Analyzing document...</p>
            </div>
          )}

          {(upload || !analyzing) && (
            <>
              <OptionCardGrid
                heading="Document Size"
                options={DOCUMENT_SIZE_OPTIONS.map((opt) => ({
                  ...opt,
                  badge:
                    config.documentSize === opt.id && upload
                      ? { label: "detected", variant: "recommended" as const }
                      : opt.badge,
                }))}
                selected={config.documentSize}
                onSelect={(id) => updateConfig("documentSize", id)}
                columns={3}
              />

              <OptionCardGrid
                heading="Document Type"
                options={DOCUMENT_TYPE_OPTIONS}
                selected={config.documentType}
                onSelect={(id) => updateConfig("documentType", id)}
                columns={4}
              />

              <OptionCardGrid
                heading="Embedding Model"
                options={embeddingOptions}
                selected={config.embeddingModel}
                onSelect={(id) => updateConfig("embeddingModel", id)}
                columns={4}
              />

              <OptionCardGrid
                heading="LLM Model"
                options={llmOptions}
                selected={config.llmModel}
                onSelect={(id) => updateConfig("llmModel", id)}
                columns={4}
              />

              <OptionCardGrid
                heading="Chunking Strategy"
                options={chunkingOptions}
                selected={config.chunkingStrategy}
                onSelect={(id) => updateConfig("chunkingStrategy", id)}
                columns={3}
              />

              <ParameterSliders
                parameters={PARAMETER_CONFIGS}
                values={config.parameters}
                onChange={updateParameter}
              />

              <StatCards stats={stats} className="mb-6" />

              {/* Azure Provider Badges (read-only) */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
                  Pipeline Providers (Azure-locked)
                </h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="muted">Storage: Azure Blob Storage</Badge>
                  <Badge variant="muted">
                    Extraction: Azure Document Intelligence
                  </Badge>
                  <Badge variant="muted">Embedding: Azure OpenAI</Badge>
                  <Badge variant="muted">
                    Vector Search: Azure AI Search
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="success"
                  onClick={handleGenerate}
                  disabled={generating || !upload}
                  aria-label="Generate pipeline code"
                >
                  {generating ? "Generating..." : "Generate Code"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleGenerateNotebook}
                  disabled={generatingNotebook || !upload}
                  aria-label="Download pipeline as Jupyter notebook"
                >
                  {generatingNotebook ? "Generating..." : "Generate Notebook"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/step2")}
                  disabled={!upload}
                  aria-label="Compare providers in Step 2"
                >
                  Select Provider
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="decisions">
          {recommendation && (
            <div className="bg-surface border border-border rounded-lg p-6">
              <h3 className="mt-0 mb-4 text-lg font-semibold">
                Agent Recommendations
              </h3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
                <dt className="text-fg-muted">Embedding model</dt>
                <dd className="text-fg font-medium">
                  {recommendation.embedding_model}
                </dd>
                <dt className="text-fg-muted">LLM model</dt>
                <dd className="text-fg font-medium">
                  {recommendation.llm_model}
                </dd>
                <dt className="text-fg-muted">Chunking strategy</dt>
                <dd className="text-fg font-medium">
                  {recommendation.chunking_strategy}
                </dd>
                <dt className="text-fg-muted">Chunk size</dt>
                <dd className="text-fg font-medium">
                  {recommendation.chunk_size} tokens
                </dd>
                <dt className="text-fg-muted">Chunk overlap</dt>
                <dd className="text-fg font-medium">
                  {recommendation.overlap} tokens
                </dd>
                <dt className="text-fg-muted">Top-K results</dt>
                <dd className="text-fg font-medium">{recommendation.top_k}</dd>
                <dt className="text-fg-muted">Decision source</dt>
                <dd className="text-fg font-medium">
                  {recommendation.source === "llm"
                    ? "LLM (Azure OpenAI)"
                    : "Rules engine (fallback)"}{" "}
                  ({Math.round(recommendation.confidence * 100)}% confidence)
                </dd>
              </dl>
              <div className="mt-4 p-4 bg-hover-soft rounded-lg">
                <p className="text-sm text-fg-muted italic m-0">
                  {recommendation.rationale}
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="code">
          {generated && (
            <CodeViewer
              code={generated.code}
              requiresEnv={generated.requires_env}
            />
          )}
        </TabsContent>

        <TabsContent value="features">
          <div className="bg-surface border border-border rounded-lg p-6 text-center text-fg-muted">
            Feature comparison coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

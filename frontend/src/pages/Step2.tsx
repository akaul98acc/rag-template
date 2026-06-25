import { useEffect, useState, useMemo } from "react";

import CodeViewer from "@/components/CodeViewer";
import { OptionCardGrid, type OptionItem } from "@/components/OptionCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchProviders,
  generateCode,
  generateNotebook,
  recommendProviders,
} from "@/services/api";
import { useUpload } from "@/contexts/UploadContext";
import { toast } from "@/hooks/use-toast";
import type {
  GenerateResult,
  ProviderCatalog,
  ProviderRecommendation,
  Provider,
  Selections,
  StageId,
} from "@/types/api";

type TabValue = "configure" | "compare" | "code";

const STAGES: { id: StageId; label: string; columns: 2 | 3 | 4 | "auto" }[] = [
  { id: "storage", label: "Storage Provider", columns: "auto" },
  { id: "document_extraction", label: "Document Extraction", columns: "auto" },
  { id: "embedding", label: "Embedding Provider", columns: "auto" },
  { id: "vector_search", label: "Vector Search", columns: "auto" },
];

/**
 * Convert a Provider from the API to an OptionItem for the card grid.
 */
function providerToOption(provider: Provider): OptionItem {
  return {
    id: provider.id,
    title: provider.name,
    description: provider.description,
    // Add cost badge for providers with pricing notes mentioning "free" or "$"
    badge: provider.pricing_notes.toLowerCase().includes("free")
      ? { label: "free", variant: "cost" }
      : undefined,
  };
}

/**
 * Convert a stage's providers to OptionItems.
 */
function getStageOptions(
  catalog: ProviderCatalog | null,
  stageId: StageId
): OptionItem[] {
  if (!catalog) return [];
  const providers = catalog[stageId] ?? [];
  return providers.map(providerToOption);
}

/**
 * Apply a "recommended" badge to the option matching recommendedId.
 * Strips stale "recommended" badges from all other options.
 */
function applyRecommendationBadge(
  options: OptionItem[],
  recommendedId: string | undefined
): OptionItem[] {
  if (!recommendedId) return options;
  return options.map((opt) => {
    if (opt.id === recommendedId) {
      return { ...opt, badge: { label: "recommended", variant: "recommended" as const } };
    }
    if (opt.badge?.variant === "recommended") {
      return { ...opt, badge: undefined };
    }
    return opt;
  });
}

export default function Step2() {
  const [activeTab, setActiveTab] = useState<TabValue>("configure");
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selections>({});
  const [generated, setGenerated] = useState<GenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingNotebook, setGeneratingNotebook] = useState(false);
  const [providerRec, setProviderRec] = useState<ProviderRecommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const { uploadResult } = useUpload();

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    fetchProviders()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load provider catalog";
        setCatalogError(message);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-recommend providers when both catalog and upload result are available
  useEffect(() => {
    if (!catalog || !uploadResult) return;
    let cancelled = false;
    setRecLoading(true);
    setRecError(null);
    recommendProviders(uploadResult.doc_id)
      .then((rec) => {
        if (cancelled) return;
        setProviderRec(rec);
        setSelections({
          storage: rec.storage,
          document_extraction: rec.document_extraction,
          embedding: rec.embedding,
          vector_search: rec.vector_search,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRecError(
          err instanceof Error
            ? err.message
            : "Could not get provider recommendations"
        );
      })
      .finally(() => {
        if (!cancelled) setRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, uploadResult]);

  // Get selected providers for comparison
  const selectedProviders = useMemo(() => {
    if (!catalog) return [];
    return STAGES.map((stage) => {
      const providerId = selections[stage.id];
      const providers = catalog[stage.id] ?? [];
      const provider = providers.find((p) => p.id === providerId);
      return {
        stage: stage.label,
        provider,
      };
    }).filter((s) => s.provider);
  }, [catalog, selections]);

  // Apply recommendation badges per stage
  const stageOptions = useMemo(() => {
    return Object.fromEntries(
      STAGES.map((stage) => {
        const options = getStageOptions(catalog, stage.id);
        const recId = providerRec?.[stage.id as keyof ProviderRecommendation] as
          | string
          | undefined;
        return [stage.id, applyRecommendationBadge(options, recId)];
      })
    ) as Record<StageId, OptionItem[]>;
  }, [catalog, providerRec]);

  function select(stage: StageId, providerId: string) {
    setSelections((prev) => ({ ...prev, [stage]: providerId }));
    setGenerated(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateCode(selections);
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
      await generateNotebook(selections);
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
    setSelections({});
    setGenerated(null);
    setProviderRec(null);
    setRecError(null);
    setActiveTab("configure");
  }

  if (catalogLoading) {
    return (
      <section>
        <h2 className="text-2xl font-semibold mt-0 mb-2">
          Step 2: Provider Comparator
        </h2>
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <p className="text-fg-muted">Loading provider catalog...</p>
        </div>
      </section>
    );
  }

  if (catalogError) {
    return (
      <section>
        <h2 className="text-2xl font-semibold mt-0 mb-2">
          Step 2: Provider Comparator
        </h2>
        <div
          role="alert"
          className="bg-surface border border-danger text-error-text rounded-lg p-4"
        >
          {catalogError}
        </div>
      </section>
    );
  }

  if (
    !catalog ||
    Object.values(catalog).every((arr) => !arr || arr.length === 0)
  ) {
    return (
      <section>
        <h2 className="text-2xl font-semibold mt-0 mb-2">
          Step 2: Provider Comparator
        </h2>
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <p className="text-fg-muted">No providers configured.</p>
        </div>
      </section>
    );
  }

  const hasSelections = Object.keys(selections).length > 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold mt-0 mb-1">
            Step 2: Provider Comparator
          </h2>
          <p className="text-fg-muted text-sm m-0">
            Select providers for each pipeline stage and generate code.
          </p>
        </div>
        {hasSelections && (
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
          <TabsTrigger value="compare" disabled={!hasSelections}>
            Compare
          </TabsTrigger>
          <TabsTrigger value="code" disabled={!generated}>
            Generated Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configure">
          {recLoading && (
            <div className="bg-surface border border-border rounded-lg px-4 py-3 mb-4 text-sm text-fg-muted">
              Getting provider recommendations&hellip;
            </div>
          )}
          {recError && (
            <div
              role="alert"
              className="bg-surface border border-danger rounded-lg px-4 py-3 mb-4 text-sm text-error-text flex items-center justify-between"
            >
              <span>Could not load recommendations: {recError}</span>
              <button
                onClick={() => setRecError(null)}
                className="ml-4 text-fg-muted hover:text-fg"
              >
                &times;
              </button>
            </div>
          )}

          {STAGES.map((stage) => {
            const options = stageOptions[stage.id] ?? [];
            if (options.length === 0) return null;

            return (
              <OptionCardGrid
                key={stage.id}
                heading={stage.label}
                options={options}
                selected={selections[stage.id]}
                onSelect={(id) => select(stage.id, id)}
                columns={stage.columns}
              />
            );
          })}

          {providerRec && (
            <div className="mb-4 p-4 bg-hover-soft rounded-lg">
              <p className="text-sm text-fg-muted italic m-0">
                {providerRec.rationale}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="success"
              onClick={handleGenerate}
              disabled={!hasSelections || generating}
              aria-label="Generate pipeline code from selected providers"
            >
              {generating ? "Generating..." : "Generate Code"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleGenerateNotebook}
              disabled={!hasSelections || generatingNotebook}
              aria-label="Download pipeline as Jupyter notebook"
            >
              {generatingNotebook ? "Generating..." : "Generate Notebook"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-hover-soft">
                  <th className="text-left p-4 font-semibold text-fg">Stage</th>
                  <th className="text-left p-4 font-semibold text-fg">
                    Provider
                  </th>
                  <th className="text-left p-4 font-semibold text-fg">
                    Description
                  </th>
                  <th className="text-left p-4 font-semibold text-fg">
                    Pricing
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedProviders.map(({ stage, provider }) =>
                  provider ? (
                    <tr
                      key={stage}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="p-4 text-fg-muted">{stage}</td>
                      <td className="p-4 font-medium text-fg">
                        {provider.name}
                      </td>
                      <td className="p-4 text-fg-muted">
                        {provider.description}
                      </td>
                      <td className="p-4 text-fg-subtle text-xs">
                        {provider.pricing_notes}
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
            {selectedProviders.length === 0 && (
              <div className="p-6 text-center text-fg-muted">
                Select providers to compare.
              </div>
            )}
          </div>

          {selectedProviders.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
                Required Environment Variables
              </h4>
              <div className="bg-surface border border-border rounded-lg p-4">
                {(() => {
                  const allEnvVars = selectedProviders.flatMap(
                    ({ provider }) => provider?.requires_env ?? []
                  );
                  const uniqueEnvVars = [...new Set(allEnvVars)];
                  if (uniqueEnvVars.length === 0) {
                    return (
                      <p className="text-fg-muted text-sm m-0">
                        No environment variables required.
                      </p>
                    );
                  }
                  return (
                    <code className="text-sm text-fg font-mono">
                      {uniqueEnvVars.join(", ")}
                    </code>
                  );
                })()}
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
      </Tabs>
    </section>
  );
}

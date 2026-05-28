import { useEffect, useState } from "react";

import CodeViewer from "@/components/CodeViewer";
import ProviderSelector from "@/components/ProviderSelector";
import { Button } from "@/components/ui/button";
import { fetchProviders, generateCode } from "@/services/api";
import type {
  GenerateResult,
  ProviderCatalog,
  Selections,
  StageId,
} from "@/types/api";

const STAGES: StageId[] = [
  "storage",
  "document_extraction",
  "embedding",
  "vector_search",
];

export default function Phase2() {
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selections>({});
  const [generated, setGenerated] = useState<GenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
          err instanceof Error ? err.message : "Failed to load provider catalog";
        setCatalogError(message);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function select(stage: StageId, providerId: string) {
    setSelections((prev) => ({ ...prev, [stage]: providerId }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateCode(selections);
      setGenerated(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Code generation failed";
      setGenerateError(message);
    } finally {
      setGenerating(false);
    }
  }

  if (catalogLoading) {
    return <p className="text-fg-muted">Loading catalog…</p>;
  }

  if (catalogError) {
    return (
      <p
        role="alert"
        className="bg-surface border border-danger text-error-text rounded-lg p-3"
      >
        {catalogError}
      </p>
    );
  }

  if (
    !catalog ||
    Object.values(catalog).every((arr) => !arr || arr.length === 0)
  ) {
    return <p className="text-fg-muted">No providers configured.</p>;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold mt-0 mb-2">
        Phase 2 · Compare providers & generate code
      </h2>
      {STAGES.map((stage) => (
        <ProviderSelector
          key={stage}
          stage={stage}
          providers={catalog[stage] ?? []}
          selected={selections[stage]}
          onSelect={(pid) => select(stage, pid)}
        />
      ))}
      <Button
        variant="success"
        onClick={handleGenerate}
        disabled={Object.keys(selections).length === 0 || generating}
        aria-label="Generate pipeline code from selected providers"
      >
        {generating ? "Generating…" : "Generate Code"}
      </Button>
      {generateError && (
        <p
          role="alert"
          className="bg-surface border border-danger text-error-text rounded-lg p-3 my-5"
        >
          {generateError}
        </p>
      )}
      {generated && (
        <CodeViewer
          code={generated.code}
          requiresEnv={generated.requires_env}
        />
      )}
    </section>
  );
}

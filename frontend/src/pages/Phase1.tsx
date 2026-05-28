import { useState } from "react";

import DocumentUpload from "@/components/DocumentUpload";
import StrategyRecommendation from "@/components/StrategyRecommendation";
import { Button } from "@/components/ui/button";
import { analyzeDocument } from "@/services/api";
import type { Recommendation, UploadResult } from "@/types/api";

export default function Phase1() {
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUploaded(result: UploadResult) {
    setUpload(result);
    setRecommendation(null);
    setError(null);
    setLoading(true);
    try {
      const rec = await analyzeDocument(result.doc_id);
      setRecommendation(rec);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Analysis failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setUpload(null);
    setRecommendation(null);
    setError(null);
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold mt-0 mb-2">
        Phase 1 · Strategy Agent
      </h2>
      <p className="text-fg-muted mb-5">
        Upload a document. The agent will recommend chunking, embedding, and
        search settings.
      </p>
      <DocumentUpload onUploaded={handleUploaded} />
      {!upload && !loading && !error && (
        <p className="text-fg-muted">Upload a document to begin.</p>
      )}
      {upload && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-5">
          <h3 className="mt-0 mb-3 text-lg font-semibold">Document metadata</h3>
          <pre className="font-mono text-sm whitespace-pre-wrap m-0">
            {JSON.stringify(upload.metadata, null, 2)}
          </pre>
        </div>
      )}
      {loading && <p className="text-fg-muted">Analyzing…</p>}
      {error && (
        <p
          role="alert"
          className="bg-surface border border-danger text-error-text rounded-lg p-3 mb-5"
        >
          {error}
        </p>
      )}
      {recommendation && (
        <StrategyRecommendation recommendation={recommendation} />
      )}
      {upload && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReset}
          disabled={loading}
          aria-label="Reset Phase 1 session"
        >
          Reset
        </Button>
      )}
    </section>
  );
}

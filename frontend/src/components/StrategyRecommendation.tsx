import type { Recommendation } from "@/types/api";

interface StrategyRecommendationProps {
  recommendation: Recommendation | null | undefined;
}

export default function StrategyRecommendation({
  recommendation,
}: StrategyRecommendationProps) {
  if (!recommendation) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 mb-5">
        <p className="text-fg-muted">No recommendation yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-5">
      <h3 className="mt-0 mb-3 text-lg font-semibold">Recommended strategy</h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">Chunk size</dt>
        <dd>
          {recommendation.chunk_size_tokens} tokens (overlap{" "}
          {recommendation.chunk_overlap_tokens})
        </dd>
        <dt className="text-fg-muted">Embedding model</dt>
        <dd>{recommendation.embedding_model}</dd>
        <dt className="text-fg-muted">Search method</dt>
        <dd>{recommendation.search_method}</dd>
        <dt className="text-fg-muted">Source</dt>
        <dd>
          {recommendation.source} · confidence{" "}
          {Math.round(recommendation.confidence * 100)}%
        </dd>
      </dl>
      <p className="text-rationale italic mt-3">{recommendation.rationale}</p>
    </div>
  );
}

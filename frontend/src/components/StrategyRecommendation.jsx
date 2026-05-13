export default function StrategyRecommendation({ recommendation }) {
  const r = recommendation;
  return (
    <div className="card">
      <h3>Recommended strategy</h3>
      <dl>
        <dt>Chunk size</dt>
        <dd>{r.chunk_size_tokens} tokens (overlap {r.chunk_overlap_tokens})</dd>
        <dt>Embedding model</dt>
        <dd>{r.embedding_model}</dd>
        <dt>Search method</dt>
        <dd>{r.search_method}</dd>
        <dt>Source</dt>
        <dd>{r.source} · confidence {Math.round(r.confidence * 100)}%</dd>
      </dl>
      <p className="rationale">{r.rationale}</p>
    </div>
  );
}

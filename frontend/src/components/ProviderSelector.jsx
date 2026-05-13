const STAGE_LABELS = {
  storage: "Storage",
  document_extraction: "Document extraction",
  embedding: "Embedding",
  vector_search: "Vector search",
};

export default function ProviderSelector({ stage, providers, selected, onSelect }) {
  return (
    <div className="card">
      <h3>{STAGE_LABELS[stage] || stage}</h3>
      <div className="provider-grid">
        {providers.map((p) => (
          <button
            key={p.id}
            className={`provider ${selected === p.id ? "selected" : ""}`}
            onClick={() => onSelect(p.id)}
          >
            <strong>{p.name}</strong>
            <small>{p.description}</small>
            <em>{p.pricing_notes}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

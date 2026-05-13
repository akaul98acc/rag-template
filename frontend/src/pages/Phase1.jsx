import { useState } from "react";
import DocumentUpload from "../components/DocumentUpload.jsx";
import StrategyRecommendation from "../components/StrategyRecommendation.jsx";
import { analyzeDocument } from "../services/api.js";

export default function Phase1() {
  const [upload, setUpload] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleUploaded(result) {
    setUpload(result);
    setRecommendation(null);
    setLoading(true);
    try {
      const rec = await analyzeDocument(result.doc_id);
      setRecommendation(rec);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Phase 1 · Strategy Agent</h2>
      <p>Upload a document. The agent will recommend chunking, embedding, and search settings.</p>
      <DocumentUpload onUploaded={handleUploaded} />
      {upload && (
        <div className="card">
          <h3>Document metadata</h3>
          <pre>{JSON.stringify(upload.metadata, null, 2)}</pre>
        </div>
      )}
      {loading && <p>Analyzing…</p>}
      {recommendation && <StrategyRecommendation recommendation={recommendation} />}
    </section>
  );
}

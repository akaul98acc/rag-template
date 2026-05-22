
import { useEffect, useState } from "react";
import ProviderSelector from "../components/ProviderSelector.jsx";
import CodeViewer from "../components/CodeViewer.jsx";
import Button from "../components/Button.jsx";
import { fetchProviders, generateCode } from "../services/api.js";

const STAGES = ["storage", "document_extraction", "embedding", "vector_search"];

export default function Phase2() {
  const [catalog, setCatalog] = useState(null);
  const [selections, setSelections] = useState({});
  const [generated, setGenerated] = useState(null);

  useEffect(() => {
    fetchProviders().then(setCatalog);
  }, []);

  function select(stage, providerId) {
    setSelections((prev) => ({ ...prev, [stage]: providerId }));
  }

  async function handleGenerate() {
    const result = await generateCode(selections);
    setGenerated(result);
  }

  if (!catalog) return <p>Loading catalog…</p>;

  return (
    <section>
      <h2>Phase 2 · Compare providers & generate code</h2>
      {STAGES.map((stage) => (
        <ProviderSelector
          key={stage}
          stage={stage}
          providers={catalog[stage] || []}
          selected={selections[stage]}
          onSelect={(pid) => select(stage, pid)}
        />
      ))}
      <Button
        className="generate-btn"
        onClick={handleGenerate}
        disabled={Object.keys(selections).length === 0}
      >
        Generate Code
      </Button>
      {generated && <CodeViewer code={generated.code} requiresEnv={generated.requires_env} />}
    </section>
  );
}

import { useState } from "react";
import { uploadDocument } from "../services/api.js";

export default function DocumentUpload({ onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadDocument(file);
      onUploaded?.(result);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <label className="upload">
        <input type="file" onChange={handleChange} disabled={busy} />
        <span>{busy ? "Uploading…" : "Choose a document"}</span>
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

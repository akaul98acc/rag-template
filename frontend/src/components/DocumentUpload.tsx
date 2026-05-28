import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/services/api";
import type { UploadResult } from "@/types/api";

interface DocumentUploadProps {
  onUploaded?: (result: UploadResult) => void;
}

export default function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadDocument(file);
      onUploaded?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-5">
      <Button
        type="button"
        onClick={openPicker}
        disabled={busy}
        aria-label="Choose document to upload"
      >
        {busy ? "Uploading…" : "Choose a document"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={handleChange}
        disabled={busy}
        aria-label="Upload document"
        tabIndex={-1}
      />
      {!busy && !error && (
        <p className="mt-2 text-sm text-fg-muted">
          Select a document to begin analysis.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-error-text">
          {error}
        </p>
      )}
    </div>
  );
}

import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadDocument } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type { UploadResult } from "@/types/api";

interface DocumentUploadProps {
  onUploaded?: (result: UploadResult) => void;
}

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const ACCEPTED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

function isValidFileType(file: File): boolean {
  const extension = getFileExtension(file.name);
  const extensionValid = ACCEPTED_EXTENSIONS.includes(extension);

  // Some browsers report empty MIME type for .txt files
  if (!file.type && extensionValid) {
    return true;
  }

  const mimeValid = ACCEPTED_MIMES.includes(file.type);
  return mimeValid || extensionValid;
}

function extractErrorDetail(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const axiosErr = err as { response?: { data?: { detail?: string } } };
    if (axiosErr.response?.data?.detail) {
      return axiosErr.response.data.detail;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Upload failed";
}

export default function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation: file type
    if (!isValidFileType(file)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Only PDF, DOCX, and TXT files are accepted.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    // Client-side validation: file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "File exceeds the 50 MB limit.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setProcessing(false);

    try {
      const result = await uploadDocument(file, (progress) => {
        setUploadProgress(progress);
        // When upload is complete (100%), switch to processing state
        if (progress >= 100) {
          setUploading(false);
          setProcessing(true);
        }
      });
      setProcessing(false);
      onUploaded?.(result);
    } catch (err) {
      const detail = extractErrorDetail(err);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: detail,
      });
    } finally {
      setUploading(false);
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openPicker() {
    inputRef.current?.click();
  }

  const isBusy = uploading || processing;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-5">
      <Button
        type="button"
        onClick={openPicker}
        disabled={isBusy}
        aria-label="Choose document to upload"
      >
        {isBusy ? "Uploading..." : "Choose a document"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="sr-only"
        onChange={handleChange}
        disabled={isBusy}
        aria-label="Upload document"
        tabIndex={-1}
      />

      {uploading && (
        <div className="mt-4" role="status" aria-live="polite">
          <p className="text-sm text-fg-muted mb-2">
            Uploading... {uploadProgress}%
          </p>
          <Progress
            value={uploadProgress}
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
          />
        </div>
      )}

      {processing && (
        <div className="mt-4" role="status" aria-live="polite">
          <p className="text-sm text-fg-muted mb-2">Processing document...</p>
          <Progress indeterminate aria-label="Processing document" />
        </div>
      )}

      {!isBusy && (
        <p className="mt-2 text-sm text-fg-muted">
          Select a document to begin analysis. Supported formats: PDF, DOCX,
          TXT. Maximum size: 50 MB.
        </p>
      )}
    </div>
  );
}

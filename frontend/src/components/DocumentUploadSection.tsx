import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { uploadDocument } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type { UploadResult, DocumentMetadata } from "@/types/api";
import { cn } from "@/lib/utils";

interface DocumentUploadSectionProps {
  onUploaded?: (result: UploadResult) => void;
  uploadResult?: UploadResult | null;
  className?: string;
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
  if (!file.type && extensionValid) return true;
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
  if (err instanceof Error) return err.message;
  return "Upload failed";
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function MetadataItem({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-b-0">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-xs font-medium text-fg">{value ?? "N/A"}</span>
    </div>
  );
}

function UploadedDocumentInfo({ metadata }: { metadata: DocumentMetadata }) {
  return (
    <div className="mt-4 p-4 bg-hover-soft rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg truncate">{metadata.filename ?? "Document"}</p>
          <p className="text-xs text-fg-muted">{formatFileSize(metadata.size_bytes)}</p>
        </div>
        <Badge variant="recommended">Uploaded</Badge>
      </div>
      <div className="space-y-0">
        <MetadataItem label="Type" value={metadata.mime_type} />
        <MetadataItem label="Pages" value={metadata.page_count} />
        <MetadataItem label="Language" value={metadata.language} />
        {metadata.tables !== undefined && <MetadataItem label="Tables" value={metadata.tables} />}
        {metadata.images !== undefined && <MetadataItem label="Images" value={metadata.images} />}
      </div>
    </div>
  );
}

export default function DocumentUploadSection({
  onUploaded,
  uploadResult,
  className,
}: DocumentUploadSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function processFile(file: File) {
    if (!isValidFileType(file)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Only PDF, DOCX, and TXT files are accepted.",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "File exceeds the 50 MB limit.",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setProcessing(false);

    try {
      const result = await uploadDocument(file, (progress) => {
        setUploadProgress(progress);
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

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  const isBusy = uploading || processing;

  return (
    <div className={cn("mb-6", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
        Document Upload
      </h4>

      {!uploadResult ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
            "bg-surface border-border-strong",
            "hover:border-primary hover:bg-primary/5",
            isDragging && "border-primary bg-primary/10",
            isBusy && "pointer-events-none opacity-60"
          )}
          onClick={openPicker}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPicker(); }}
          aria-label="Upload document"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="sr-only"
            onChange={handleChange}
            disabled={isBusy}
            tabIndex={-1}
          />

          {!isBusy && (
            <>
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-fg mb-1">
                Drop your document here or click to browse
              </p>
              <p className="text-xs text-fg-muted">
                PDF, DOCX, or TXT (max 50MB)
              </p>
            </>
          )}

          {uploading && (
            <div role="status" aria-live="polite">
              <p className="text-sm text-fg-muted mb-3">
                Uploading... {uploadProgress}%
              </p>
              <Progress value={uploadProgress} className="max-w-xs mx-auto" />
            </div>
          )}

          {processing && (
            <div role="status" aria-live="polite">
              <p className="text-sm text-fg-muted mb-3">Processing document...</p>
              <Progress indeterminate className="max-w-xs mx-auto" />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-4">
          <UploadedDocumentInfo metadata={uploadResult.metadata} />
          <Button
            variant="secondary"
            size="sm"
            onClick={openPicker}
            className="mt-3"
            disabled={isBusy}
          >
            Upload different document
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="sr-only"
            onChange={handleChange}
            disabled={isBusy}
            tabIndex={-1}
          />
        </div>
      )}
    </div>
  );
}

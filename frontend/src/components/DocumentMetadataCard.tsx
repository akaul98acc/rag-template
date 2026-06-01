import type { DocumentMetadata } from "@/types/api";
import { calculateDocumentProcessingCost } from "@/services/adapters/azureDocIntelligenceCost";

interface DocumentMetadataCardProps {
  metadata: DocumentMetadata;
}

interface MetadataRowProps {
  label: string;
  value: string | number | null | undefined;
  ariaLabel?: string;
}

function MetadataRow({ label, value, ariaLabel }: MetadataRowProps) {
  const displayValue = value ?? "—";
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-b-0">
      <span className="text-fg-muted text-sm">{label}</span>
      <span
        className="text-fg text-sm font-medium"
        aria-label={ariaLabel ?? label}
      >
        {displayValue}
      </span>
    </div>
  );
}

export default function DocumentMetadataCard({
  metadata,
}: DocumentMetadataCardProps) {
  const costEstimate = calculateDocumentProcessingCost(metadata.page_count);

  return (
    <div
      className="bg-surface border border-border rounded-lg p-5 mb-5"
      role="region"
      aria-label="Document metadata"
    >
      <h3 className="mt-0 mb-4 text-lg font-semibold">Document Metadata</h3>
      <div className="space-y-0">
        <MetadataRow
          label="Content type"
          value={metadata.mime_type}
          ariaLabel="Content type (MIME type)"
        />
        <MetadataRow
          label="Number of pages"
          value={metadata.page_count}
          ariaLabel="Number of pages"
        />
        <MetadataRow
          label="Language"
          value={metadata.language}
          ariaLabel="Detected language"
        />
        <MetadataRow
          label="Tables detected"
          value={metadata.tables}
          ariaLabel="Number of tables detected"
        />
        <MetadataRow
          label="Images detected"
          value={metadata.images}
          ariaLabel="Number of images detected"
        />
        <div className="flex justify-between py-2 border-b border-border last:border-b-0">
          <span className="text-fg-muted text-sm">
            Estimated cost{" "}
            <span className="text-fg-subtle text-xs">(estimate)</span>
          </span>
          <span
            className="text-fg text-sm font-medium"
            aria-label="Estimated processing cost"
          >
            {costEstimate ? costEstimate.formatted : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { Provider, StageId } from "@/types/api";

const STAGE_LABELS: Record<StageId, string> = {
  storage: "Storage",
  document_extraction: "Document extraction",
  embedding: "Embedding",
  vector_search: "Vector search",
};

interface ProviderSelectorProps {
  stage: StageId;
  providers: Provider[];
  selected?: string;
  onSelect: (providerId: string) => void;
}

export default function ProviderSelector({
  stage,
  providers,
  selected,
  onSelect,
}: ProviderSelectorProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-5">
      <h3 className="mt-0 mb-3 text-lg font-semibold">
        {STAGE_LABELS[stage] ?? stage}
      </h3>
      {providers.length === 0 ? (
        <p className="text-fg-muted">No providers available for this stage.</p>
      ) : (
        <ToggleGroup
          type="single"
          value={selected ?? ""}
          onValueChange={(value) => {
            if (value) onSelect(value);
          }}
          aria-label={`Select provider for ${STAGE_LABELS[stage] ?? stage}`}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 w-full"
        >
          {providers.map((p) => (
            <ToggleGroupItem
              key={p.id}
              value={p.id}
              aria-label={`Select ${p.name} for ${STAGE_LABELS[stage] ?? stage}`}
              className={cn(
                "flex flex-col items-start gap-1 p-3 border rounded-md bg-surface text-left h-auto",
                "border-border-strong hover:bg-hover-soft hover:border-hover-border",
                "data-[state=on]:border-primary data-[state=on]:ring-2 data-[state=on]:ring-primary-ring data-[state=on]:shadow-none"
              )}
            >
              <strong className="text-fg">{p.name}</strong>
              <small className="text-fg-muted">{p.description}</small>
              <em className="not-italic text-xs text-fg-subtle">
                {p.pricing_notes}
              </em>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

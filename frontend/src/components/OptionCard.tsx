import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export interface OptionBadge {
  label: string;
  variant: BadgeVariant;
}

export interface OptionCardProps {
  /** Unique identifier for this option */
  id: string;
  /** Main title displayed prominently */
  title: string;
  /** Secondary description shown below the title */
  description?: string;
  /** Optional badge shown in top-right corner */
  badge?: OptionBadge;
  /** Whether this card is currently selected */
  selected?: boolean;
  /** Called when the card is clicked */
  onSelect?: (id: string) => void;
  /** Whether the card is disabled */
  disabled?: boolean;
  /** Optional icon component to display */
  icon?: React.ReactNode;
}

/**
 * A selectable card component for configuration options.
 *
 * Example usage:
 * ```tsx
 * <OptionCard
 *   id="ada-3-large"
 *   title="Ada 3 Large"
 *   description="High performance embeddings"
 *   badge={{ label: "perf", variant: "perf" }}
 *   selected={selectedModel === "ada-3-large"}
 *   onSelect={setSelectedModel}
 * />
 * ```
 */
export function OptionCard({
  id,
  title,
  description,
  badge,
  selected = false,
  onSelect,
  disabled = false,
  icon,
}: OptionCardProps) {
  function handleClick() {
    if (!disabled && onSelect) {
      onSelect(id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative flex flex-col gap-1 rounded-lg border p-4 cursor-pointer transition-all",
        "bg-surface border-border-strong",
        "hover:border-hover-border hover:bg-hover-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong",
        selected && [
          "border-primary ring-2 ring-primary-ring bg-primary/5",
          "hover:border-primary hover:bg-primary/5",
        ],
        disabled && "opacity-50 cursor-not-allowed hover:border-border-strong hover:bg-surface"
      )}
    >
      {badge && (
        <Badge
          variant={badge.variant}
          className="absolute top-2 right-2 text-[10px]"
        >
          {badge.label}
        </Badge>
      )}
      {icon && <div className="mb-1 text-fg-muted">{icon}</div>}
      <span className="text-sm font-medium text-fg pr-16">{title}</span>
      {description && (
        <span className="text-xs text-fg-muted leading-relaxed">
          {description}
        </span>
      )}
    </div>
  );
}

export interface OptionItem {
  id: string;
  title: string;
  description?: string;
  badge?: OptionBadge;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface OptionCardGridProps {
  /** Section heading displayed above the grid */
  heading: string;
  /** Array of option items to render */
  options: OptionItem[];
  /** Currently selected option id */
  selected?: string;
  /** Called when an option is selected */
  onSelect?: (id: string) => void;
  /** Number of columns (default: auto-fit with min 200px) */
  columns?: 2 | 3 | 4 | "auto";
  /** Additional class names */
  className?: string;
}

/**
 * A section wrapper that renders a grid of OptionCards from a data array.
 *
 * Example usage:
 * ```tsx
 * const EMBEDDING_MODELS: OptionItem[] = [
 *   { id: "auto", title: "Auto-select", badge: { label: "recommended", variant: "recommended" } },
 *   { id: "ada-3-small", title: "Ada 3 Small", badge: { label: "cost", variant: "cost" } },
 * ];
 *
 * <OptionCardGrid
 *   heading="EMBEDDING MODEL"
 *   options={EMBEDDING_MODELS}
 *   selected={selectedModel}
 *   onSelect={setSelectedModel}
 * />
 * ```
 */
export function OptionCardGrid({
  heading,
  options,
  selected,
  onSelect,
  columns = "auto",
  className,
}: OptionCardGridProps) {
  const gridClass =
    columns === "auto"
      ? "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : columns === 3
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4";

  return (
    <div className={cn("mb-6", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
        {heading}
      </h4>
      <div className={cn("grid gap-3", gridClass)}>
        {options.map((option) => (
          <OptionCard
            key={option.id}
            id={option.id}
            title={option.title}
            description={option.description}
            badge={option.badge}
            selected={selected === option.id}
            onSelect={onSelect}
            disabled={option.disabled}
            icon={option.icon}
          />
        ))}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

export interface StatCardProps {
  value: string | number;
  label: string;
  /** Highlight the value in green (e.g., for vector dimensions) */
  highlight?: boolean;
  className?: string;
}

/**
 * A small stat card displaying a value and label.
 */
export function StatCard({
  value,
  label,
  highlight,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-lg p-3 text-center",
        className
      )}
    >
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          highlight ? "text-emerald-400" : "text-fg"
        )}
      >
        {value}
      </div>
      <div className="text-xs text-fg-muted">{label}</div>
    </div>
  );
}

export interface StatCardsProps {
  stats: Array<{ value: string | number; label: string; highlight?: boolean }>;
  className?: string;
}

/**
 * A row of stat cards.
 */
export function StatCards({ stats, className }: StatCardsProps) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
      {stats.map((stat, i) => (
        <StatCard
          key={i}
          value={stat.value}
          label={stat.label}
          highlight={stat.highlight}
        />
      ))}
    </div>
  );
}

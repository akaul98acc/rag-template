import type { ReactNode } from "react";

interface FieldGroupProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function FieldGroup({ label, error, children }: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-fg">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

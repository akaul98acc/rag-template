import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Delete",
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-labelledby="confirm-modal-title"
        className="relative bg-surface border border-border rounded-lg p-6 w-full max-w-sm shadow-xl"
      >
        <h3 id="confirm-modal-title" className="text-base font-semibold mb-2 m-0">
          {title}
        </h3>
        <div className="text-sm text-fg-muted mb-3">{description}</div>
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

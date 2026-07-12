import { Button } from "@/components/ui/button";

export interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: "default" | "secondary" | "destructive";
  disabled?: boolean;
  flex1?: boolean;
}

interface PanelActionBarProps {
  buttons: ActionButton[];
}

export function PanelActionBar({ buttons }: PanelActionBarProps) {
  return (
    <div className="mt-auto pt-4 flex gap-2 border-t border-border">
      {buttons.map((btn, i) => (
        <Button
          key={i}
          type="button"
          variant={btn.variant ?? "default"}
          disabled={btn.disabled}
          onClick={btn.onClick}
          className={btn.flex1 ? "flex-1" : undefined}
        >
          {btn.label}
        </Button>
      ))}
    </div>
  );
}

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ParameterConfig } from "@/config/configuratorOptions";

export interface ParameterSliderProps extends ParameterConfig {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * A labeled slider for configuration parameters.
 */
export function ParameterSlider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit,
  className,
}: ParameterSliderProps) {
  function handleChange(values: number[]) {
    const newValue = values[0];
    if (newValue !== undefined) {
      onChange(newValue);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-sm font-medium text-fg-muted"
        >
          {label}
        </label>
        <span className="text-sm font-semibold text-fg tabular-nums">
          {value}
          {unit && <span className="text-fg-subtle ml-0.5">{unit}</span>}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={handleChange}
        aria-label={label}
      />
    </div>
  );
}

export interface ParameterSlidersProps {
  parameters: ParameterConfig[];
  values: Record<string, number>;
  onChange: (id: string, value: number) => void;
  className?: string;
}

/**
 * A section with multiple parameter sliders.
 */
export function ParameterSliders({
  parameters,
  values,
  onChange,
  className,
}: ParameterSlidersProps) {
  return (
    <div className={cn("mb-6", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-4">
        Parameters
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {parameters.map((param) => (
          <ParameterSlider
            key={param.id}
            {...param}
            value={values[param.id] ?? param.defaultValue}
            onChange={(v) => onChange(param.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

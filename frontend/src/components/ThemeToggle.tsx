import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme, type ThemePref } from "@/contexts/ThemeContext";

const OPTIONS: { value: ThemePref; icon: string; label: string }[] = [
  { value: "light", icon: "☀", label: "Light" },
  { value: "system", icon: "🖥", label: "System" },
  { value: "dark", icon: "☾", label: "Dark" },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <ToggleGroup
      type="single"
      value={preference}
      onValueChange={(value) => {
        if (value) setPreference(value as ThemePref);
      }}
      aria-label="Theme"
      className="inline-flex items-center gap-0 p-0.5 bg-bg border border-border-strong rounded-full"
    >
      {OPTIONS.map(({ value, icon, label }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="inline-flex items-center justify-center w-8 h-7 p-0 bg-transparent text-fg-muted rounded-full text-base hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-primary data-[state=on]:shadow-sm"
        >
          <span aria-hidden="true">{icon}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

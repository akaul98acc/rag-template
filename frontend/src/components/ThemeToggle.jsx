import { useTheme } from "../contexts/ThemeContext.jsx";

const OPTIONS = [
  { value: "light", icon: "☀", label: "Light" },
  { value: "system", icon: "🖥", label: "System" },
  { value: "dark", icon: "☾", label: "Dark" },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, icon, label }) => (
        <button
          key={value}
          type="button"
          className="theme-toggle__btn"
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
        >
          <span aria-hidden="true">{icon}</span>
        </button>
      ))}
    </div>
  );
}

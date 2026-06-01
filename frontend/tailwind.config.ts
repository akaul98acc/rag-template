import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        fg: {
          DEFAULT: "var(--color-fg)",
          muted: "var(--color-fg-muted)",
          subtle: "var(--color-fg-subtle)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          ring: "var(--color-primary-ring)",
          "ring-strong": "var(--color-primary-ring-strong)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          hover: "var(--color-success-hover)",
          disabled: "var(--color-success-disabled)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          hover: "var(--color-danger-hover)",
          ring: "var(--color-danger-ring)",
        },
        "hover-soft": "var(--color-hover-soft)",
        "hover-border": "var(--color-hover-border)",
        "error-text": "var(--color-error-text)",
        rationale: "var(--color-rationale)",
        disabled: "var(--color-disabled)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      keyframes: {
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "progress-indeterminate":
          "progress-indeterminate 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

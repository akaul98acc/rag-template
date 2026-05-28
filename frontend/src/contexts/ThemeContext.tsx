import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "rag-builder.theme";
const VALID_PREFS = ["light", "dark", "system"] as const;

export type ThemePref = (typeof VALID_PREFS)[number];
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePref;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePref) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePref(value: unknown): value is ThemePref {
  return (
    typeof value === "string" &&
    (VALID_PREFS as readonly string[]).includes(value)
  );
}

function readStoredPreference(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isThemePref(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] =
    useState<ThemePref>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePref) => {
    if (!isThemePref(next)) return;
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode etc. — session-only change is fine */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

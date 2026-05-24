import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "rag-builder.theme";
const VALID_PREFS = ["light", "dark", "system"];

const ThemeContext = createContext(null);

function readStoredPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_PREFS.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setPreference = useCallback((next) => {
    if (!VALID_PREFS.includes(next)) return;
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

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

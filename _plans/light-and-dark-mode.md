# Plan: Light and Dark Mode

Spec: `_specs/light-and-dark-mode.md`
Branch: `claude/feature/light-and-dark-mode` (already checked out)

## Context

The RAG Builder frontend is a single-page React/Vite app with one global stylesheet (`frontend/src/styles/App.css`) and ~26 hard-coded hex colors scattered across that file. Users on dark-mode systems currently see the app in bright light, and there is no way to choose otherwise. The spec asks for a three-state theme system (Light / Dark / System) accessible from the shared header, persisted across sessions, with no flash of wrong theme on initial paint, that fits the current vanilla React stack without introducing a UI library.

The design decisions confirmed with the user:

- **Toggle UI:** segmented control of three buttons in the top-right of the shared header.
- **Icons:** unicode glyphs `☀` (light) / `🖥` (system) / `☾` (dark) — no icon library added.
- **Code viewer:** add `react-syntax-highlighter` with VS Code's `vs` (light) and `vs2015` (dark) themes — resolves Open Question #2 and satisfies user story #4.
- **Storage key:** `rag-builder.theme` (per spec resolution of Open Question #3).

## Approach

Pure-CSS theming via custom properties scoped on the `<html>` element, switched by a `data-theme="light|dark"` attribute. A tiny inline script in `index.html` resolves the initial theme before React mounts (FOUC prevention). A React context exposes `{ preference, resolvedTheme, setPreference }` to the rest of the app; the only consumer is the new `ThemeToggle` component placed in the header.

This avoids re-renders on theme change (CSS variables cascade instantly), keeps the stack additions to a single dependency (`react-syntax-highlighter`), and contains the surface area to one new context, one new component, and a refactor of the single global stylesheet.

## Files to create

1. **`frontend/src/contexts/ThemeContext.jsx`** — provider + `useTheme()` hook. Holds `preference` (`'light' | 'dark' | 'system'`), derives `resolvedTheme` (`'light' | 'dark'`), reads/writes `localStorage['rag-builder.theme']`, subscribes to `matchMedia('(prefers-color-scheme: dark)')` and updates live when on `'system'`, and writes `document.documentElement.dataset.theme = resolvedTheme` on every change. On unsupported stored values, falls back to `'system'` (edge case from spec).

2. **`frontend/src/components/ThemeToggle.jsx`** — segmented control of three buttons (`☀ 🖥 ☾`) with `aria-pressed` on the active one. Uses `useTheme()`. Styled via new `.theme-toggle` / `.theme-toggle__btn` classes in `App.css`.

3. **`frontend/src/styles/tokens.css`** — defines the semantic CSS variables in one place. Imported by `main.jsx` before `App.css` so cascade order is predictable.

## Files to modify

1. **`frontend/index.html`** — add inline script in `<head>` (before the `<script type="module">`) that reads `localStorage['rag-builder.theme']`, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and sets `document.documentElement.dataset.theme` plus `style.colorScheme`. Keep it dependency-free, ~15 lines, wrapped in `try/catch` to survive private-mode storage failure.

2. **`frontend/src/main.jsx`** — wrap `<App />` in `<ThemeProvider>`; import `tokens.css` before `App.css`.

3. **`frontend/src/App.jsx`** — drop `<ThemeToggle />` into `.app-header` after the `<nav>`.

4. **`frontend/src/styles/App.css`** — refactor every hard-coded color to a `var(--token)` reference. No structural changes; every existing rule keeps its selector and layout properties.

5. **`frontend/src/components/CodeViewer.jsx`** — swap the plain `<pre>` for `<SyntaxHighlighter language="python" style={resolvedTheme === 'dark' ? vs2015 : vs}>` from `react-syntax-highlighter`. Read `resolvedTheme` via `useTheme()`. Keep the existing card layout, copy button, and env hint untouched.

6. **`frontend/package.json`** — add `react-syntax-highlighter` to `dependencies`.

## Token design (`tokens.css`)

Define semantic tokens (not raw colors) so component CSS reads intent, not paint. Light values live on `:root`; dark values override under `:root[data-theme="dark"]`.

```css
:root {
  --color-bg:          #f7f8fa;
  --color-surface:     #ffffff;       /* cards, header */
  --color-fg:          #1d1f23;
  --color-fg-muted:    #555;
  --color-fg-subtle:   #888;
  --color-border:      #e3e6eb;
  --color-border-strong:#d0d4dc;
  --color-primary:     #2c5cff;
  --color-primary-hover:#1e4ae0;
  --color-primary-ring: rgba(44, 92, 255, 0.15);
  --color-success:     #16a34a;
  --color-success-hover:#15803d;
  --color-danger:      #dc2626;
  --color-danger-hover:#b91c1c;
  --color-disabled:    #9ca3af;
  --color-hover-soft:  #f0f2f5;
  --color-code-bg:     #f6f8fa;   /* light VS code-ish backdrop */
  --color-code-fg:     #1d1f23;
}

:root[data-theme="dark"] {
  --color-bg:          #0f1115;
  --color-surface:     #181b22;
  --color-fg:          #e6e6e6;
  --color-fg-muted:    #a8aeba;
  --color-fg-subtle:   #777e8c;
  --color-border:      #2a2f3a;
  --color-border-strong:#3b414d;
  --color-primary:     #6b8cff;       /* lifted for WCAG AA on dark */
  --color-primary-hover:#8aa1ff;
  --color-primary-ring: rgba(107, 140, 255, 0.25);
  --color-success:     #4ade80;
  --color-success-hover:#22c55e;
  --color-danger:      #f87171;
  --color-danger-hover:#ef4444;
  --color-disabled:    #4b5563;
  --color-hover-soft:  #232833;
  --color-code-bg:     #0e1116;
  --color-code-fg:     #e6e6e6;
}
```

Contrast check (must verify in browser): all `--color-fg*` over `--color-bg`/`--color-surface` must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large/UI). The dark `--color-primary` is brightened from `#2c5cff` → `#6b8cff` specifically for this reason.

## Pre-paint script (`index.html`)

Inline, synchronous, in `<head>`:

```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem('rag-builder.theme');
      var pref  = (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'system';
      var dark  = pref === 'dark' || (pref === 'system' &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch (e) { /* private mode etc. — fall through to light */ }
  })();
</script>
```

The `colorScheme` style also tells the browser to render native form controls (scrollbars, file pickers, etc.) in the matching scheme.

## ThemeContext sketch

```jsx
const ThemeContext = createContext(null);
const STORAGE_KEY = 'rag-builder.theme';

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = preference === 'system'
    ? (systemDark ? 'dark' : 'light')
    : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setPreference = useCallback((next) => {
    setPreferenceState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

## ThemeToggle sketch

```jsx
const OPTIONS = [
  { value: 'light',  icon: '☀', label: 'Light' },
  { value: 'system', icon: '🖥', label: 'System' },
  { value: 'dark',   icon: '☾', label: 'Dark' },
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
```

Active state styled via `[aria-pressed="true"]` → `background: var(--color-hover-soft); color: var(--color-primary);`.

## CodeViewer change

Drop the existing inline `<pre>` for:

```jsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../contexts/ThemeContext';

const { resolvedTheme } = useTheme();
<SyntaxHighlighter
  language="python"
  style={resolvedTheme === 'dark' ? vs2015 : vs}
  customStyle={{ margin: 0, borderRadius: 6, fontSize: 13 }}
>
  {code}
</SyntaxHighlighter>
```

Keep `.code-header`, copy button, and `.env-hint` as they are — only the `<pre>` is replaced.

## Edge cases handled

| Spec edge case | Where it's handled |
| --- | --- |
| First visit, no stored pref → use OS pref | Pre-paint script + initial `useState` |
| OS changes while on "System" → live update | `matchMedia('change')` listener in `ThemeProvider` |
| `localStorage` unavailable (private mode) | All reads/writes wrapped in `try/catch`; in-memory state survives the session |
| Slow connection → no theme flash | Inline pre-paint script runs synchronously before React |
| Stored value the app no longer supports | Allow-list check in init falls back to `'system'` |

## Verification

1. **Type/lint:** `cd frontend && npm install && npm run build` — must succeed with the new dep.
2. **Dev server:** `npm run dev`, open `http://localhost:5173`.
3. **Toggle:** click each of the three buttons in the header; confirm the whole page re-skins for both Phase 1 and Phase 2 (upload card, recommendation panel, parameter inputs, provider grid, code viewer).
4. **Persistence:** select Dark → reload → still Dark. Select System → reload → still System.
5. **OS-pref live update:** with toggle on "System", flip OS dark mode in the system settings (Windows: Settings → Personalization → Colors) and confirm the app follows without reload.
6. **FOUC:** with browser cache disabled and network throttled to Slow 3G in DevTools, hard-reload — the page should appear in the correct theme on the first paint, not flash white-then-dark.
7. **Contrast:** open DevTools → Lighthouse → Accessibility, or eyeball with the Contrast checker on each text surface against its background in both themes. Headings, body, muted text, code, and button labels all need to pass AA.
8. **Code viewer:** generate code on Phase 2; confirm syntax highlighting is colorized (Python keywords/strings differentiated) and uses VS Code colors that match the active theme.
9. **Private mode:** open in an incognito window with storage blocked, confirm the toggle still works for the session.
10. **Mobile width:** Chrome DevTools device toolbar at 375px — header wraps cleanly, toggle stays reachable.

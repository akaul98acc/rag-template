# Frontend Skill Compliance Report
Date: 2026-05-28
Skill: component-skill/SKILL.md
Status: Pending Implementation

## Summary

| File | Violations | Priority | Status |
|------|-----------|----------|--------|
| `src/main.jsx` | 1 | Low | Pending |
| `src/App.jsx` | 4 | Medium | Pending |
| `src/pages/Phase1.jsx` | 4 | High | Pending |
| `src/pages/Phase2.jsx` | 5 | High | Pending |
| `src/components/DocumentUpload.jsx` | 6 | High | Pending |
| `src/components/StrategyRecommendation.jsx` | 4 | High | Pending |
| `src/components/ProviderSelector.jsx` | 6 | High | Pending |
| `src/components/Button.jsx` | 4 | High | Pending |
| `src/components/ThemeToggle.jsx` | 3 | Medium | Pending |
| `src/components/CodeViewer.jsx` | 7 | High | Pending |
| `src/contexts/ThemeContext.jsx` | 1 | Low | Pending |
| `src/services/api.js` | 1 | Low | Pending |

**Cross-cutting violations (apply to every `.jsx`/`.js` file):**
- Rule 1 (TypeScript): No file in `frontend/src/` uses TypeScript. Every component is `.jsx` and every service is `.js`. Codebase-wide migration to `.tsx`/`.ts` is required.
- Rule 2 (Tailwind only): The project uses plain CSS via `src/styles/App.css` + CSS variables in `src/styles/tokens.css`. Every `className` in the codebase is a hand-rolled class, not a Tailwind utility. Tailwind is not installed.
- Rule 3 (Shadcn/Radix only): No Shadcn or Radix primitive is used anywhere. `Button.jsx` is a hand-rolled primitive; every `<button>`, `<input type="file">`, `<dl>`-based card etc. is a custom primitive.

## Detailed Findings

### src/main.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `main.jsx` | Rename to `main.tsx`. |

### src/App.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `App.jsx` | Rename to `App.tsx`; no props on `App`, but the function signature should still be typed (`(): JSX.Element`). |
| 8 | Rule 2 — Tailwind only | `<div className="app">` | Replace `.app` class with Tailwind utilities (e.g. `className="min-h-screen flex flex-col"`). |
| 9 | Rule 2 — Tailwind only | `<header className="app-header">` | Replace `.app-header` with Tailwind utilities. |
| 17 | Rule 2 — Tailwind only | `<main className="app-main">` | Replace `.app-main` with Tailwind utilities. |
| 12–13 | Rule 12 — aria-label on interactive elements | `<Link to="/phase1">Phase 1 · Strategy</Link>` (and the Phase 2 Link) | Add `aria-label="Go to Phase 1 (Strategy)"` (and similar for Phase 2). The visible text is descriptive, but the rule says **every** interactive element must have an aria-label. |

### src/pages/Phase1.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `Phase1.jsx` | Rename to `Phase1.tsx`. |
| 16–21 | Rule 7 — must handle loading, error, **and** empty | `try { … } finally { setLoading(false); }` (no `catch`, no error state) | Add an `error` state, wrap in `try/catch`, and render an explicit error branch (e.g. `{error && <ErrorBanner>{error}</ErrorBanner>}`). Loading is handled at line 40; empty (no upload yet) is handled implicitly only. Add an explicit empty branch (e.g. `{!upload && !loading && <EmptyState …/>}`). |
| 35 | Rule 2 — Tailwind only | `<div className="card">` | Use Tailwind utilities for the metadata panel. |
| 37 | Rule 2 — Tailwind only (inline `<pre>` defaults via stylesheet) | `<pre>{JSON.stringify(upload.metadata, null, 2)}</pre>` | Apply Tailwind utilities (`className="font-mono text-sm whitespace-pre-wrap"`). |

### src/pages/Phase2.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `Phase2.jsx` | Rename to `Phase2.tsx`. |
| 16 | Rule 7 — error state | `fetchProviders().then(setCatalog);` | Add `.catch((e) => setError(e))` and render an error branch. |
| 23–26 | Rule 7 — error state on generate | `async function handleGenerate() { const result = await generateCode(selections); setGenerated(result); }` | Wrap in `try/catch`, set an error state, render error UI. |
| 28 | Rule 7 — empty state is implicit | `if (!catalog) return <p>Loading catalog…</p>;` | This handles loading but not the empty (catalog returned, but no providers) case; add an explicit empty branch. |
| 42–48 | Rule 3 — Shadcn/Radix only | `<Button className="generate-btn" …>Generate Code</Button>` calling the custom `Button` primitive | Replace with Shadcn `Button` (or Radix `*` slot equivalent). |

### src/components/DocumentUpload.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `DocumentUpload.jsx` | Rename to `DocumentUpload.tsx`. |
| 4 | Rule 8 — props typed via interface | `export default function DocumentUpload({ onUploaded }) {` | Define `interface DocumentUploadProps { onUploaded?: (result: UploadResult) => void; }` and type the parameter. |
| 24 | Rule 2 — Tailwind only | `<div className="card">` | Tailwind utilities for the card. |
| 25 | Rule 2 — Tailwind only | `<label className="upload">` | Tailwind utilities. |
| 26 | Rule 3 + Rule 12 — Shadcn/Radix + aria-label | `<input type="file" onChange={handleChange} disabled={busy} />` | Replace with a Shadcn file-input primitive (or Radix primitive composed with the project Button) **and** add `aria-label="Upload document"`. |
| 29 | Rule 2 — Tailwind only | `<p className="error">{error}</p>` | Tailwind utilities (e.g. `text-red-600`). |
| (component-level) | Rule 7 — empty state | Component renders busy/error but never an explicit empty state | Add an explicit empty/idle branch separate from the default "Choose a document" label, or refactor to make the empty case explicit. |

### src/components/StrategyRecommendation.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `StrategyRecommendation.jsx` | Rename to `StrategyRecommendation.tsx`. |
| 1 | Rule 8 — props typed via interface | `export default function StrategyRecommendation({ recommendation }) {` | Define `interface StrategyRecommendationProps { recommendation: Recommendation; }` (with `Recommendation` as a separate type). |
| 2 | Rule 7 — loading / error / empty all missing | `const r = recommendation;` (crashes if `recommendation` is null/undefined) | Add explicit branches: `if (!recommendation) return <Empty …/>;`. Loading and error responsibility should also be addressed (probably handled by the parent, but the rule applies to **every** component). |
| 4, 16 | Rule 2 — Tailwind only | `<div className="card">`, `<p className="rationale">` | Tailwind utilities. |

### src/components/ProviderSelector.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `ProviderSelector.jsx` | Rename to `ProviderSelector.tsx`. |
| 1–6 | Rule 9 — never hardcode provider names | `STAGE_LABELS = { storage: "Storage", document_extraction: "Document extraction", embedding: "Embedding", vector_search: "Vector search" }` | These are stage labels, not provider names, so technically compliant; verify nothing further down hardcodes "Azure"/"AWS" (currently none, ✅). No change needed for the label map, but flagged so a reviewer confirms. |
| 8 | Rule 8 — props typed via interface | `function ProviderSelector({ stage, providers, selected, onSelect }) {` | Define `interface ProviderSelectorProps { stage: StageId; providers: Provider[]; selected?: string; onSelect: (id: string) => void; }`. |
| 10, 12, 16 | Rule 2 — Tailwind only | `className="card"`, `className="provider-grid"`, `` className={`provider ${selected === p.id ? "selected" : ""}`} `` | Tailwind utilities for layout and selected state. |
| 14–22 | Rule 3 — Shadcn/Radix only | Hand-rolled `<button>` primitive in a grid | Replace with Shadcn `Button` (or `ToggleGroup.Item` from Radix) — currently a custom primitive. |
| 14 | Rule 12 — aria-label | `<button key={p.id} className=… onClick={…}>` | Add `aria-label={`Select ${p.name} for ${stage}`}` and `aria-pressed={selected === p.id}`. |
| (component-level) | Rule 7 — empty state | `providers.map(…)` silently renders nothing when the list is empty | Add an explicit `{providers.length === 0 && <Empty/>}` branch. |

### src/components/Button.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| (whole file) | Rule 3 — Shadcn/Radix only, never build custom primitives | Entire hand-rolled `Button` wrapper | Replace with the Shadcn `Button` component (`shadcn add button`) and re-export, or delete and import Shadcn `Button` directly at call sites. |
| 1 (file ext) | Rule 1 — TypeScript | `Button.jsx` | Rename to `Button.tsx`. |
| 1–10 | Rule 8 — props typed via interface | `function Button({ variant = "primary", size = "md", … })` | `interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" \| "secondary"; size?: "sm" \| "md" \| "lg"; }`. |
| 11 | Rule 2 — Tailwind only | `["btn", `btn--${variant}`, `btn--${size}`, className]` (BEM classes) | Replace BEM classes with Tailwind utility variants (or with Shadcn's CVA-based variants if migrating to Shadcn). |

### src/components/ThemeToggle.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `ThemeToggle.jsx` | Rename to `ThemeToggle.tsx`. |
| 12, 17 | Rule 2 — Tailwind only | `className="theme-toggle"`, `className="theme-toggle__btn"` | Replace BEM classes with Tailwind utilities. |
| 14–25 | Rule 3 — Shadcn/Radix only | Hand-rolled `<button>` array | Replace with Radix `ToggleGroup` (root + items). aria-label on each item is already present (line 19, ✅). |

### src/components/CodeViewer.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `CodeViewer.jsx` | Rename to `CodeViewer.tsx`. |
| 5 | Rule 8 — props typed via interface | `function CodeViewer({ code, requiresEnv }) {` | `interface CodeViewerProps { code: string; requiresEnv?: string[]; }`. |
| 13, 14, 19 | Rule 2 — Tailwind only | `className="card"`, `className="code-header"`, `className="env-hint"` | Tailwind utilities. |
| 16 | Rule 3 + Rule 12 — Shadcn/Radix + aria-label | `<button onClick={copy}>Copy</button>` | Replace with project `Button` (after `Button` itself is migrated to Shadcn) and add `aria-label="Copy generated code to clipboard"`. |
| 26 | Rule 2 — **no inline styles** | `customStyle={{ margin: 0, borderRadius: 6, fontSize: "0.85rem", padding: "1rem" }}` | Move into Tailwind utilities via the wrapper (`react-syntax-highlighter` exposes `className` on the `<pre>` it emits — use that), or accept this as a documented exception for a third-party library and note it in the skill. |
| (component-level) | Rule 7 — loading / error / empty | `{code ?? ""}` is the only empty-handling; no loading or error branch | Add explicit empty state (e.g. when `code` is empty: "No code generated yet"). Loading/error should also be considered (likely the parent's job, but the rule applies per component). |
| 1–2 | Rule 4 — never install additional UI libraries without explicit instruction | `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";` | `react-syntax-highlighter` is not Shadcn/Radix. CLAUDE.md explicitly authorises its use, so this is a sanctioned exception — surface it in the skill or in the file as a comment so future audits don't re-flag it. |

### src/contexts/ThemeContext.jsx
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `ThemeContext.jsx` | Rename to `ThemeContext.tsx`; type `ThemeContextValue = { preference: ThemePref; resolvedTheme: "light" \| "dark"; setPreference: (p: ThemePref) => void; }` and `interface ThemeProviderProps { children: React.ReactNode; }`. |

### src/services/api.js
| Line | Rule Violated | Current Code | Required Change |
|------|--------------|--------------|-----------------|
| 1 (file ext) | Rule 1 — TypeScript | `api.js` | Rename to `api.ts`; type each request/response with interfaces shared with the backend Pydantic models (e.g. `UploadResult`, `Recommendation`, `ProviderCatalog`, `GenerateResult`). |

## Implementation Order
<!-- Ordered by priority — High first -->
1. **Project-wide TypeScript migration (Rule 1).** Rename every `.jsx` → `.tsx` and `services/api.js` → `services/api.ts`. Add `tsconfig.json`, update Vite config, install `@types/react`, `@types/react-dom`. Without this, every subsequent fix has to be redone in TypeScript anyway. (Touches every file in the audit.)
2. **Define shared TypeScript interfaces for props (Rule 8).** As part of (or immediately after) step 1, replace destructured-prop signatures with named interfaces in: `DocumentUpload`, `StrategyRecommendation`, `ProviderSelector`, `Button`, `CodeViewer`, `ThemeContext`.
3. **Install Tailwind and replace custom CSS (Rule 2).** Add Tailwind to the Vite build, port the tokens in `src/styles/tokens.css` to a Tailwind theme (CSS variables can stay, but classNames must become utilities), and remove every BEM/custom class from the component files. Inline style in `CodeViewer.jsx:26` becomes Tailwind utilities on the wrapper.
4. **Install Shadcn and replace custom primitives (Rule 3).** `Button.jsx` → Shadcn `Button`. `ThemeToggle.jsx` → Radix `ToggleGroup`. `DocumentUpload.jsx` file input → Shadcn input primitive. `ProviderSelector.jsx` button grid → Shadcn `Button` or Radix `ToggleGroup`. `CodeViewer.jsx` copy button → migrated Shadcn `Button`.
5. **Add explicit loading / error / empty branches (Rule 7).** `Phase1.jsx` (add `error` state + `catch` at lines 16–21; add explicit empty branch). `Phase2.jsx` (add error handling at lines 16 and 23–26; add empty catalog branch). `StrategyRecommendation.jsx` (guard against `recommendation == null`). `ProviderSelector.jsx` (empty providers branch). `DocumentUpload.jsx` (explicit idle/empty branch). `CodeViewer.jsx` (explicit empty branch when `code` is falsy).
6. **Add `aria-label` to every interactive element (Rule 12).** `App.jsx` nav `<Link>`s (lines 12–13). `DocumentUpload.jsx` file input (line 26). `ProviderSelector.jsx` buttons (line 14). `CodeViewer.jsx` copy button (line 16). `ThemeToggle.jsx` already compliant.
7. **Document sanctioned exceptions in the skill.** `react-syntax-highlighter` (third-party UI lib) is explicitly authorised by `CLAUDE.md`; either update SKILL.md to whitelist it or annotate `CodeViewer.jsx` so future audits don't re-flag it under Rule 4.

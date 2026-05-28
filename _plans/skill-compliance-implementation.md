# Skill Compliance Implementation Plan
Source spec: `_specs/skill-compliance.md`
Date: 2026-05-28
Status: Draft — for review, do not implement

## Context

`frontend/src/` violates four cross-cutting rules of `.claude/skills/frontend/component-skill/SKILL.md`:
- Rule 1: every file is `.jsx` / `.js`, not TypeScript.
- Rule 2: every `className` is a hand-rolled BEM-style class against `src/styles/App.css`; Tailwind is not installed.
- Rule 3: every UI primitive (`Button`, `<input type="file">`, `<button>` grids, the toggle, the code-block) is hand-rolled; no Shadcn/Radix.
- Rule 7: most data-driven components lack explicit `loading` / `error` / `empty` branches.

There are also targeted Rule 8 (typed prop interfaces), Rule 12 (aria-label), Rule 4 (`react-syntax-highlighter`), and one inline-style violation in `CodeViewer`.

This plan groups the remediation by phase (each phase is a meaningful, independently revertable PR). Within each phase, changes are listed file-by-file with the concrete edit.

## Migration footprint (recap of audit findings)

- Build: `frontend/package.json` (React 18.3.1, Vite 5.4.10) and `frontend/vite.config.js` exist; no `tsconfig.json`, no `tailwind.config.*`, no `postcss.config.*`, no `components.json`.
- Styles: `src/styles/tokens.css` defines ~20 CSS variables for light + dark themes; `src/styles/App.css` defines every class referenced by components. Tokens stay; App.css disappears.
- Theming: `src/contexts/ThemeContext.jsx` sets `document.documentElement.dataset.theme` — Tailwind's `darkMode: ['class', '[data-theme="dark"]']` will reuse this without changes.
- Sanctioned third-party UI lib: `react-syntax-highlighter` is referenced by `CLAUDE.md` — kept, with the skill updated to whitelist it.

## Open decisions (resolve before starting Phase 1)

1. **PR shape.** Recommended: four sequential PRs, one per phase below. Lower blast radius than a monolithic PR; each phase has a clear acceptance test.Yes
2. **Rule 4 exception.** Recommended: keep `react-syntax-highlighter`, update SKILL.md to whitelist it (it is explicitly authorised in `CLAUDE.md`).NI
3. **Custom Button.** Recommended: delete `components/Button.jsx` and import Shadcn `Button` directly at call sites (Phase1, Phase2, CodeViewer). Cleanest end state.Yes
---

## Phase 1 — TypeScript migration (Rule 1, Rule 8)

Acceptance: `npm run build` succeeds; every previously-`.jsx` file is `.tsx`; props have named `interface`s; `services/api.js` is `services/api.ts` with typed request/response models.

### 1.1 Tooling

- Install: `typescript`, `@types/react`, `@types/react-dom`, `@types/react-router-dom` (devDeps).
- Create `frontend/tsconfig.json` (strict: true, jsx: react-jsx, module: ESNext, moduleResolution: bundler, target: ES2020, isolatedModules: true, noUncheckedIndexedAccess: true, allowImportingTsExtensions: false).
- Create `frontend/tsconfig.node.json` for the Vite config.
- Rename `vite.config.js` → `vite.config.ts` (no logic change; the proxy and React plugin stay).
- Update `package.json` `scripts.build` to run `tsc --noEmit && vite build`.

### 1.2 File renames (no behavioural change)

| Old path | New path |
|----------|----------|
| `src/main.jsx` | `src/main.tsx` |
| `src/App.jsx` | `src/App.tsx` |
| `src/pages/Phase1.jsx` | `src/pages/Phase1.tsx` |
| `src/pages/Phase2.jsx` | `src/pages/Phase2.tsx` |
| `src/components/DocumentUpload.jsx` | `src/components/DocumentUpload.tsx` |
| `src/components/StrategyRecommendation.jsx` | `src/components/StrategyRecommendation.tsx` |
| `src/components/ProviderSelector.jsx` | `src/components/ProviderSelector.tsx` |
| `src/components/Button.jsx` | `src/components/Button.tsx` (deleted in Phase 3) |
| `src/components/ThemeToggle.jsx` | `src/components/ThemeToggle.tsx` |
| `src/components/CodeViewer.jsx` | `src/components/CodeViewer.tsx` |
| `src/contexts/ThemeContext.jsx` | `src/contexts/ThemeContext.tsx` |
| `src/services/api.js` | `src/services/api.ts` |

Update every relative import to drop the explicit `.jsx` suffix (let TS resolve).

### 1.3 Shared type definitions

Create `src/types/api.ts` mirroring backend Pydantic models:

```ts
export interface UploadResult { doc_id: string; metadata: DocumentMetadata; }
export interface DocumentMetadata { /* size_bytes, page_count, mime_type, language, ... */ }
export interface Recommendation { chunk_size_tokens: number; chunk_overlap_tokens: number; embedding_model: string; search_method: string; source: "rule" | "llm"; confidence: number; rationale: string; }
export type StageId = "storage" | "document_extraction" | "embedding" | "vector_search";
export interface Provider { id: string; name: string; description: string; pricing_notes: string; requires_env: string[]; }
export type ProviderCatalog = Record<StageId, Provider[]>;
export interface GenerateResult { code: string; requires_env: string[]; }
```

### 1.4 Prop interfaces (Rule 8)

- `DocumentUpload`: `interface DocumentUploadProps { onUploaded?: (result: UploadResult) => void; }`
- `StrategyRecommendation`: `interface StrategyRecommendationProps { recommendation: Recommendation; }`
- `ProviderSelector`: `interface ProviderSelectorProps { stage: StageId; providers: Provider[]; selected?: string; onSelect: (id: string) => void; }`
- `Button` (interim, deleted in Phase 3): `interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "danger"; size?: "sm" | "md" | "lg"; }`
- `CodeViewer`: `interface CodeViewerProps { code: string; requiresEnv?: string[]; }`
- `ThemeContext`: `type ThemePref = "light" | "dark" | "system"; interface ThemeContextValue { preference: ThemePref; resolvedTheme: "light" | "dark"; setPreference: (p: ThemePref) => void; } interface ThemeProviderProps { children: React.ReactNode; }`

### 1.5 `services/api.ts` typing

- Type each function's return: `uploadDocument(file: File): Promise<UploadResult>`, `analyzeDocument(docId: string): Promise<Recommendation>`, `fetchProviders(): Promise<ProviderCatalog>`, `generateCode(selections: Record<StageId, string>): Promise<GenerateResult>`.

---

## Phase 2 — Tailwind adoption (Rule 2)

Acceptance: `src/styles/App.css` is deleted; every component renders with Tailwind utilities; light/dark switch still works via existing `data-theme` attribute.

### 2.1 Tooling

- Install: `tailwindcss`, `postcss`, `autoprefixer` (devDeps).
- Create `frontend/tailwind.config.ts`:
  - `content: ['./index.html', './src/**/*.{ts,tsx}']`
  - `darkMode: ['class', '[data-theme="dark"]']` (matches `ThemeContext`'s `data-theme` attribute)
  - `theme.extend.colors`: map every `tokens.css` variable through `var(--color-…)` (so the existing dark-mode swap continues to work without duplicate values). Example: `surface: 'var(--color-surface)'`, `primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)' }`, etc.
- Create `frontend/postcss.config.ts` with `tailwindcss` + `autoprefixer`.
- Update `src/styles/App.css` → replace contents with `@tailwind base; @tailwind components; @tailwind utilities;` and keep the `tokens.css` import. Rename to `src/styles/global.css` for clarity (and update `main.tsx`).
- Keep `src/styles/tokens.css` as the single source of truth for theme colours.

### 2.2 Class → utility mapping (per file)

`src/App.tsx`:
- `.app` → `min-h-screen flex flex-col bg-bg text-fg`
- `.app-header` → `flex items-center gap-6 px-8 py-4 bg-surface border-b border-border`
- `.app-main` → `max-w-[960px] mx-auto px-8 py-8 w-full`

`src/components/DocumentUpload.tsx`:
- `.card` → `bg-surface border border-border rounded-lg p-5 mb-5`
- `.upload` → `inline-block`
- `.upload input` (hidden) → `sr-only`
- `.upload span` → `inline-block px-4 py-2 bg-primary text-white rounded-md cursor-pointer hover:bg-primary-hover`
- `.error` → `text-danger mt-2`

`src/components/StrategyRecommendation.tsx`:
- `.card` → `bg-surface border border-border rounded-lg p-5 mb-5`
- `.rationale` → `text-fg-muted italic mt-3`

`src/components/ProviderSelector.tsx`:
- `.card` → as above
- `.provider-grid` → `grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3`
- `.provider` → `flex flex-col gap-1 p-3 border border-border rounded-md bg-surface text-left transition-colors hover:bg-hover-soft hover:border-border-strong`
- `.provider.selected` → `border-primary ring-2 ring-primary-ring`

`src/components/Button.tsx` (interim — deleted in Phase 3):
- `.btn` → `inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed`
- `.btn--sm/md/lg` → `text-sm px-3 py-1.5` / `text-sm px-4 py-2` / `text-base px-5 py-2.5`
- `.btn--primary` → `bg-primary text-white hover:bg-primary-hover focus:ring-2 focus:ring-primary-ring`
- `.btn--secondary` → `bg-surface text-fg border border-border-strong hover:bg-hover-soft`
- `.btn--danger` → `bg-danger text-white hover:bg-danger-hover focus:ring-2 focus:ring-danger-ring`

`src/components/ThemeToggle.tsx`:
- `.theme-toggle` → `inline-flex p-0.5 bg-bg border border-border rounded-full`
- `.theme-toggle__btn` → `inline-flex items-center justify-center w-8 h-7 bg-transparent rounded-full transition-colors aria-pressed:bg-surface aria-pressed:text-primary`

`src/components/CodeViewer.tsx`:
- `.card` → as above
- `.code-header` → `flex justify-between items-center mb-3`
- `.env-hint` → `text-sm text-fg-muted mb-2`
- Inline `customStyle={…}` on `SyntaxHighlighter` (line 26) → remove; pass `className="m-0 rounded-md text-[0.85rem] p-4"` instead (react-syntax-highlighter forwards `className` to its `<pre>`).

`src/pages/Phase1.tsx`:
- `.card` on the metadata block → `bg-surface border border-border rounded-lg p-5 mb-5`
- The bare `<pre>` → `className="font-mono text-sm whitespace-pre-wrap"`

`src/pages/Phase2.tsx`:
- `.generate-btn` → handled by passing `variant="primary"` (after Phase 3) or `className="bg-success hover:bg-success-hover disabled:bg-success-disabled"` to the Button in the interim.

### 2.3 Delete

- Remove every `.btn`, `.card`, `.provider`, `.theme-toggle`, `.app-*`, `.code-header`, `.env-hint`, `.rationale`, `.upload`, `.error`, `.generate-btn`, `.primary` rule from `App.css` once all replacements are in place.

---

## Phase 3 — Shadcn / Radix primitives (Rule 3, Rule 4)

Acceptance: `Button.tsx` is deleted; every interactive primitive is Shadcn or Radix; `react-syntax-highlighter` is the only sanctioned third-party UI library and SKILL.md is updated to whitelist it.

### 3.1 Tooling

- Run `npx shadcn@latest init` to create `components.json` + `lib/utils.ts` (`cn` helper).
- `npx shadcn@latest add button` → drops `src/components/ui/button.tsx`.
- `npx shadcn@latest add input` → drops `src/components/ui/input.tsx`.
- `npx shadcn@latest add toggle-group` → drops `src/components/ui/toggle-group.tsx` (uses Radix `ToggleGroup`).
- Install Radix peer deps as required by the above (`@radix-ui/react-slot`, `@radix-ui/react-toggle-group`).

### 3.2 Per-file primitive swaps

`src/components/Button.tsx`:
- **Delete.** Update every import:
  - `src/pages/Phase1.tsx`: `import { Button } from "../components/ui/button"`
  - `src/pages/Phase2.tsx`: `import { Button } from "../components/ui/button"`
  - `src/components/CodeViewer.tsx`: `import { Button } from "./ui/button"`
- Map old props to Shadcn variants: `variant="primary"` → `variant="default"`, `variant="secondary"` → `variant="secondary"`, `variant="danger"` → `variant="destructive"`. `size="sm"|"md"|"lg"` → `size="sm"|"default"|"lg"`.

`src/components/DocumentUpload.tsx`:
- Replace the bare `<input type="file" …>` with a Shadcn `Input` styled via `cn()` + a wrapping Shadcn `Button` ("Choose a document") that triggers the hidden input via `ref.current?.click()`. Pattern: `Button` (visible) + `<input ref={ref} type="file" className="sr-only" aria-label="Upload document" />`.

`src/components/ProviderSelector.tsx`:
- Replace the hand-rolled `<button>` grid with Radix `ToggleGroup` (`type="single"`, `value={selected}`, `onValueChange={onSelect}`). Each option becomes a `ToggleGroupItem` styled with Tailwind to match the existing card-grid look.

`src/components/ThemeToggle.tsx`:
- Replace the hand-rolled `<button>` array with Radix `ToggleGroup` (`type="single"`, `value={preference}`, `onValueChange={(v) => v && setPreference(v as ThemePref)}`). Items: light / system / dark. `aria-label` already present.

`src/components/CodeViewer.tsx`:
- Replace `<button onClick={copy}>Copy</button>` with Shadcn `Button variant="secondary" size="sm"`.

### 3.3 SKILL.md whitelist

- Edit `.claude/skills/frontend/component-skill/SKILL.md` to add: "`react-syntax-highlighter` is sanctioned for code-block rendering (see `CodeViewer.tsx`). No other third-party UI libraries are permitted." This documents the Rule 4 exception so future audits don't re-flag it.

---

## Phase 4 — Loading / error / empty + aria-labels (Rule 7, Rule 12)

Acceptance: every data-driven component renders an explicit branch for each of `loading`, `error`, `empty`; every interactive element has an `aria-label`.

### 4.1 Loading / error / empty branches

`src/pages/Phase1.tsx`:
- Add `error` state: `const [error, setError] = useState<string | null>(null);`.
- `handleUploaded`: wrap analyze call in `try/catch`, `setError(err.message)` on failure, clear in `setError(null)` on retry.
- Render: `{loading && <p>Analyzing…</p>}`, `{error && <p role="alert" className="text-danger">{error}</p>}`, `{!upload && !loading && !error && <p className="text-fg-muted">Upload a document to begin.</p>}` (explicit empty).

`src/pages/Phase2.tsx`:
- Add `loading` (catalog fetch), `error`, and an empty-catalog branch.
- `useEffect` fetch: `try { setCatalog(await fetchProviders()); } catch (e) { setError(...); } finally { setLoading(false); }`.
- `handleGenerate`: wrap in `try/catch` with its own error state for generate failures.
- Render explicit empty when `catalog && Object.values(catalog).every(arr => arr.length === 0)`.

`src/components/StrategyRecommendation.tsx`:
- Guard against null: `if (!recommendation) return <p className="text-fg-muted">No recommendation yet.</p>;`

`src/components/ProviderSelector.tsx`:
- Add explicit empty branch: `{providers.length === 0 && <p className="text-fg-muted">No providers available for this stage.</p>}` before the toggle group.

`src/components/DocumentUpload.tsx`:
- Already handles loading (`busy`) and error. Add an explicit idle/empty caption so all three branches are visually distinct.

`src/components/CodeViewer.tsx`:
- Replace `{code ?? ""}` fallback with an explicit `{!code ? <p className="text-fg-muted">No code generated yet.</p> : <SyntaxHighlighter …>{code}</SyntaxHighlighter>}`.

### 4.2 aria-labels

| File | Element | aria-label |
|------|---------|------------|
| `App.tsx:12` | `<Link to="/phase1">` | `"Go to Phase 1 — Strategy"` |
| `App.tsx:13` | `<Link to="/phase2">` | `"Go to Phase 2 — Compare and Generate"` |
| `DocumentUpload.tsx` | hidden file input | `"Upload document"` |
| `ProviderSelector.tsx` | each `ToggleGroupItem` | `` `Select ${p.name} for ${stage}` `` + `aria-pressed={selected === p.id}` |
| `CodeViewer.tsx` | Copy button | `"Copy generated code to clipboard"` |
| `ThemeToggle.tsx` | items | already present ✅ |

### 4.3 Keyboard navigation check (Rule 13)

- Hidden file input must be reachable via `Tab` to the visible "Choose a document" Button which forwards `onClick` to `input.click()`. Verify `Enter` and `Space` both trigger the file picker.

---

## Verification

After each phase:
- `npm run build` (Phase 1+): must pass `tsc --noEmit` and `vite build`.
- `npm run dev` and walk through the golden path: upload → analyze (Phase 1), select providers → generate code (Phase 2), toggle theme.
- Keyboard-only run: `Tab` through every interactive element in both phases; confirm focus rings (`focus:ring-2 focus:ring-primary-ring`) are visible and the file picker opens via keyboard.
- Visual diff vs the current `main` branch (light + dark themes).
- Re-run the audit (read each file against SKILL.md) and confirm the compliance report ends at zero violations.

## Out of scope

- Backend changes.
- Storybook / component-test infrastructure (no test suite exists yet per CLAUDE.md).
- Refactoring `ThemeContext` beyond TypeScript typing — its behaviour is already correct.
- New features.

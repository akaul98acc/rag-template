# Feature: Light and Dark Mode

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-05-24
> **Last Updated:** 2026-05-24
> **Ticket:** TBD

---

## Overview

Add a theme system to the RAG Builder frontend so users can switch between a light and a dark color scheme. The theme should apply across both Phase 1 (Strategy Agent) and Phase 2 (Provider Comparator) views, persist across sessions, and default to the user's operating-system preference on first visit.

---

## Goals

- [ ] Provide a visible theme toggle accessible from every page (Phase 1 and Phase 2).
- [ ] Support three states: Light, Dark, and System (follow OS preference).
- [ ] Persist the user's choice across page reloads and across sessions on the same browser.
- [ ] Apply the theme to every existing UI surface — uploads, recommendation panel, parameter inputs, provider selector, code viewer — with no unreadable contrast.
- [ ] Avoid a "flash of wrong theme" on initial page load.

---

## Non-Goals

- Not adding custom user-defined themes or color pickers — only the two built-in palettes.
- Not theming the generated Python code preview's syntax highlighting beyond a single dark-and-light variant.
- Not adding per-component overrides — theme is global.
- Not changing any backend behavior or API contracts.
- Not adding accessibility features beyond contrast compliance (no high-contrast mode in this iteration).

---

## User Stories

| #   | Persona             | Want                                                  | So That                                                                | Priority |
| --- | ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| 1   | RAG pipeline author | Toggle the app between light and dark mode           | I can work comfortably in low-light or bright environments              | P0       |
| 2   | Returning user      | Have the app remember my theme choice                 | I do not have to re-select it every visit                               | P0       |
| 3   | First-time visitor  | See the app open in my OS's preferred color scheme    | The app feels native and consistent with the rest of my system          | P1       |
| 4   | Code-focused user   | Read generated Python code clearly in either theme    | I can copy code into my editor without straining to read it             | P1       |

---

## UX

### User Flow

1. User lands on Phase 1 or Phase 2.
2. On first visit, the app reads OS preference (`prefers-color-scheme`) and renders in the matching theme.
3. User clicks the theme toggle in the top navigation/header.
4. Toggle cycles between Light → Dark → System (or exposes the three options in a small menu).
5. App immediately re-renders in the selected theme.
6. Selection is saved in browser storage.
7. On subsequent visits, the saved selection is honored before paint to avoid theme flash.

### Wireframes / Mockups

> _Mockups TBD — the toggle should sit in the top-right of the header area shared by Phase 1 and Phase 2. Use a sun / moon / monitor icon set for the three states._

### Edge Cases & Empty States

| Scenario                                    | Expected Behaviour                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| First visit, no stored preference            | Use `prefers-color-scheme` from the OS                                        |
| OS preference changes while app is open     | If user is on "System", app updates live; otherwise app keeps the manual choice |
| Local storage unavailable (private mode)    | Theme works for the session but resets on reload                              |
| User loads the app on a slow connection     | No flash of wrong theme — initial theme is decided before first paint         |
| User has a stored value the app no longer supports | Fall back to System                                                       |

---

## Acceptance Criteria

### Functional

- [ ] Given a first-time visitor on a system set to dark mode, when the app loads, then it renders in dark mode.
- [ ] Given a user on any page, when they activate the theme toggle, then the entire app switches theme without a full page reload.
- [ ] Given a user has selected "Dark", when they reload or revisit the app, then it still renders in dark mode.
- [ ] Given a user on "System" mode, when their OS theme preference changes, then the app updates to match without a manual action.
- [ ] Given the user is on either Phase 1 or Phase 2, when the theme is toggled, then all components (upload, recommendation, parameters, provider selector, code viewer) reflect the new theme.

### Non-Functional

- [ ] No flash of unstyled / wrong-theme content on initial load.
- [ ] All text and interactive elements meet WCAG 2.1 AA contrast in both themes.
- [ ] Works on Chrome, Firefox, Edge (latest 2 versions).
- [ ] Mobile responsive at 375px and above; toggle remains reachable.
- [ ] Theme switch completes within one animation frame (no perceptible lag).

### Out of Scope for This Release

- [ ] ~~Custom user-defined color palettes~~
- [ ] ~~High-contrast accessibility mode~~
- [ ] ~~Per-page or per-component theme overrides~~

---

## Open Questions

| #   | Question                                                                                   | Owner   | Due | Resolution |
| --- | ------------------------------------------------------------------------------------------ | ------- | --- | ---------- |
| 1   | Should the toggle be a three-state control (Light / Dark / System) or a simple two-state? | Adarsh  | 24 May 2026    |        3 state is good    |
| 2   | Which syntax-highlighting theme should the code viewer use in dark mode?                  | Adarsh  | 24 May 2026    |      one use by vs code      |
| 3   | Should the theme key in storage be namespaced (e.g. `rag-builder.theme`) to avoid clashes?| Adarsh  | 24 May 2026    |    Yes        |

---

## Dependencies

- [ ] No backend dependency — purely a frontend change.
- [ ] Existing components in `frontend/src/components/` must be reviewed for hard-coded colors that need to move to theme tokens.

---

## Notes & References

- Affects all pages under `frontend/src/pages/` and all shared components under `frontend/src/components/`.
- Should coordinate with the existing `Button` component introduced in commit `16b23e0`.
- Per `CLAUDE.md`, frontend uses React (Vite, JavaScript) — solution should fit that stack without introducing a heavyweight UI library.

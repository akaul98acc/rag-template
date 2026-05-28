---
title: Component Architecture Skill
description: Rules for generating React frontend components in this project.
---

## Technology Constraints
<!-- Hard rules — Claude never deviates from these -->

- Always use functional components with TypeScript
- Styling: Tailwind utility classes only — no inline styles, no CSS modules
- UI primitives: Shadcn and Radix UI only — never build custom primitives from scratch
- Never install additional UI libraries without explicit instruction
- Sanctioned exception: `react-syntax-highlighter` is permitted for code-block rendering only (see `frontend/src/components/CodeViewer.tsx`). No other third-party UI libraries.

## Component Structure Rules
<!-- How every component must be shaped -->

- Co-locate state as close to usage as possible
- Lift state only when two or more siblings need it
- Every component must handle three states explicitly: loading, error, and empty
- Props must be typed with a TypeScript interface, never inline types

## Provider Integration Pattern
<!-- How components connect to backend services -->

- Never hardcode provider names (Azure, AWS) inside components
- Accept provider config via props or React context
- Each provider integration lives in a separate adapter file

## Accessibility Rules
- Every interactive element must have an aria-label
- File inputs must be keyboard navigable
- Color contrast must meet WCAG 2.1 AA minimum
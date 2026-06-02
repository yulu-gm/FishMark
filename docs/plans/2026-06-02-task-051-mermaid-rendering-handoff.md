Task: TASK-051 Mermaid / diagram code fence rendering
Status: DEV_DONE
Date: 2026-06-02

## What Changed

- `mermaid` fenced code blocks now render as inactive editor preview widgets.
- The preview renderer lazy-loads Mermaid from `mermaid-preview-renderer.ts`, initializes with `securityLevel: "strict"`, and removes unsafe SVG scripts / attributes before insertion.
- Active Mermaid code fences, source mode, and export all preserve Markdown source as the single document truth.
- HTML export uses a script-free source-code fallback for Mermaid fences instead of embedding runtime Mermaid scripts.
- A real Electron probe now opens a test Markdown sample, waits for valid Mermaid SVG, invalid Mermaid source fallback, and footnote widgets, then saves a screenshot.

## Files

- `packages/editor-core/src/decorations/mermaid-widgets.ts`
- `packages/editor-core/src/decorations/mermaid-preview-renderer.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/mermaid-footnote-render-probe.html`
- `src/renderer/mermaid-footnote-render-probe.ts`
- `scripts/probe-mermaid-footnote-rendering.mjs`
- `scripts/electron-mermaid-footnote-render-main.cjs`
- `src/renderer/export-html.test.ts`
- `src/main/editor-math-preview-assets.test.ts`
- `packages/editor-core/src/decorations/mermaid-preview-renderer.test.ts`
- `package.json`

## Recommended Verification

```powershell
npm.cmd run test:mermaid-footnote-render
npm.cmd exec vitest -- run packages/editor-core/src/decorations/mermaid-preview-renderer.test.ts --reporter=verbose
npm.cmd exec vitest -- run packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/main/editor-math-preview-assets.test.ts --reporter=verbose --testNamePattern "Mermaid|source mode|footnote|preview assets|export"
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run perf:bundle
npm.cmd audit --omit=dev
git diff --check
```

## Manual Acceptance Draft

1. Open the sample from `TC-051-MERMAID` in `docs/test-cases.md`.
2. Move the cursor outside the Mermaid fence and footnote paragraph.
3. Confirm valid footnote references render as superscript labels, while undefined references remain raw.
4. Confirm the valid `mermaid` fence renders a diagram SVG.
5. Confirm an invalid `mermaid` fence stays readable as its original fenced source instead of crashing or disappearing.
6. Move the cursor into the Mermaid fence and confirm the original fenced source returns.
7. Toggle source mode and confirm all Markdown previews disappear.
8. Run `npm.cmd run test:mermaid-footnote-render` and inspect `.artifacts/visual-verification/mermaid-footnote-render-probe.png`.

## Known Boundaries

- HTML export uses safe source fallback for Mermaid instead of static SVG generation.
- Mermaid runtime is large but lazy-only; `perf:bundle` now requires a Mermaid lazy chunk and forbids Mermaid in the initial source group.

# TASK-051 Mermaid Preview Summary

## Result

PASS. TASK-051 Mermaid / diagram code fence 渲染已完成首版编辑器预览实现，状态同步为 `DEV_DONE`。

## Delivered

- Added inactive `mermaid` fenced code block preview widgets in editor-core.
- Added a lazy Mermaid renderer module with `securityLevel: "strict"` and SVG script / unsafe attribute cleanup.
- Preserved active code fence source restore and TASK-060 whole-document source mode gating.
- Kept HTML export script-free by explicitly treating Mermaid fences as safe source fallback code blocks.
- Added focused editor-core, renderer, export, preview asset, sanitizer behavior, bundle budget, and Electron screenshot probe coverage.
- Added `npm.cmd run test:mermaid-footnote-render`, which opens a real renderer page, verifies valid Mermaid SVG plus invalid Mermaid source fallback, and saves `.artifacts/visual-verification/mermaid-footnote-render-probe.png`.

## Verification

```powershell
npm.cmd exec vitest -- run packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/main/editor-math-preview-assets.test.ts --reporter=verbose --testNamePattern "Mermaid|source mode|footnote|preview assets|export"
npm.cmd exec vitest -- run packages/editor-core/src/decorations/mermaid-preview-renderer.test.ts --reporter=verbose
npm.cmd run test:mermaid-footnote-render
npm.cmd run typecheck
npm.cmd run perf:bundle
```

Current focused results:

- focused tests: 5 files, 23 matched tests passed.
- Electron probe: PASS; valid Mermaid rendered as SVG, invalid Mermaid fell back to its original fenced source, two valid footnote references rendered as label `1`, and screenshot written to `.artifacts/visual-verification/mermaid-footnote-render-probe.png`.
- sanitizer behavior test: PASS; `<script>`, event attributes, and `javascript:` attribute values are removed before SVG insertion.
- typecheck: passed.

Final all-repo quality gates are recorded in `docs/test-report.md`.

## Manual Acceptance

1. Open or paste the sample from `TC-051-MERMAID` in `docs/test-cases.md`.
2. Move the cursor outside the Mermaid fence and footnote paragraph.
3. Confirm valid `[^note]` references render as superscript `1`; repeated references reuse `1`.
4. Confirm undefined `[^missing]` remains raw source text.
5. Confirm the `mermaid` fence renders as a diagram SVG, not a code block.
6. Move the cursor into the Mermaid fence and confirm the full fenced source returns.
7. Toggle `</>` source mode and confirm all previews disappear and raw Markdown is visible.

## Residual Risk

- HTML export deliberately keeps Mermaid as safe source fallback in this first slice; it does not emit static Mermaid SVG.
- The full Mermaid package is lazy-loaded to support Mermaid broadly. It increases total JS gzip, so `perf:bundle` now gates `mermaid` as lazy-only and raises total gzip budget to 1,430,000 bytes.

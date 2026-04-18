# Theme Surface Render Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each theme choose default shader `renderScale` and animation `frameRate`, with per-surface overrides, so heavy dynamic themes can trade visual sharpness for better runtime efficiency.

**Architecture:** Extend the theme manifest with a small `render` config on `scene` and `surfaces.*`, normalize and validate those values centrally in the shared manifest parser, then resolve effective settings in the renderer runtime. The runtime keeps CSS layout size unchanged, but renders the shader canvas at a reduced internal resolution and throttles full-mode animation frames according to the resolved theme settings.

**Tech Stack:** TypeScript, React, Vitest, WebGL1, Electron renderer theme runtime

---

### Task 1: Manifest schema and normalization

**Files:**
- Modify: `src/shared/theme-package.ts`
- Test: `src/shared/theme-package.test.ts`

- [ ] Add failing tests that prove `scene.render` defaults are normalized, `surfaces.*.render` overrides are normalized, and invalid values are dropped.
- [ ] Run `npm run test -- src/shared/theme-package.test.ts` and confirm the new assertions fail for the expected missing-schema reason.
- [ ] Extend shared manifest types and normalization logic with `renderScale` and `frameRate` support.
- [ ] Re-run `npm run test -- src/shared/theme-package.test.ts` and confirm all manifest tests pass.

### Task 2: Runtime render scaling and frame throttling

**Files:**
- Modify: `src/renderer/shader/theme-surface-runtime.ts`
- Test: `src/renderer/shader/theme-surface-runtime.test.ts`

- [ ] Add failing runtime tests for reduced internal canvas size from `renderScale`, scene-default plus surface-override resolution, and full-mode frame throttling from `frameRate`.
- [ ] Run `npm run test -- src/renderer/shader/theme-surface-runtime.test.ts` and confirm the new assertions fail before implementation.
- [ ] Implement effective render config handling in the runtime without changing CSS box size or fallback behavior.
- [ ] Re-run `npm run test -- src/renderer/shader/theme-surface-runtime.test.ts` and confirm the runtime test suite passes.

### Task 3: Theme wiring and docs

**Files:**
- Modify: `fixtures/themes/ember-ascend/manifest.json`
- Modify: `docs/theme-authoring-guide.md`

- [ ] Configure `Ember Ascend` with theme-owned render defaults using the new schema.
- [ ] Update the theme authoring guide to document `scene.render` defaults and `surfaces.*.render` overrides.
- [ ] Run targeted verification for the touched suites and record any caveats in the final summary.

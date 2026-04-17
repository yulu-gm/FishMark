# Theme Family Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Yulora themes around family ids plus light/dark mode variants, with runtime fallback to builtin defaults and stable post-install theme discovery under `<userData>/themes`.

**Architecture:** Keep `theme.mode` as the only appearance-mode preference and reinterpret `theme.selectedId` as a theme family id. Move builtin default themes to a family-based directory layout inside renderer assets, scan only user-installed families from `app.getPath("userData")/themes`, and derive renderer resolution state so the settings UI can show missing-theme and unsupported-mode warnings without mutating saved preferences.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, CSS

---

### Task 1: Lock the family-based theme catalog contract with failing tests

**Files:**
- Modify: `src/main/theme-service.test.ts`
- Modify: `src/main/theme-service.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/renderer/types.d.ts`

- [ ] Write failing tests for `themes/<id>/<mode>` scanning, single-mode support, and empty-mode rejection.
- [ ] Run `npm.cmd test -- src/main/theme-service.test.ts` and confirm the new expectations fail for the right reason.
- [ ] Implement the minimal `ThemeFamilyDescriptor` shape and user-data-only scanner in `src/main/theme-service.ts`.
- [ ] Update preload bridge types/contracts to return theme families instead of flat theme entries.
- [ ] Re-run `npm.cmd test -- src/main/theme-service.test.ts src/preload/preload.contract.test.ts`.

### Task 2: Lock the builtin default family and runtime fallback behavior with failing renderer tests

**Files:**
- Modify: `src/renderer/theme-runtime.test.ts`
- Modify: `src/renderer/theme-runtime.ts`
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

- [ ] Write failing tests for builtin `default/light` and `default/dark` asset resolution.
- [ ] Add failing app-level tests for:
  - selecting a family id and resolving the active mode variant
  - falling back to builtin default when the selected family lacks the current mode
  - preserving the selected family id while showing fallback state
- [ ] Run `npm.cmd test -- src/renderer/theme-runtime.test.ts src/renderer/app.autosave.test.ts` and confirm the new assertions fail before implementation.
- [ ] Implement the minimal runtime changes in `theme-runtime.ts` and `App.tsx`.
- [ ] Re-run the same focused renderer tests until green.

### Task 3: Migrate preference semantics and surface settings warnings

**Files:**
- Modify: `src/shared/preferences.ts`
- Modify: `src/shared/preferences.test.ts`
- Modify: `src/renderer/editor/settings-view.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

- [ ] Write failing tests for legacy `selectedId` normalization from `*-light` and `*-dark` to family ids.
- [ ] Add failing settings tests for unsupported-mode and missing-theme warnings.
- [ ] Run `npm.cmd test -- src/shared/preferences.test.ts src/renderer/app.autosave.test.ts` and confirm red.
- [ ] Implement the minimal preference normalization and settings warning UI.
- [ ] Re-run the same focused tests until green.

### Task 4: Restructure builtin theme assets to the family-based layout

**Files:**
- Move: `src/renderer/styles/themes/default-light/*` -> `src/renderer/styles/themes/default/light/*`
- Move: `src/renderer/styles/themes/default-dark/*` -> `src/renderer/styles/themes/default/dark/*`
- Modify: Any runtime/tests/docs paths that still reference `default-light` or `default-dark`

- [ ] Move the builtin default theme files into `default/light` and `default/dark`.
- [ ] Update all source and test references to the new paths.
- [ ] Run `npm.cmd test -- src/renderer/theme-runtime.test.ts src/renderer/app.autosave.test.ts` to verify the path migration stays green.

### Task 5: Update docs and full verification gates

**Files:**
- Modify: `docs/test-cases.md`
- Modify: `docs/progress.md`
- Modify: `docs/plans/2026-04-16-theme-and-typography-plan.md`

- [ ] Update manual test cases to use `<userData>/themes/<familyId>/<mode>`.
- [ ] Update progress/design docs so the recorded architecture matches the new family-based model.
- [ ] Run:
  - `npm.cmd test`
  - `npm.cmd lint`
  - `npm.cmd typecheck`
  - `npm.cmd build`
- [ ] Record any failures honestly and fix them before closing the task.

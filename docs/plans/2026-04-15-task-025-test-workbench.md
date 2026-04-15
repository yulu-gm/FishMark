# TASK-025 Test Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated test workbench mode that launches an isolated Electron window for testing control flow without affecting the normal editor shell.

**Architecture:** The main process owns mode selection and window creation. The preload layer exposes a read-only bridge describing whether the renderer is in test mode. The renderer branches at the app shell level to render either the existing editor shell or a new workbench shell with scenario list, debug, process status, and a placeholder action for opening editor test windows later.

**Tech Stack:** Electron, React, TypeScript, Vitest, Vite

---

### Task 1: Add test mode entry resolution

**Files:**
- Modify: `src/main/paths.ts`
- Test: `src/main/paths.test.ts`

**Step 1: Write the failing test**

Add tests that define:
- normal mode keeps returning the existing renderer entry
- test mode appends a stable query such as `?mode=test-workbench`
- dev server and built file flows both preserve the mode signal

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/paths.test.ts`
Expected: FAIL because `resolveRendererEntry` does not support mode-aware URLs yet.

**Step 3: Write minimal implementation**

Update `resolveRendererEntry` so the main process can request a dedicated test workbench renderer entry without duplicating HTML files.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/paths.test.ts`
Expected: PASS.

### Task 2: Add main-process test workbench window creation

**Files:**
- Modify: `src/main/main.ts`
- Create: `src/main/test-workbench-window.test.ts`

**Step 1: Write the failing test**

Add tests that define:
- test mode creates only the workbench window
- normal mode creates the editor window
- workbench window uses isolated preload and mode-aware renderer entry
- app activate reopens the correct window type when all windows are closed

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/test-workbench-window.test.ts`
Expected: FAIL because window creation is still hard-coded for the editor shell.

**Step 3: Write minimal implementation**

Extract window creation helpers and mode detection from `main.ts`. Add a test-mode startup branch driven by a stable environment variable.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/test-workbench-window.test.ts`
Expected: PASS.

### Task 3: Expose a minimal preload bridge for test mode

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.d.ts`
- Test: `src/main/package-scripts.test.ts`

**Step 1: Write the failing test**

Add assertions that:
- the preload API exposes a read-only `runtimeMode`
- package scripts provide a dedicated test workbench launch command

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/package-scripts.test.ts`
Expected: FAIL because the runtime mode bridge and script entry do not exist yet.

**Step 3: Write minimal implementation**

Expose `runtimeMode` from preload and add a dedicated script that launches Electron in test workbench mode without changing the normal dev flow.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/package-scripts.test.ts`
Expected: PASS.

### Task 4: Render the test workbench shell in the renderer

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/test-workbench.test.tsx`

**Step 1: Write the failing test**

Add tests that define:
- test mode renders a workbench title and subtitle
- the page shows scenario list, debug panel, and test process panel placeholders
- the page shows a control to open a dedicated editor test window later
- normal mode still renders the existing editor shell unchanged

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/test-workbench.test.tsx`
Expected: FAIL because `App.tsx` only renders the editor shell today.

**Step 3: Write minimal implementation**

Branch the app shell on `window.yulora.runtimeMode`, keeping the existing editor flow intact while adding a minimal workbench page.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/test-workbench.test.tsx`
Expected: PASS.

### Task 5: Verify and document

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/test-cases.md`
- Modify: `docs/test-report.md`
- Create: `reports/task-summaries/TASK-025.md`

**Step 1: Run targeted verification**

Run:
- `npm run test -- src/main/paths.test.ts src/main/package-scripts.test.ts src/main/test-workbench-window.test.ts`
- `npm run test -- src/renderer/test-workbench.test.tsx`

Expected: PASS.

**Step 2: Run project gates**

Run:
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Expected: PASS.

**Step 3: Update docs**

Record task status, verification evidence, and a brief summary of the delivered workbench scope.

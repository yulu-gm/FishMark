# App Shell Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real File menu for `Open / Save / Save As` and restyle the temporary shell into a desktop-editor layout.

**Architecture:** Keep menus in `main`, expose a limited menu-command subscription in `preload`, and let `renderer` reuse the existing file bridge handlers. UI polish stays in the current shell without widening into block rendering work.

**Tech Stack:** Electron, React, TypeScript, Vitest

---

### Task 1: Define the task and records

**Files:**
- Modify: `MVP_BACKLOG.md`

**Step 1: Add a focused backlog entry**

Document `TASK-032` as a small shell/menu polish task with clear in-scope and out-of-scope limits.

**Step 2: Keep the task isolated**

Do not expand this task into recent files, custom title bars, or block rendering behavior.

### Task 2: Write failing tests for menu command wiring

**Files:**
- Create: `src/main/application-menu.test.ts`
- Create: `src/main/application-menu.ts`

**Step 1: Write a test for File menu command items**

Assert that the File submenu includes `Open...`, `Save`, and `Save As...`, and that clicking them dispatches the expected command strings.

**Step 2: Run the targeted test to confirm it fails**

Run: `npm run test -- src/main/application-menu.test.ts`
Expected: FAIL because `application-menu.ts` does not exist yet.

### Task 3: Implement main/preload/renderer menu command flow

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.d.ts`
- Modify: `src/renderer/App.tsx`
- Create: `src/shared/menu-command.ts`
- Create: `src/main/application-menu.ts`

**Step 1: Add the shared menu command type and channel**

Define a small union for the three supported commands and a dedicated IPC event channel.

**Step 2: Implement the application menu**

Build a File menu that sends the right command to the focused window and install it during app startup.

**Step 3: Expose a limited preload subscription**

Add `window.yulora.onMenuCommand()` with an unsubscribe function.

**Step 4: Handle menu commands in the app shell**

Subscribe once in `App.tsx` and route commands into the existing open/save handlers.

### Task 4: Restyle the shell

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Remove the demo-card CTA layout**

Replace the centered marketing-style card with an editor-shell layout.

**Step 2: Keep only lightweight document metadata in the top bar**

Show document title, path, dirty/saved state, and concise menu guidance.

**Step 3: Preserve the existing empty state and editor behavior**

The UI polish must not change the save/open semantics or editor integration.

### Task 5: Verify and update task records

**Files:**
- Modify: `docs/test-cases.md`
- Modify: `docs/test-report.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/progress.md`
- Create: `reports/task-summaries/TASK-032.md`

**Step 1: Run targeted and full gates**

Run:
- `npm run test -- src/main/application-menu.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

**Step 2: Record verification evidence and decisions**

Update task records with the menu decision, shell-polish scope, and fresh verification output.

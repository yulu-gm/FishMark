# RF-101 Workspace Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main-local workspace service with one runtime-neutral, revision-driven `@fishmark/workspace-domain` package and delete every old implementation/type path without changing the renderer IPC wire contract.

**Architecture:** A real local CommonJS package owns immutable text buffers, document sessions, revisions, saved checkpoints, windows, tabs, and projections. Electron main owns the only live state instance and consumes the package through its public entry; existing application/coordinator modules remain main-local until RF-102. The string buffer is a valid reference implementation; RF-201 changes only the production buffer factory.

**Tech Stack:** TypeScript 5.9, Node/Electron CommonJS, Vitest, Vite, ESLint, npm local file dependency.

---

## Locked file map

Create:

- `packages/workspace-domain/package.json` — runtime package/exports contract.
- `packages/workspace-domain/tsconfig.json` — isolated CommonJS and declaration output.
- `packages/workspace-domain/README.md` — ownership and dependency boundary.
- `packages/workspace-domain/src/document-revision.ts` — revision validation/increment.
- `packages/workspace-domain/src/disk-version.ts` — disk identity value type.
- `packages/workspace-domain/src/text-buffer.ts` — buffer port and immutable string implementation.
- `packages/workspace-domain/src/text-buffer.test.ts` — buffer contract tests.
- `packages/workspace-domain/src/document-session.ts` — session state transitions and projections.
- `packages/workspace-domain/src/document-session.test.ts` — revision/save-race tests.
- `packages/workspace-domain/src/workspace-state.ts` — canonical window/tab ownership and operations.
- `packages/workspace-domain/src/workspace-state.test.ts` — workspace rule tests replacing the old service suite.
- `packages/workspace-domain/src/index.ts` — only public source entry.
- `scripts/verify-workspace-domain-runtime.mjs` — emitted Node resolution smoke check.
- `docs/plans/2026-07-16-rf-101-handoff.md` — implementation evidence for acceptance.

Modify:

- `.gitignore`, `eslint.config.mjs` — ignore package build output.
- `package.json`, `package-lock.json` — local production dependency and build/dev/typecheck lifecycle.
- `tsconfig.renderer.json`, `tsconfig.vitest.json`, `vite.config.ts`, `vitest.config.ts` — source aliases where bundler/test resolution is required.
- `fixtures/architecture/editor-foundation-guard.json`, `src/main/editor-foundation-architecture.test.ts` — activate and enforce the package boundary.
- `src/main/workspace-application.ts` and test — captured revision save.
- `src/main/workspace-close-coordinator.ts` and test — captured revision close/save.
- `src/main/main.ts`, `src/main/main.test.ts` — package composition and all direct operations.
- `docs/decision-log.md`, `docs/refactor/editor-foundation/progress.md` — ownership and evidence.

Delete during the hard cutover:

- `src/main/workspace-service.ts`
- `src/main/workspace-service.test.ts`

Do not modify `src/shared/workspace.ts`, preload bridge types, renderer workspace controllers, or Markdown editing behavior unless a focused regression proves the existing contract cannot be preserved.

## Task 1: Establish the real package, buffer contract, and architecture boundary

**Files:**

- Create: `packages/workspace-domain/package.json`
- Create: `packages/workspace-domain/tsconfig.json`
- Create: `packages/workspace-domain/README.md`
- Create: `packages/workspace-domain/src/document-revision.ts`
- Create: `packages/workspace-domain/src/text-buffer.ts`
- Create: `packages/workspace-domain/src/text-buffer.test.ts`
- Create: `packages/workspace-domain/src/index.ts`
- Create: `scripts/verify-workspace-domain-runtime.mjs`
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.renderer.json`
- Modify: `tsconfig.vitest.json`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Modify: `fixtures/architecture/editor-foundation-guard.json`
- Modify: `src/main/editor-foundation-architecture.test.ts`

- [ ] **Step 1: Add failing buffer and active-boundary tests**

Create `text-buffer.test.ts` with exact cases for empty text, Unicode/CRLF preservation, slicing, one replacement, multiple sorted changes, immutability, unsorted/overlapping changes, non-integer positions, negative positions, and out-of-range positions. Use this core shape:

```ts
import { describe, expect, it } from 'vitest';
import { createStringTextBuffer } from './text-buffer';

describe('createStringTextBuffer', () => {
  it('applies sorted changes against the original buffer without mutation', () => {
    const original = createStringTextBuffer('alpha\r\nbeta🙂');
    const next = original.apply([
      { from: 0, to: 5, insert: 'A' },
      { from: 7, to: 11, insert: 'B' }
    ]);

    expect(original.toString()).toBe('alpha\r\nbeta🙂');
    expect(next.toString()).toBe('A\r\nB🙂');
  });

  it.each([
    [[{ from: 2, to: 1, insert: '' }], 'invalid range'],
    [[{ from: -1, to: 0, insert: '' }], 'outside buffer'],
    [[{ from: 0.5, to: 1, insert: '' }], 'integer'],
    [[{ from: 1, to: 3, insert: '' }, { from: 2, to: 4, insert: '' }], 'sorted and non-overlapping']
  ])('rejects invalid changes %#', (changes, message) => {
    expect(() => createStringTextBuffer('abcd').apply(changes)).toThrow(message);
  });
});
```

Extend the architecture test matrix with `packages/workspace-domain/src/forbidden.ts` cases for `electron`, `react`, `@codemirror/state`, and `../../../src/main/main`, plus a valid runtime-neutral local import. Add an assertion that the real manifest entry/rule are active and source-matched.

- [ ] **Step 2: Run RED tests**

```powershell
npm.cmd run test -- packages/workspace-domain/src/text-buffer.test.ts src/main/editor-foundation-architecture.test.ts
```

Expected: the buffer suite fails because the package modules do not exist, and the architecture assertion fails because `workspace-domain` is still `planned` without an active rule.

- [ ] **Step 3: Add package metadata and build lifecycle**

Use this package contract:

```json
{
  "name": "@fishmark/workspace-domain",
  "version": "0.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"]
}
```

Use `tsconfig.json` with `module`/`moduleResolution: Node16`, `rootDir: src`, `outDir: dist`, `declaration: true`, `composite: true`, `lib: [ES2022]`, and exclude `src/**/*.test.ts`.

Update root scripts so:

- `build:workspace-domain` runs `tsc -p packages/workspace-domain/tsconfig.json`;
- `dev:workspace-domain` runs the same config with `--watch --preserveWatchOutput`;
- `build:electron` first builds the package, then compiles Electron, then runs the runtime verifier;
- `typecheck` first builds the package so Electron resolves declarations;
- `clean` removes `packages/workspace-domain/dist` and its tsbuildinfo;
- both dev aggregators start the domain watcher;
- both Electron wait commands wait for `packages/workspace-domain/dist/index.js`.

Declare `"@fishmark/workspace-domain": "file:packages/workspace-domain"` in production dependencies, run `npm.cmd install --ignore-scripts`, and verify that only the expected package/lock entries change.

Add `packages/*/dist` to `.gitignore` and `eslint.config.mjs` ignores.

- [ ] **Step 4: Implement revisions and the immutable string buffer**

Use this public contract:

```ts
export type DocumentRevision = number;
export const INITIAL_DOCUMENT_REVISION: DocumentRevision = 0;

export function nextDocumentRevision(revision: DocumentRevision): DocumentRevision {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Document revision must be a non-negative safe integer.');
  }
  if (revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Document revision exhausted the safe integer range.');
  }
  return revision + 1;
}
```

`text-buffer.ts` must export `TextChange`, `TextBuffer`, and `createStringTextBuffer`. Validate all changes before constructing output. Apply changes against the original text by appending untouched slices and insertions in input order. Return the same buffer for an empty change list and a new immutable buffer for real changes. Do not export the implementation class.

`index.ts` explicitly re-exports named symbols; do not use `export *`.

- [ ] **Step 5: Activate package aliases and the RF-002 guard**

Add `@fishmark/workspace-domain` source resolution to Vite, Vitest, `tsconfig.renderer.json`, and `tsconfig.vitest.json`. Do not add a source path alias to `tsconfig.electron.json`; main must resolve the built local package rather than emit a bare alias with no runtime artifact.

Change the manifest package state to `active` and add:

```json
{
  "id": "boundary.workspace-domain",
  "kind": "forbidden-imports",
  "state": "active",
  "sourcePath": "packages/workspace-domain",
  "forbiddenPackages": ["react", "react-dom", "electron", "@codemirror/*"],
  "forbiddenPaths": [
    "src/main",
    "src/preload",
    "src/renderer",
    "packages/editor-core",
    "packages/workspace-application",
    "packages/workspace-infrastructure"
  ]
}
```

Keep the manifest as the only boundary registry.

- [ ] **Step 6: Add and run the real runtime verifier**

```js
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const domain = require('@fishmark/workspace-domain');
const buffer = domain.createStringTextBuffer('FishMark');

if (buffer.toString() !== 'FishMark') {
  throw new Error('workspace-domain runtime entry returned an invalid buffer');
}
```

Run:

```powershell
npm.cmd run build:workspace-domain
node scripts/verify-workspace-domain-runtime.mjs
npm.cmd run test -- packages/workspace-domain/src/text-buffer.test.ts src/main/editor-foundation-architecture.test.ts
```

Expected: runtime verifier exits `0`; buffer tests and architecture tests pass.

- [ ] **Step 7: Commit Slice A foundation**

```powershell
git add .gitignore eslint.config.mjs package.json package-lock.json tsconfig.renderer.json tsconfig.vitest.json vite.config.ts vitest.config.ts fixtures/architecture/editor-foundation-guard.json src/main/editor-foundation-architecture.test.ts packages/workspace-domain scripts/verify-workspace-domain-runtime.mjs
git commit -m "refactor: establish workspace domain package"
```

## Task 2: Implement revision-driven document sessions

**Files:**

- Create: `packages/workspace-domain/src/disk-version.ts`
- Create: `packages/workspace-domain/src/document-session.ts`
- Create: `packages/workspace-domain/src/document-session.test.ts`
- Modify: `packages/workspace-domain/src/index.ts`

- [ ] **Step 1: Write failing session tests**

Cover new/opened session `0/0`, identical update no-op, changed update one increment, exact restoration becoming clean, ordinary save, Save As metadata, a newer draft surviving save completion, a newer draft equal to saved result becoming clean, reload with changed text, reload with equal text, and `DiskVersion` preservation.

Use the save-race core:

```ts
it('commits only the captured revision when a newer draft exists', () => {
  const opened = createDocumentSession({
    tabId: 'tab-1',
    windowId: 'window-1',
    document: { path: 'C:/note.md', name: 'note.md', content: '# Saved\n', encoding: 'utf-8' }
  });
  const saving = replaceDocumentText(opened, '# Saving\n');
  const checkpoint = projectDocumentSession(saving);
  const newer = replaceDocumentText(saving, '# Newer\n');
  const committed = commitSavedDocument(newer, {
    capturedRevision: checkpoint.revision,
    document: { path: 'C:/note.md', name: 'note.md', content: checkpoint.content, encoding: 'utf-8' },
    diskVersion: null
  });

  expect(projectDocumentSession(committed)).toMatchObject({
    content: '# Newer\n', revision: 2, savedRevision: 1, isDirty: true
  });
});
```

- [ ] **Step 2: Run the session RED test**

```powershell
npm.cmd run test -- packages/workspace-domain/src/document-session.test.ts
```

Expected: FAIL because the session module and public symbols do not exist.

- [ ] **Step 3: Implement the session transition API**

Define `WorkspaceDocumentData`, `DocumentSaveState`, internal `DocumentSessionState`, public `DocumentSessionProjection`, and these package-internal functions:

```ts
createDocumentSession(input): DocumentSessionState
replaceDocumentText(session, content): DocumentSessionState
commitSavedDocument(session, input): DocumentSessionState
replaceDocumentFromDisk(session, document, diskVersion): DocumentSessionState
moveDocumentSession(session, windowId): DocumentSessionState
projectDocumentSession(session): DocumentSessionProjection
```

The public projection contains `tabId`, `windowId`, `path`, `name`, `content`, `encoding`, `revision`, `savedRevision`, derived `isDirty`, `saveState`, and `diskVersion`; it does not expose the saved buffer checkpoint.

For text replacement:

```ts
if (content === session.text.toString()) return session;
const revision = nextDocumentRevision(session.revision);
const text = session.text.apply([{ from: 0, to: session.text.length, insert: content }]);
const savedRevision = content === session.savedText.toString()
  ? revision
  : session.savedRevision;
return { ...session, text, revision, savedRevision };
```

For save completion, reject a captured revision greater than the current revision. Replace only saved metadata/checkpoint. Set `savedRevision` to current revision when current text equals the saved document; otherwise set it to the captured revision. Never replace current text.

For reload, replace text only when it differs, advance at most once, then assign the resulting current revision to `savedRevision` and the new text to the saved checkpoint.

- [ ] **Step 4: Export the public session values**

Export `DiskVersion`, `WorkspaceDocumentData`, `DocumentSaveState`, and `DocumentSessionProjection` through `index.ts`. Keep `DocumentSessionState` and transition helpers package-internal except for relative imports from `workspace-state.ts`.

- [ ] **Step 5: Run session and package verification**

```powershell
npm.cmd run test -- packages/workspace-domain/src/text-buffer.test.ts packages/workspace-domain/src/document-session.test.ts
npm.cmd run build:workspace-domain
node scripts/verify-workspace-domain-runtime.mjs
```

Expected: focused tests pass; declarations/JS emit; runtime entry resolves.

- [ ] **Step 6: Commit session semantics**

```powershell
git add packages/workspace-domain
git commit -m "refactor: add revisioned document sessions"
```

## Task 3: Port all workspace rules into WorkspaceState

**Files:**

- Create: `packages/workspace-domain/src/workspace-state.ts`
- Create: `packages/workspace-domain/src/workspace-state.test.ts`
- Modify: `packages/workspace-domain/src/index.ts`
- Modify: `scripts/verify-workspace-domain-runtime.mjs`

- [ ] **Step 1: Write the workspace behavior suite before implementation**

Port every case from `src/main/workspace-service.test.ts`, then add duplicate registration, unregister/focus, inactive close, reorder clamp/no-op, same-window move, atomic cross-window failure, detach, immutable projection, revision no-op/increment, exact restore-to-clean, and save-race cases.

Use only the public entry:

```ts
import {
  createWorkspaceState,
  type WorkspaceDocumentData
} from '@fishmark/workspace-domain';
```

- [ ] **Step 2: Run the WorkspaceState RED test**

```powershell
npm.cmd run test -- packages/workspace-domain/src/workspace-state.test.ts
```

Expected: FAIL because `createWorkspaceState` and projection types are not exported.

- [ ] **Step 3: Implement the public WorkspaceState contract**

```ts
export type WorkspaceState = {
  registerWindow(windowId: string): WorkspaceWindowProjection;
  unregisterWindow(windowId: string): void;
  focusWindow(windowId: string): void;
  getLastFocusedWindowId(): string | null;
  getWindowProjection(windowId: string): WorkspaceWindowProjection;
  getWindowTabIds(windowId: string): readonly string[];
  getTabSession(tabId: string): DocumentSessionProjection;
  getTabPath(tabId: string | null): string | null;
  createUntitledTab(windowId: string): WorkspaceWindowProjection;
  openDocument(windowId: string, document: WorkspaceDocumentData): WorkspaceWindowProjection;
  activateTab(windowId: string, tabId: string): WorkspaceWindowProjection;
  updateTabDraft(tabId: string, content: string): WorkspaceWindowProjection;
  saveTabDocument(input: CommitWorkspaceDocumentInput): WorkspaceWindowProjection;
  replaceTabDocument(tabId: string, document: WorkspaceDocumentData): WorkspaceWindowProjection;
  closeTab(tabId: string): WorkspaceWindowProjection;
  reorderTab(tabId: string, toIndex: number): WorkspaceWindowProjection;
  moveTabToWindow(input: MoveWorkspaceTabInput): WorkspaceMoveProjection;
  detachTabToWindow(input: DetachWorkspaceTabInput): WorkspaceMoveProjection;
};

export function createWorkspaceState(): WorkspaceState;
```

`CommitWorkspaceDocumentInput` contains `tabId`, `capturedRevision`, `document`, and `diskVersion`. Projection types remain structurally assignable to shared DTOs but are independently declared.

Keep mutable maps and the tab counter private. Validate every referenced window/tab and calculated index before mutation. Store window ownership in the canonical session, update it through the immutable move transition, and allocate fresh projection arrays/objects on every read.

- [ ] **Step 4: Make detach a domain operation**

`detachTabToWindow` takes a target window ID, registers it only when absent, then performs the atomic ownership move. If the target exists, preserve its tabs and insert at the requested/end index. BrowserWindow creation remains in main.

- [ ] **Step 5: Strengthen the runtime verifier**

Create a workspace, register `window-1`, create an untitled tab, update it, and assert revision `1` plus `isDirty: true`. This proves the emitted entry contains the full domain.

- [ ] **Step 6: Run the complete domain suite**

```powershell
npm.cmd run test -- packages/workspace-domain
npm.cmd run build:workspace-domain
node scripts/verify-workspace-domain-runtime.mjs
```

Expected: all domain tests pass and runtime smoke exits `0`.

- [ ] **Step 7: Commit WorkspaceState**

```powershell
git add packages/workspace-domain scripts/verify-workspace-domain-runtime.mjs
git commit -m "refactor: move workspace rules into domain"
```

## Task 4: Hard-cut main application, close, IPC composition, and delete the service

**Files:**

- Modify: `src/main/workspace-application.ts`
- Modify: `src/main/workspace-application.test.ts`
- Modify: `src/main/workspace-close-coordinator.ts`
- Modify: `src/main/workspace-close-coordinator.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/main.test.ts`
- Delete: `src/main/workspace-service.ts`
- Delete: `src/main/workspace-service.test.ts`

This task is one commit because application/coordinator ports require revision-bearing session projections. Do not add revision fields to the old service as an intermediate adapter.

- [ ] **Step 1: Change application tests to the public domain and add captured-revision assertions**

Replace the old service import with:

```ts
import { createWorkspaceState } from '@fishmark/workspace-domain';
```

Keep the existing canonical-save and save-race tests. Replace `lastSavedContent` assertions with revision assertions. Add a spy around `workspace.saveTabDocument` and verify the captured revision belongs to the content sent to disk:

```ts
expect(saveTabDocument).toHaveBeenCalledWith({
  tabId,
  capturedRevision: 1,
  document: expect.objectContaining({ content: '# Saved draft\n' }),
  diskVersion: null
});
expect(workspace.getTabSession(tabId)).toMatchObject({
  content: '# Newer draft\n',
  revision: 2,
  savedRevision: 1,
  isDirty: true
});
```

- [ ] **Step 2: Change close-coordinator tests to revision-bearing projections**

Import `createWorkspaceState` and `DocumentSessionProjection` from the public package. Preserve every save/discard/cancel/window-order/race test. In the save-during-close race, assert the newer content/revision remains and the captured revision is saved. Do not assert `lastSavedContent`.

- [ ] **Step 3: Change main source-contract tests before implementation**

Replace old source assertions with:

```ts
expect(mainSource).toContain('import { createWorkspaceState } from "@fishmark/workspace-domain"');
expect(mainSource).toContain('const workspaceState = createWorkspaceState()');
expect(mainSource).not.toContain('./workspace-service');
expect(mainSource).not.toContain('createWorkspaceService');
expect(mainSource).toContain('workspaceState.detachTabToWindow({');
expect(mainSource).toContain('capturedRevision: tabSession.revision');
```

Retain assertions that update/save commands still route through the application and that file watchers use the canonical tab path.

- [ ] **Step 4: Run the main-layer RED tests**

```powershell
npm.cmd run test -- src/main/workspace-application.test.ts src/main/workspace-close-coordinator.test.ts src/main/main.test.ts
```

Expected: FAIL on old imports, missing captured revisions, and old main composition.

- [ ] **Step 5: Update workspace-application to capture revision and text once**

Use `WorkspaceState`/projection types from the public package. `updateDraft` delegates to `updateTabDraft`. `saveTab` must read the session before awaiting IO:

```ts
async saveTab(input: { tabId: string; path: string }): Promise<SaveMarkdownFileResult> {
  const tab = dependencies.workspace.getTabSession(input.tabId);
  const result = await dependencies.saveMarkdownFileToPath({
    tabId: input.tabId,
    path: input.path,
    content: tab.content
  });

  if (result.status === 'success') {
    dependencies.workspace.saveTabDocument({
      tabId: input.tabId,
      capturedRevision: tab.revision,
      document: result.document,
      diskVersion: null
    });
  }

  return result;
}
```

Do not reread current revision after the write and do not send renderer content to save.

- [ ] **Step 6: Update close coordinator with the same checkpoint rule**

Rename the dependency key from `workspaceService` to `workspace`. After the user chooses save, capture one latest projection, write its content, and commit with that projection's revision:

```ts
const checkpoint = dependencies.workspace.getTabSession(tabId);
const result = checkpoint.path === null
  ? await dependencies.showSaveMarkdownDialog({
      tabId: checkpoint.tabId,
      currentPath: null,
      content: checkpoint.content
    })
  : await dependencies.saveMarkdownFileToPath({
      tabId: checkpoint.tabId,
      path: checkpoint.path,
      content: checkpoint.content
    });

if (result.status === 'success') {
  dependencies.workspace.saveTabDocument({
    tabId: checkpoint.tabId,
    capturedRevision: checkpoint.revision,
    document: result.document,
    diskVersion: null
  });
}
```

Return `false` when a newer revision remains dirty, preserving the existing close-race behavior.

- [ ] **Step 7: Cut main composition to WorkspaceState**

Import the public factory and rename the single instance to `workspaceState`. Replace every old call mechanically:

| Old | New |
| --- | --- |
| `workspaceService.getWindowSnapshot` | `workspaceState.getWindowProjection` |
| `workspaceService.*` other domain operations | `workspaceState.*` |
| coordinator dependency `workspaceService` | `workspace` |

For Save As, retain the pre-dialog checkpoint and commit its revision:

```ts
const tabSession = workspaceState.getTabSession(input.tabId);
const result = await showSaveMarkdownDialog({ ...input, content: tabSession.content });
if (result.status === 'success') {
  workspaceState.saveTabDocument({
    tabId: input.tabId,
    capturedRevision: tabSession.revision,
    document: result.document,
    diskVersion: null
  });
  // existing recent-file and watcher synchronization remains unchanged
}
```

For detach, create the BrowserWindow, then use one domain call:

```ts
const detachedWindow = windowManager.openEditorWindow();
const detachedWindowId = String(detachedWindow.id);
return syncWorkspaceWatch(
  event.sender,
  workspaceState.detachTabToWindow({
    tabId: input.tabId,
    targetWindowId: detachedWindowId
  }).sourceWindowSnapshot
);
```

Do not separately register the detached window in main; the domain detach operation owns that rule.

- [ ] **Step 8: Delete the old implementation and old test**

Delete both files with `apply_patch`. Do not leave a re-export file or move the old file into the package. The new `workspace-state.test.ts` is the replacement coverage.

- [ ] **Step 9: Run hard-cutover verification**

```powershell
npm.cmd run test -- packages/workspace-domain src/main/workspace-application.test.ts src/main/workspace-close-coordinator.test.ts src/main/main.test.ts
npm.cmd run typecheck
rg -n -e "workspace-service" -e "createWorkspaceService" -e "WorkspaceTabSessionSnapshot" src packages package.json
rg -n -e "packages/workspace-domain/src" -e "@fishmark/workspace-domain/" src packages
```

Expected: tests/typecheck pass. Both `rg` commands return no obsolete implementation or deep-import matches. A nonzero `rg` exit caused by zero matches is success; any printed match must be removed or proven to be an intentional same-package test import that does not cross the public boundary.

- [ ] **Step 10: Commit the hard cutover**

```powershell
git add src/main packages/workspace-domain
git commit -m "refactor: cut main over to workspace domain"
```

## Task 5: Close regression coverage, docs, and deletion evidence

**Files:**

- Modify: `packages/workspace-domain/README.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Create: `docs/plans/2026-07-16-rf-101-handoff.md`

- [ ] **Step 1: Run renderer/workspace regressions before documentation claims**

```powershell
npm.cmd run test -- src/renderer/editor/useWorkspaceController.test.tsx src/renderer/app.autosave.test.ts src/renderer/editor/useSaveController.test.tsx src/renderer/editor/useExternalConflictController.test.tsx
npm.cmd run test:editor-foundation
```

Expected: current renderer full-draft, optimistic projection, autosave, save, conflict, and RF architecture/performance tests pass without shared DTO changes.

- [ ] **Step 2: Run emitted runtime/build checks**

```powershell
npm.cmd run build:workspace-domain
node scripts/verify-workspace-domain-runtime.mjs
npm.cmd run build:electron
node scripts/verify-workspace-domain-runtime.mjs
```

Expected: both runtime checks exit `0`; Electron compilation leaves the existing `dist-electron/main/main.js` and `dist-electron/preload/preload.js` layout intact.

- [ ] **Step 3: Document the final package boundary**

`README.md` must state:

- main owns the only live WorkspaceState;
- `src/index.ts` is the only source entry;
- domain dependencies are runtime-neutral;
- shared IPC DTOs remain outside the package;
- `isDirty` is revision-derived;
- the string buffer is the reference implementation, with production persistent adapter owned by RF-201;
- no renderer or main-internal imports are allowed.

Add a decision-log row dated 2026-07-16 recording the hard cutover, saved checkpoint semantics, captured-revision save rule, real local package artifact, and RF-102/RF-201 deferrals.

- [ ] **Step 4: Write the execution handoff without claiming acceptance**

The handoff records:

- implementation commits;
- final public API and deleted files/symbols;
- focused command outputs/counts;
- runtime resolution evidence;
- full-gate outputs;
- known deferred risks;
- manual checks for open/edit/save/Save As/dirty close/move/detach;
- next required skills: architecture acceptance, then task acceptance.

Do not write `reports/task-summaries/RF-101.md` or a PASS verdict; acceptance owns both.

- [ ] **Step 5: Run full quality gates**

Run serially so logs and failures are attributable:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:editor-behavior
git diff --check
```

Expected:

- lint: zero errors; only already-recorded unrelated warnings may remain;
- typecheck: all renderer/electron/vitest/CLI/package checks pass;
- full Vitest: all files pass;
- build: renderer, workspace-domain, Electron, CLI pass and runtime verifier resolves the local package;
- formal behavior: zero unexpected and zero not-run targets;
- diff check: no whitespace errors.

If formal behavior exposes only a known RF-001 runner flake, collect repeat evidence and route it through acceptance; do not change editing behavior or calibration inside RF-101.

- [ ] **Step 6: Repeat zero-residue and worktree checks**

```powershell
rg -n -e "workspace-service" -e "createWorkspaceService" -e "WorkspaceTabSessionSnapshot" src packages package.json
rg -n -e "legacy" -e "compat" -e "fallback" packages/workspace-domain src/main/workspace-application.ts src/main/workspace-close-coordinator.ts
rg -n -e "packages/workspace-domain/src" -e "@fishmark/workspace-domain/" src packages
git status --short
```

Expected: no old service/type/deep-import matches and no compatibility implementation. Words in tests/docs are reviewed by context rather than hidden. Worktree contains only the intentional RF-101 docs/status changes after the final code commit.

- [ ] **Step 7: Mark implementation DEV_DONE and commit docs**

Only after Step 5 and Step 6 pass, change RF-101 from `IN_PROGRESS` to `DEV_DONE`, fill focused/full evidence and implementation commits, keep acceptance blank, and point the next skill to `$fishmark-architecture-acceptance`.

```powershell
git add packages/workspace-domain/README.md docs/decision-log.md docs/refactor/editor-foundation/progress.md docs/plans/2026-07-16-rf-101-handoff.md docs/superpowers/specs/2026-07-16-rf-101-workspace-domain-design.md docs/plans/2026-07-16-rf-101-intake.md docs/superpowers/plans/2026-07-16-rf-101-workspace-domain.md
git commit -m "docs: hand off RF-101 for acceptance"
```

## Task 6: Independent acceptance handoff

**Files:** Acceptance agents decide final documentation changes.

- [ ] **Step 1: Dispatch independent architecture acceptance**

Give the reviewer the base commit before Task 1 and the final implementation head. Require explicit review of domain purity, package runtime resolution, immutable ownership, revision/save semantics, IPC stability, and zero compatibility/dead code.

Expected result: `PASS` with zero blocking findings. Any blocking finding returns RF-101 to `$fishmark-task-execution` without starting formal task acceptance.

- [ ] **Step 2: Dispatch formal task acceptance only after architecture PASS**

The task acceptance agent reruns required gates, validates manual steps, updates `docs/test-report.md`, creates `reports/task-summaries/RF-101.md`, marks RF-101 `COMPLETE`, and records M1 as 1/2 with RF-102 next.

Expected result: formal `PASS`; program completion becomes 3/38. Do not start RF-102 in the same acceptance turn.

## Plan self-review checklist

- [x] Design coverage: every section of `2026-07-16-rf-101-workspace-domain-design.md` maps to Tasks 1–6.
- [x] Instruction completeness: every implementation step names concrete symbols, tests, commands, and expected outcomes.
- [x] Type consistency: `DocumentRevision`, `WorkspaceDocumentData`, `DocumentSessionProjection`, `WorkspaceState`, `CommitWorkspaceDocumentInput`, and projection method names are identical across tasks.
- [x] Deletion consistency: the old service/test are deleted in Task 4 and all later checks require zero matches.
- [x] Scope consistency: shared IPC/renderer behavior stays unchanged; RF-102 and RF-201 work remains deferred.
- [x] Runtime consistency: main resolves the built local package; Vite/Vitest source aliases are not mistaken for Electron runtime resolution.

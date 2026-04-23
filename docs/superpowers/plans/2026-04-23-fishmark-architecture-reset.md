# FishMark Architecture Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all six architecture review findings by converging workspace truth into `main`, shrinking the preload bridge to the real product contract, decomposing the renderer shell, and aligning docs/themes with the shipped tabbed-workspace system.

**Architecture:** Keep the existing Electron/React/TypeScript stack, but re-cut responsibilities around four boundaries: shared contracts, canonical `main` workspace/application state, thin preload bridges, and renderer presentation/controllers. This is a one-pass reset with no compatibility code: business-writable document state lives only in `main`, `window.fishmark` becomes product-only, test runtime gets its own bridge, and official docs/themes are updated to the same truth.

**Tech Stack:** Electron, React 19, TypeScript, CodeMirror 6, Vite, Vitest, CSS custom properties

---

## File Structure

### Shared contracts

- Modify: `src/shared/workspace.ts`
  - Add explicit command/result unions, canonical workspace projection types, and channel constants that `main`, `preload`, and `renderer` all consume.
- Modify: `src/shared/save-markdown-file.ts`
  - Remove renderer-supplied `content` from save IPC input types so canonical drafts are always read from `main`.
- Create: `src/shared/product-bridge.ts`
  - Define the product runtime bridge interface exposed as `window.fishmark`.
- Create: `src/shared/test-bridge.ts`
  - Define the test-only bridge interface exposed as `window.fishmarkTest`.

### Main runtime

- Modify: `src/main/workspace-service.ts`
  - Reduce to canonical workspace state storage and projection helpers only.
- Create: `src/main/workspace-application.ts`
  - Implement `OpenPath`, `CreateUntitledTab`, `UpdateDraft`, `SaveTab`, `ReloadTabFromDisk`, `CloseTab`, `MoveTab`, and related use cases.
- Modify: `src/main/workspace-close-coordinator.ts`
  - Read canonical drafts from the workspace application/service instead of renderer-provided content.
- Modify: `src/main/main.ts`
  - Wire IPC handlers through shared contracts and the workspace application layer.
- Modify: `src/main/external-file-watch-service.ts`
  - Feed external-change events into canonical session state.

### Preload and renderer

- Modify: `src/preload/preload.ts`
  - Expose a product-only `window.fishmark` and a separate `window.fishmarkTest`.
- Modify: `src/renderer/types.d.ts`
  - Import bridge interfaces from shared modules instead of re-declaring drifting signatures.
- Delete: `src/renderer/document-state.ts`
  - Remove duplicated business document state from renderer.
- Create: `src/renderer/editor/editor-shell-state.ts`
  - Hold shell-only UI state such as drawer/outline visibility, notifications, and local focus affordances.
- Create: `src/renderer/editor/useWorkspaceController.ts`
  - Coordinate projection subscription, tab commands, and active-editor draft updates.
- Create: `src/renderer/editor/useSaveController.ts`
  - Coordinate manual save/autosave from canonical projections.
- Create: `src/renderer/editor/useExternalConflictController.ts`
  - Coordinate external-change UI decisions as commands.
- Create: `src/renderer/editor/useThemeController.ts`
  - Isolate theme/runtime env orchestration from the shell.
- Create: `src/renderer/editor/useSettingsController.ts`
  - Isolate preferences/settings drawer orchestration from the shell.
- Create: `src/renderer/editor/WorkspaceShell.tsx`
  - Presentation-only shell that receives view props and command callbacks.
- Modify: `src/renderer/editor/App.tsx`
  - Become a thin composition root over controllers and presentation.
- Modify: `src/renderer/editor-test-driver.ts`
  - Use the test bridge and canonical projections rather than mutating renderer business state.
- Modify: `src/renderer/workbench/App.tsx`
  - Consume `window.fishmarkTest`.

### Tests, docs, and themes

- Create: `src/main/workspace-application.test.ts`
- Modify: `src/main/workspace-service.test.ts`
- Modify: `src/main/workspace-close-coordinator.test.ts`
- Modify: `src/preload/preload.test.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Create: `src/renderer/editor/useWorkspaceController.test.tsx`
- Create: `src/renderer/editor/useSaveController.test.tsx`
- Create: `src/renderer/editor/useExternalConflictController.test.tsx`
- Create: `src/renderer/editor/WorkspaceShell.test.tsx`
- Modify: `src/renderer/app.autosave.test.ts`
- Modify: `docs/design.md`
- Modify: `docs/progress.md`
- Modify: `docs/theme-authoring-guide.md`
- Modify: `fixtures/themes/rain-glass/styles/ui.css`
- Modify: `fixtures/themes/pearl-drift/styles/ui.css`
- Modify: `fixtures/themes/ember-ascend/styles/ui.css`

## Preflight

- [ ] **Step 1: Create a dedicated worktree for execution**

```bash
git worktree add ../Yulora-architecture-reset -b codex/architecture-reset
cd ../Yulora-architecture-reset
git status --short
```

Expected: a clean worktree on branch `codex/architecture-reset`.

- [ ] **Step 2: Re-read the approved design before touching code**

```bash
sed -n '1,260p' docs/superpowers/specs/2026-04-23-fishmark-architecture-reset-design.md
```

Expected: the implementation session starts from the approved A -> C -> B -> D sequencing, not from ad-hoc edits.

### Task 1: Lock the shared workspace contract and bridge boundaries

**Files:**
- Create: `src/shared/product-bridge.ts`
- Create: `src/shared/test-bridge.ts`
- Modify: `src/shared/workspace.ts`
- Modify: `src/shared/save-markdown-file.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/preload/preload.test.ts`
- Modify: `src/renderer/types.d.ts`

- [ ] **Step 1: Add failing contract tests for explicit workspace results and split bridges**

```ts
// src/preload/preload.contract.test.ts
import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";
import type {
  OpenWorkspaceFileResult,
  OpenWorkspaceFileFromPathResult
} from "../shared/workspace";

it("aligns renderer globals to the shared product and test bridges", () => {
  type TypeEquals<A, B> = A extends B ? (B extends A ? true : never) : never;

  const productBridgeContract: TypeEquals<Window["fishmark"], ProductBridge> = true;
  const testBridgeContract: TypeEquals<Window["fishmarkTest"], TestBridge> = true;

  void productBridgeContract;
  void testBridgeContract;
});

it("treats workspace open APIs as explicit result unions", () => {
  const openResult: OpenWorkspaceFileResult = {
    kind: "error",
    error: { code: "read-failed", message: "boom" }
  };
  const openFromPathResult: OpenWorkspaceFileFromPathResult = {
    kind: "success",
    snapshot: {
      windowId: "window-1",
      activeTabId: null,
      tabs: [],
      activeDocument: null
    }
  };

  expect(openResult.kind).toBe("error");
  expect(openFromPathResult.kind).toBe("success");
});
```

- [ ] **Step 2: Run the preload contract tests to verify they fail**

Run: `npm run test -- src/preload/preload.contract.test.ts src/preload/preload.test.ts`
Expected: FAIL because `ProductBridge`, `TestBridge`, and the `kind`-based workspace result unions do not exist yet.

- [ ] **Step 3: Add shared bridge interfaces and explicit workspace result unions**

```ts
// src/shared/workspace.ts
import type { OpenMarkdownFileErrorCode, OpenMarkdownDocument } from "./open-markdown-file";

export type WorkspaceResultError = {
  code: OpenMarkdownFileErrorCode | "unknown-window" | "unknown-tab";
  message: string;
};

export type WorkspaceCommandSuccess<TSnapshot> = {
  kind: "success";
  snapshot: TSnapshot;
};

export type WorkspaceCommandCancelled = {
  kind: "cancelled";
};

export type WorkspaceCommandError = {
  kind: "error";
  error: WorkspaceResultError;
};

export type OpenWorkspaceFileResult =
  | WorkspaceCommandSuccess<WorkspaceWindowSnapshot>
  | WorkspaceCommandCancelled
  | WorkspaceCommandError;

export type OpenWorkspaceFileFromPathResult =
  | WorkspaceCommandSuccess<WorkspaceWindowSnapshot>
  | WorkspaceCommandError;
```

```ts
// src/shared/save-markdown-file.ts
export type SaveMarkdownFileInput = {
  tabId: string;
  path: string;
};

export type SaveMarkdownFileAsInput = {
  tabId: string;
  currentPath: string | null;
};
```

```ts
// src/shared/product-bridge.ts
import type { SaveMarkdownFileAsInput, SaveMarkdownFileInput, SaveMarkdownFileResult } from "./save-markdown-file";
import type {
  ActivateWorkspaceTabInput,
  CloseWorkspaceTabInput,
  CreateWorkspaceTabInput,
  DetachWorkspaceTabToNewWindowInput,
  MoveWorkspaceTabToWindowInput,
  OpenWorkspaceFileFromPathResult,
  OpenWorkspaceFileResult,
  ReloadWorkspaceTabFromPathInput,
  ReorderWorkspaceTabInput,
  UpdateWorkspaceTabDraftInput,
  WorkspaceMoveTabResult,
  WorkspaceWindowSnapshot
} from "./workspace";

export interface ProductBridge {
  getWorkspaceSnapshot: () => Promise<WorkspaceWindowSnapshot>;
  createWorkspaceTab: (input: CreateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  openWorkspaceFile: () => Promise<OpenWorkspaceFileResult>;
  openWorkspaceFileFromPath: (targetPath: string) => Promise<OpenWorkspaceFileFromPathResult>;
  activateWorkspaceTab: (input: ActivateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  closeWorkspaceTab: (input: CloseWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  reorderWorkspaceTab: (input: ReorderWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  moveWorkspaceTabToWindow: (input: MoveWorkspaceTabToWindowInput) => Promise<WorkspaceMoveTabResult>;
  detachWorkspaceTabToNewWindow: (input: DetachWorkspaceTabToNewWindowInput) => Promise<WorkspaceWindowSnapshot>;
  updateWorkspaceTabDraft: (input: UpdateWorkspaceTabDraftInput) => Promise<WorkspaceWindowSnapshot>;
  reloadWorkspaceTabFromPath: (input: ReloadWorkspaceTabFromPathInput) => Promise<WorkspaceWindowSnapshot>;
  saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
  saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
}
```

```ts
// src/shared/test-bridge.ts
import type { EditorTestCommandEnvelope, EditorTestCommandResultEnvelope } from "./editor-test-command";
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "./test-run-session";

export interface TestBridge {
  openEditorTestWindow: () => Promise<void>;
  startScenarioRun: (input: { scenarioId: string }) => Promise<{ runId: string }>;
  interruptScenarioRun: (input: { runId: string }) => Promise<void>;
  onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => () => void;
  onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => () => void;
  onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => () => void;
  completeEditorTestCommand: (payload: EditorTestCommandResultEnvelope) => Promise<void>;
}
```

- [ ] **Step 4: Update preload tests and renderer globals to consume the shared bridge interfaces**

```ts
// src/renderer/types.d.ts
import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";

declare global {
  interface Window {
    fishmark: ProductBridge;
    fishmarkTest: TestBridge;
  }
}
```

```ts
// src/preload/preload.test.ts
expect(api).toMatchObject({
  openWorkspaceFile: expect.any(Function),
  openWorkspaceFileFromPath: expect.any(Function)
});
expect(api).not.toHaveProperty("startScenarioRun");
expect(api).not.toHaveProperty("onEditorTestCommand");
expect(globalThis.window).toHaveProperty("fishmarkTest");
```

- [ ] **Step 5: Run the shared/preload tests to verify they pass**

Run: `npm run test -- src/preload/preload.contract.test.ts src/preload/preload.test.ts`
Expected: PASS with renderer globals typed from shared bridge modules and explicit workspace result unions available.

- [ ] **Step 6: Commit the contract baseline**

```bash
git add src/shared/workspace.ts src/shared/save-markdown-file.ts src/shared/product-bridge.ts src/shared/test-bridge.ts src/preload/preload.contract.test.ts src/preload/preload.test.ts src/renderer/types.d.ts
git commit -m "refactor: lock workspace contracts and split bridge types"
```

### Task 2: Converge workspace truth into canonical main-side state

**Files:**
- Create: `src/main/workspace-application.ts`
- Create: `src/main/workspace-application.test.ts`
- Modify: `src/main/workspace-service.ts`
- Modify: `src/main/workspace-service.test.ts`
- Modify: `src/main/workspace-close-coordinator.ts`
- Modify: `src/main/workspace-close-coordinator.test.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add failing main tests that prove save/close flows read the canonical draft from `main`**

```ts
// src/main/workspace-application.test.ts
import { createWorkspaceApplication } from "./workspace-application";
import { createWorkspaceService } from "./workspace-service";

it("saves the canonical draft even when the renderer payload is stale", async () => {
  const workspace = createWorkspaceService();
  workspace.registerWindow("window-1");
  const snapshot = workspace.createUntitledTab("window-1");
  const tabId = snapshot.activeTabId!;

  workspace.updateTabDraft(tabId, "# Canonical\n");

  const writes: string[] = [];
  const application = createWorkspaceApplication({
    workspace,
    saveMarkdownFileToPath: async ({ content, path }) => {
      writes.push(`${path}:${content}`);
      return {
        status: "success",
        document: { path, name: "note.md", content, encoding: "utf-8" }
      };
    }
  });

  await application.saveTab({
    tabId,
    path: "C:/notes/note.md"
  });

  expect(writes).toEqual(["C:/notes/note.md:# Canonical\n"]);
});
```

```ts
// src/main/workspace-close-coordinator.test.ts
it("prompts and saves against the canonical tab session content", async () => {
  const workspace = createWorkspaceService();
  workspace.registerWindow("window-1");
  const snapshot = workspace.createUntitledTab("window-1");
  const tabId = snapshot.activeTabId!;

  workspace.updateTabDraft(tabId, "# Dirty from main\n");

  const saveMarkdownFileToPath = vi.fn(async (input) => ({
    status: "success",
    document: { path: input.path, name: "note.md", content: input.content, encoding: "utf-8" }
  }));

  const coordinator = createWorkspaceCloseCoordinator({
    workspaceService: workspace,
    promptToSaveWorkspaceTab: async () => "save",
    saveMarkdownFileToPath,
    showSaveMarkdownDialog: vi.fn()
  });

  await coordinator.closeTab(tabId);

  expect(saveMarkdownFileToPath).toHaveBeenCalledWith({
    tabId,
    path: expect.any(String),
    content: "# Dirty from main\n"
  });
});
```

- [ ] **Step 2: Run the main workspace tests to verify they fail**

Run: `npm run test -- src/main/workspace-service.test.ts src/main/workspace-close-coordinator.test.ts src/main/workspace-application.test.ts`
Expected: FAIL because `workspace-application.ts` does not exist yet and current save logic still accepts renderer-supplied content.

- [ ] **Step 3: Introduce a workspace application layer and strip renderer-owned save truth out of IPC**

```ts
// src/main/workspace-application.ts
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type { WorkspaceWindowSnapshot } from "../shared/workspace";
import type { WorkspaceTabSessionSnapshot } from "./workspace-service";

type WorkspaceApplicationDependencies = {
  workspace: {
    getWindowSnapshot: (windowId: string) => WorkspaceWindowSnapshot;
    getTabSession: (tabId: string) => WorkspaceTabSessionSnapshot;
    updateTabDraft: (tabId: string, content: string) => WorkspaceWindowSnapshot;
    saveTabDocument: (tabId: string, document: SaveMarkdownFileResult extends { status: "success"; document: infer T } ? T : never) => WorkspaceWindowSnapshot;
  };
  saveMarkdownFileToPath: (input: { tabId: string; path: string; content: string }) => Promise<SaveMarkdownFileResult>;
};

export function createWorkspaceApplication(dependencies: WorkspaceApplicationDependencies) {
  return {
    updateDraft(input: { tabId: string; content: string }): WorkspaceWindowSnapshot {
      return dependencies.workspace.updateTabDraft(input.tabId, input.content);
    },
    async saveTab(input: { tabId: string; path: string }): Promise<SaveMarkdownFileResult> {
      const tab = dependencies.workspace.getTabSession(input.tabId);
      const result = await dependencies.saveMarkdownFileToPath({
        tabId: input.tabId,
        path: input.path,
        content: tab.content
      });

      if (result.status === "success") {
        dependencies.workspace.saveTabDocument(input.tabId, result.document);
      }

      return result;
    }
  };
}
```

```ts
// src/main/main.ts
const workspaceApplication = createWorkspaceApplication({
  workspace: workspaceService,
  saveMarkdownFileToPath
});

ipcMain.handle(SAVE_MARKDOWN_FILE_CHANNEL, async (_event, input: { tabId: string; path: string }) => {
  return workspaceApplication.saveTab(input);
});
```

- [ ] **Step 4: Make `workspace-service.ts` a canonical state store only**

```ts
// src/main/workspace-service.ts
export type WorkspaceTabSessionSnapshot = {
  tabId: string;
  windowId: string;
  path: string | null;
  name: string;
  content: string;
  lastSavedContent: string;
  encoding: "utf-8";
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

function updateTabDraft(tabId: string, content: string): WorkspaceWindowSnapshot {
  const tab = getTab(tabId);
  tab.draftContent = content;
  tab.isDirty = content !== tab.lastSavedContent;
  return getWindowSnapshot(getWindowIdForTab(tabId));
}

function saveTabDocument(tabId: string, document: OpenMarkdownDocument): WorkspaceWindowSnapshot {
  const tab = getTab(tabId);
  tab.path = document.path;
  tab.name = document.name;
  tab.draftContent = document.content;
  tab.lastSavedContent = document.content;
  tab.isDirty = false;
  tab.saveState = "idle";
  return getWindowSnapshot(getWindowIdForTab(tabId));
}
```

- [ ] **Step 5: Run the main workspace tests to verify canonical ownership now passes**

Run: `npm run test -- src/main/workspace-service.test.ts src/main/workspace-close-coordinator.test.ts src/main/workspace-application.test.ts src/main/main.test.ts`
Expected: PASS with save and close flows reading canonical drafts from `main`.

- [ ] **Step 6: Commit the canonical workspace reset**

```bash
git add src/main/workspace-application.ts src/main/workspace-application.test.ts src/main/workspace-service.ts src/main/workspace-service.test.ts src/main/workspace-close-coordinator.ts src/main/workspace-close-coordinator.test.ts src/main/main.ts
git commit -m "refactor: converge workspace truth in main"
```

### Task 3: Shrink preload to the real product bridge and isolate the test runtime

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/preload/preload.test.ts`
- Modify: `src/renderer/workbench/App.tsx`
- Modify: `src/renderer/test-workbench.test.tsx`
- Modify: `src/renderer/editor-test-driver.ts`
- Modify: `src/main/main.ts`

- [x] **Step 1: Add failing tests that require `window.fishmark` to be product-only**

```ts
// src/preload/preload.test.ts
it("keeps scenario and editor-test controls off the product bridge", async () => {
  const api = await loadApi();

  expect(api).not.toHaveProperty("openEditorTestWindow");
  expect(api).not.toHaveProperty("startScenarioRun");
  expect(api).not.toHaveProperty("onEditorTestCommand");
});

it("exposes the test-only controls on window.fishmarkTest", async () => {
  const api = await loadApi();

  expect(globalThis.window).toHaveProperty("fishmarkTest");
  expect((window as Window).fishmarkTest.startScenarioRun).toEqual(expect.any(Function));
});
```

- [x] **Step 2: Run the preload/workbench tests to verify they fail**

Run: `npm run test -- src/preload/preload.test.ts src/preload/preload.contract.test.ts`
Expected: FAIL because `preload.ts` still exposes test controls on `window.fishmark`.

- [x] **Step 3: Expose separate product and test bridges in preload**

```ts
// src/preload/preload.ts
import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";

const productBridge: ProductBridge = {
  getWorkspaceSnapshot: () => ipcRenderer.invoke(GET_WORKSPACE_SNAPSHOT_CHANNEL),
  createWorkspaceTab: (input) => ipcRenderer.invoke(CREATE_WORKSPACE_TAB_CHANNEL, input),
  openWorkspaceFile: () => ipcRenderer.invoke(OPEN_WORKSPACE_FILE_CHANNEL),
  openWorkspaceFileFromPath: (targetPath) =>
    ipcRenderer.invoke(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, { targetPath }),
  saveMarkdownFile: (input) => ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input) => ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input)
};

const testBridge: TestBridge = {
  openEditorTestWindow: () => ipcRenderer.invoke(OPEN_EDITOR_TEST_WINDOW_CHANNEL),
  startScenarioRun: (input) => ipcRenderer.invoke(START_SCENARIO_RUN_CHANNEL, input),
  interruptScenarioRun: (input) => ipcRenderer.invoke(INTERRUPT_SCENARIO_RUN_CHANNEL, input),
  onScenarioRunEvent: (listener) => attachIpcListener(SCENARIO_RUN_EVENT, listener),
  onScenarioRunTerminal: (listener) => attachIpcListener(SCENARIO_RUN_TERMINAL_EVENT, listener),
  onEditorTestCommand: (listener) => attachIpcListener(EDITOR_TEST_COMMAND_EVENT, listener),
  completeEditorTestCommand: (payload) =>
    ipcRenderer.invoke(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, payload)
};

contextBridge.exposeInMainWorld("fishmark", productBridge);
contextBridge.exposeInMainWorld("fishmarkTest", testBridge);
```

- [x] **Step 4: Move workbench and editor-test driver code to `window.fishmarkTest`**

```ts
// src/renderer/workbench/App.tsx
const hasBridge = Boolean(window.fishmarkTest);

const detachEvent = window.fishmarkTest.onScenarioRunEvent((payload) => {
  // unchanged event handling
});

const { runId } = await window.fishmarkTest.startScenarioRun({ scenarioId: selectedScenario.id });
```

```ts
// src/main/main.ts
ipcMain.handle(START_SCENARIO_RUN_CHANNEL, async (_event, input: { scenarioId: string }) =>
  testRunSessions.startScenarioRun(input)
);
ipcMain.handle(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, async (_event, payload) =>
  editorTestSessions.completeCommand(payload)
);
```

- [x] **Step 5: Run the preload and workbench tests to verify bridge isolation passes**

Run: `npm run test -- src/preload/preload.test.ts src/preload/preload.contract.test.ts src/renderer/test-workbench.test.tsx src/renderer/editor-test-driver.test.ts`
Expected: PASS with product/test bridge responsibilities separated.

- [x] **Step 6: Commit the preload/test bridge split**

```bash
git add src/preload/preload.ts src/preload/preload.contract.test.ts src/preload/preload.test.ts src/renderer/workbench/App.tsx src/renderer/test-workbench.test.tsx src/renderer/editor-test-driver.ts src/main/main.ts
git commit -m "refactor: split product and test preload bridges"
```

### Task 4: Decompose renderer workflow orchestration into controllers

**Files:**
- Delete: `src/renderer/document-state.ts`
- Create: `src/renderer/editor/editor-shell-state.ts`
- Create: `src/renderer/editor/useWorkspaceController.ts`
- Create: `src/renderer/editor/useWorkspaceController.test.tsx`
- Create: `src/renderer/editor/useSaveController.ts`
- Create: `src/renderer/editor/useSaveController.test.tsx`
- Create: `src/renderer/editor/useExternalConflictController.ts`
- Create: `src/renderer/editor/useExternalConflictController.test.tsx`
- Modify: `src/renderer/editor/App.tsx`

- [ ] **Step 1: Add failing controller tests for workspace projection, canonical saves, and external conflict commands**

```tsx
// src/renderer/editor/useWorkspaceController.test.tsx
// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

it("updates the active editor by sending UpdateDraft commands instead of mutating local business state", async () => {
  const updateWorkspaceTabDraft = vi.fn().mockResolvedValue({
    windowId: "window-1",
    activeTabId: "tab-1",
    tabs: [{ tabId: "tab-1", path: "C:/note.md", name: "note.md", isDirty: true, saveState: "idle" }],
    activeDocument: {
      tabId: "tab-1",
      path: "C:/note.md",
      name: "note.md",
      content: "# Updated\n",
      encoding: "utf-8",
      isDirty: true,
      saveState: "idle"
    }
  });

  const fishmark = {
    updateWorkspaceTabDraft
  } as unknown as Window["fishmark"];

  const latest: { current: ReturnType<typeof useWorkspaceController> | null } = { current: null };
  const container = document.createElement("div");
  const root: Root = createRoot(container);

  function ControllerProbe() {
    latest.current = useWorkspaceController(fishmark, {
      initialSnapshot: {
        windowId: "window-1",
        activeTabId: "tab-1",
        tabs: [{ tabId: "tab-1", path: "C:/note.md", name: "note.md", isDirty: false, saveState: "idle" }],
        activeDocument: {
          tabId: "tab-1",
          path: "C:/note.md",
          name: "note.md",
          content: "# Note\n",
          encoding: "utf-8",
          isDirty: false,
          saveState: "idle"
        }
      }
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(ControllerProbe));
  });

  await act(async () => {
    await latest.current?.updateDraft("# Updated\n");
  });

  expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
    tabId: "tab-1",
    content: "# Updated\n"
  });
});
```

```tsx
// src/renderer/editor/useSaveController.test.tsx
// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

it("runs autosave from canonical projection state and not from a stale renderer cache", async () => {
  const saveMarkdownFile = vi.fn().mockResolvedValue({
    status: "success",
    document: { path: "C:/note.md", name: "note.md", content: "# Canonical\n", encoding: "utf-8" }
  });

  const fishmark = {
    saveMarkdownFile
  } as unknown as Window["fishmark"];

  const latest: { current: ReturnType<typeof useSaveController> | null } = { current: null };
  const container = document.createElement("div");
  const root: Root = createRoot(container);

  function ControllerProbe() {
    latest.current = useSaveController(fishmark, {
      activeDocument: {
        tabId: "tab-1",
        path: "C:/note.md",
        name: "note.md",
        content: "# Canonical\n",
        encoding: "utf-8",
        isDirty: true,
        saveState: "idle"
      },
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(ControllerProbe));
  });

  await act(async () => {
    await latest.current?.runManualSave();
  });

  expect(saveMarkdownFile).toHaveBeenCalledWith({
    tabId: "tab-1",
    path: "C:/note.md"
  });
});
```

- [ ] **Step 2: Run the new renderer controller tests to verify they fail**

Run: `npm run test -- src/renderer/editor/useWorkspaceController.test.tsx src/renderer/editor/useSaveController.test.tsx src/renderer/editor/useExternalConflictController.test.tsx`
Expected: FAIL because the hooks and shell-state module do not exist yet.

- [ ] **Step 3: Create shell-only state and controller hooks**

```ts
// src/renderer/editor/editor-shell-state.ts
export type EditorShellState = {
  shellMode: "reading" | "editing";
  isOutlineOpen: boolean;
  isOutlineClosing: boolean;
  isSettingsOpen: boolean;
  isSettingsClosing: boolean;
  notification: { kind: "info" | "warning" | "error"; message: string } | null;
};

export function createInitialEditorShellState(): EditorShellState {
  return {
    shellMode: "reading",
    isOutlineOpen: false,
    isOutlineClosing: false,
    isSettingsOpen: false,
    isSettingsClosing: false,
    notification: null
  };
}

export function useEditorShellState() {
  const [state, setState] = useState(createInitialEditorShellState);
  return { state, setState };
}
```

```ts
// src/renderer/editor/useWorkspaceController.ts
export function useWorkspaceController(
  fishmark: Window["fishmark"],
  options: { initialSnapshot?: WorkspaceWindowSnapshot | null } = {}
) {
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceWindowSnapshot | null>(
    options.initialSnapshot ?? null
  );

  async function updateDraft(content: string): Promise<void> {
    if (!workspaceSnapshot?.activeTabId) {
      return;
    }
    const snapshot = await fishmark.updateWorkspaceTabDraft({
      tabId: workspaceSnapshot.activeTabId,
      content
    });
    setWorkspaceSnapshot(snapshot);
  }

  async function activateTab(tabId: string): Promise<void> {
    const snapshot = await fishmark.activateWorkspaceTab({ tabId });
    setWorkspaceSnapshot(snapshot);
  }

  return { workspaceSnapshot, updateDraft, activateTab };
}
```

```ts
// src/renderer/editor/useSaveController.ts
export function useSaveController(fishmark: Window["fishmark"], input: {
  activeDocument: WorkspaceWindowSnapshot["activeDocument"];
  autosaveDelayMs: number;
  showNotification: (notification: { kind: "error"; message: string }) => void;
}) {
  async function runManualSave(): Promise<void> {
    if (!input.activeDocument?.path) {
      return;
    }
    const result = await fishmark.saveMarkdownFile({
      tabId: input.activeDocument.tabId,
      path: input.activeDocument.path
    });
    if (result.status === "error") {
      input.showNotification({ kind: "error", message: result.error.message });
    }
  }

  return { runManualSave };
}
```

```ts
// src/renderer/editor/useExternalConflictController.ts
export function useExternalConflictController(fishmark: Window["fishmark"], input: {
  activeDocument: WorkspaceWindowSnapshot["activeDocument"];
  showNotification: (notification: { kind: "error"; message: string }) => void;
}) {
  async function reloadFromDisk(): Promise<void> {
    if (!input.activeDocument?.path) {
      return;
    }

    try {
      await fishmark.reloadWorkspaceTabFromPath({
        tabId: input.activeDocument.tabId,
        targetPath: input.activeDocument.path
      });
    } catch (error) {
      input.showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { reloadFromDisk };
}
```

- [ ] **Step 4: Rewrite `App.tsx` to compose controllers instead of owning business workflows**

```tsx
// src/renderer/editor/App.tsx
import { useEditorShellState } from "./editor-shell-state";
import { useWorkspaceController } from "./useWorkspaceController";
import { useSaveController } from "./useSaveController";
import { useExternalConflictController } from "./useExternalConflictController";

function EditorShell({ fishmark }: { fishmark: Window["fishmark"] }) {
  const { state: shellState } = useEditorShellState();
  const workspace = useWorkspaceController(fishmark);
  const save = useSaveController(fishmark, {
    activeDocument: workspace.workspaceSnapshot?.activeDocument ?? null,
    autosaveDelayMs: preferences.autosave.idleDelayMs,
    showNotification
  });
  const externalConflict = useExternalConflictController(fishmark, {
    activeDocument: workspace.workspaceSnapshot?.activeDocument ?? null,
    showNotification
  });

  return (
    <WorkspaceShell
      workspaceSnapshot={workspace.workspaceSnapshot}
      onTabActivate={workspace.activateTab}
      onDraftChange={workspace.updateDraft}
      onSave={save.runManualSave}
      onReloadExternalFile={externalConflict.reloadFromDisk}
    />
  );
}
```

- [ ] **Step 5: Run the new controller tests and focused renderer integration tests**

Run: `npm run test -- src/renderer/editor/useWorkspaceController.test.tsx src/renderer/editor/useSaveController.test.tsx src/renderer/editor/useExternalConflictController.test.tsx src/renderer/editor/App.focus.test.tsx`
Expected: PASS with renderer no longer maintaining a second business document store.

- [ ] **Step 6: Commit the renderer controller extraction**

```bash
git add src/renderer/editor/editor-shell-state.ts src/renderer/editor/useWorkspaceController.ts src/renderer/editor/useWorkspaceController.test.tsx src/renderer/editor/useSaveController.ts src/renderer/editor/useSaveController.test.tsx src/renderer/editor/useExternalConflictController.ts src/renderer/editor/useExternalConflictController.test.tsx src/renderer/editor/App.tsx
git rm src/renderer/document-state.ts
git commit -m "refactor: move renderer orchestration into controllers"
```

### Task 5: Reduce `App.tsx` to composition and move shell UI into presentation components

**Files:**
- Create: `src/renderer/editor/WorkspaceShell.tsx`
- Create: `src/renderer/editor/WorkspaceShell.test.tsx`
- Create: `src/renderer/editor/useThemeController.ts`
- Create: `src/renderer/editor/useSettingsController.ts`
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Add a failing presentation test that treats `WorkspaceShell` as a pure view**

```tsx
// src/renderer/editor/WorkspaceShell.test.tsx
// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

it("renders workspace tabs and delegates commands without owning persistence logic", async () => {
  const onSave = vi.fn();
  const onTabActivate = vi.fn();
  const container = document.createElement("div");
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [{ tabId: "tab-1", path: "C:/note.md", name: "note.md", isDirty: true, saveState: "idle" }],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "# Note\n",
            encoding: "utf-8",
            isDirty: true,
            saveState: "idle"
          }
        },
        onSave,
        onTabActivate,
        onDraftChange: vi.fn(),
        onReloadExternalFile: vi.fn()
      })
    );
  });

  const saveButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Save"
  );

  await act(async () => {
    saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onSave).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the presentation test to verify it fails**

Run: `npm run test -- src/renderer/editor/WorkspaceShell.test.tsx`
Expected: FAIL because `WorkspaceShell.tsx` does not exist yet.

- [ ] **Step 3: Create presentation-only shell components and theme/settings controllers**

```tsx
// src/renderer/editor/WorkspaceShell.tsx
export function WorkspaceShell(props: {
  workspaceSnapshot: WorkspaceWindowSnapshot | null;
  isSettingsOpen?: boolean;
  onTabActivate: (tabId: string) => void;
  onDraftChange: (content: string) => void;
  onSave: () => void;
  onReloadExternalFile: () => void;
}) {
  return (
    <main className="workspace-shell" data-fishmark-settings-open={props.isSettingsOpen ? "true" : "false"}>
      <header data-fishmark-surface="workspace-header">
        {props.workspaceSnapshot?.tabs.map((tab) => (
          <button key={tab.tabId} onClick={() => props.onTabActivate(tab.tabId)} type="button">
            {tab.name}
          </button>
        ))}
        <button onClick={props.onSave} type="button">
          Save
        </button>
      </header>
      <section data-fishmark-surface="workspace-document">
        <CodeEditorView
          content={props.workspaceSnapshot?.activeDocument?.content ?? ""}
          onContentChange={props.onDraftChange}
        />
      </section>
    </main>
  );
}
```

```ts
// src/renderer/editor/useThemeController.ts
export function useThemeController(input: {
  preferences: Preferences;
  themePackages: ThemePackageEntry[];
  currentDocumentWordCount: number;
  isReadingMode: boolean;
}) {
  const resolvedThemeMode = input.preferences.theme.mode === "system" ? resolveThemeMode("system") : input.preferences.theme.mode;
  const themeRuntimeEnv = buildThemeRuntimeEnv({
    wordCount: input.currentDocumentWordCount,
    isReadingMode: input.isReadingMode,
    themeMode: resolvedThemeMode,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  });

  return { resolvedThemeMode, themeRuntimeEnv };
}
```

```ts
// src/renderer/editor/useSettingsController.ts
export function useSettingsController() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);

  function openSettings(): void {
    setIsSettingsClosing(false);
    setIsSettingsOpen(true);
  }

  function closeSettings(): void {
    setIsSettingsOpen(false);
    setIsSettingsClosing(true);
  }

  return {
    isSettingsOpen,
    isSettingsClosing,
    openSettings,
    closeSettings
  };
}
```

- [ ] **Step 4: Collapse `App.tsx` into a composition root and trim `app.autosave.test.ts`**

```tsx
// src/renderer/editor/App.tsx
import { useEditorShellState } from "./editor-shell-state";
import { useSettingsController } from "./useSettingsController";
import { useWorkspaceController } from "./useWorkspaceController";
import { useThemeController } from "./useThemeController";
import { useSaveController } from "./useSaveController";
import { useExternalConflictController } from "./useExternalConflictController";

export default function EditorApp() {
  if (!window.fishmark) {
    return <BridgeUnavailableApp />;
  }

  return <EditorShell fishmark={window.fishmark} />;
}

function EditorShell({ fishmark }: { fishmark: Window["fishmark"] }) {
  const { state: shellState } = useEditorShellState();
  const settings = useSettingsController();
  const workspace = useWorkspaceController(fishmark);
  const save = useSaveController(fishmark, {
    activeDocument: workspace.workspaceSnapshot?.activeDocument ?? null,
    autosaveDelayMs: preferences.autosave.idleDelayMs,
    showNotification
  });
  const externalConflict = useExternalConflictController(fishmark, {
    activeDocument: workspace.workspaceSnapshot?.activeDocument ?? null,
    showNotification
  });
  const theme = useThemeController({
    preferences,
    themePackages,
    currentDocumentWordCount,
    isReadingMode: shellState.shellMode === "reading"
  });

  return (
    <WorkspaceShell
      workspaceSnapshot={workspace.workspaceSnapshot}
      isSettingsOpen={settings.isSettingsOpen}
      onTabActivate={workspace.activateTab}
      onDraftChange={workspace.updateDraft}
      onSave={save.runManualSave}
      onReloadExternalFile={externalConflict.reloadFromDisk}
    />
  );
}
```

```ts
// src/renderer/app.autosave.test.ts
it("delegates autosave to useSaveController", async () => {
  const saveMarkdownFile = vi.fn().mockResolvedValue({
    status: "success",
    document: {
      path: "C:/note.md",
      name: "note.md",
      content: "# Canonical\n",
      encoding: "utf-8"
    }
  });

  vi.useFakeTimers();
  window.fishmark.saveMarkdownFile = saveMarkdownFile;

  async function renderEditorShellWithSnapshot(snapshot: WorkspaceWindowSnapshot): Promise<void> {
    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    window.fishmark.getWorkspaceSnapshot = vi.fn().mockResolvedValue(snapshot);
  }

  await renderEditorShellWithSnapshot({
    windowId: "window-1",
    activeTabId: "tab-1",
    tabs: [{ tabId: "tab-1", path: "C:/note.md", name: "note.md", isDirty: true, saveState: "idle" }],
    activeDocument: {
      tabId: "tab-1",
      path: "C:/note.md",
      name: "note.md",
      content: "# Canonical\n",
      encoding: "utf-8",
      isDirty: true,
      saveState: "idle"
    }
  });

  await act(async () => {
    vi.advanceTimersByTime(DEFAULT_PREFERENCES.autosave.idleDelayMs);
    await Promise.resolve();
  });

  expect(saveMarkdownFile).toHaveBeenCalledWith({
    tabId: "tab-1",
    path: "C:/note.md"
  });
});
```

- [ ] **Step 5: Run the presentation/controller test set and make sure the shell stays green**

Run: `npm run test -- src/renderer/editor/WorkspaceShell.test.tsx src/renderer/editor/App.focus.test.tsx src/renderer/app.autosave.test.ts`
Expected: PASS with `App.tsx` reduced to composition and focused integration coverage still intact.

- [ ] **Step 6: Commit the shell decomposition**

```bash
git add src/renderer/editor/WorkspaceShell.tsx src/renderer/editor/WorkspaceShell.test.tsx src/renderer/editor/useThemeController.ts src/renderer/editor/useSettingsController.ts src/renderer/editor/App.tsx src/renderer/app.autosave.test.ts
git commit -m "refactor: slim editor app into composition shell"
```

### Task 6: Align public docs and theme contract to the new system truth

**Files:**
- Modify: `docs/design.md`
- Modify: `docs/progress.md`
- Modify: `docs/theme-authoring-guide.md`
- Modify: `fixtures/themes/rain-glass/styles/ui.css`
- Modify: `fixtures/themes/pearl-drift/styles/ui.css`
- Modify: `fixtures/themes/ember-ascend/styles/ui.css`
- Modify: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Add failing assertions that official theme fixtures target public surfaces instead of private selectors**

```ts
// src/renderer/app.autosave.test.ts
it("keeps bundled themes on public fishmark surface hooks instead of shell-private selectors", () => {
  for (const stylesheet of bundledThemeUiStylesheets) {
    expect(stylesheet).not.toContain(".workspace-header");
    expect(stylesheet).not.toContain(".settings-shell");
    expect(stylesheet).not.toContain(".app-titlebar");
    expect(stylesheet).toContain('[data-fishmark-surface="workspace-header"]');
  }
});
```

- [ ] **Step 2: Run the theme/doc-facing test to verify it fails**

Run: `npm run test -- src/renderer/app.autosave.test.ts`
Expected: FAIL because the current fixture themes still target private shell selectors.

- [ ] **Step 3: Rewrite docs and theme fixtures to the current public truth**

```md
<!-- docs/design.md -->
## Product baseline

FishMark 当前基线是单窗口多标签页工作区，而不是单文档窗口。

当前已交付能力：
- 多标签打开、切换、关闭、拖拽排序
- 标签拖出为新窗口
- 工作区级保存、自动保存、外部文件变更处理

Deferred scope:
- crash recovery
- workspace session restore
```

```css
/* fixtures/themes/rain-glass/styles/ui.css */
[data-fishmark-surface="workspace-header"] {
  background: color-mix(in srgb, var(--fishmark-panel-bg) 82%, transparent);
  border-bottom: 1px solid var(--fishmark-panel-border);
}

[data-fishmark-surface="settings-drawer"] {
  box-shadow: var(--fishmark-panel-shadow);
}

[data-fishmark-surface="titlebar"] {
  background: var(--fishmark-titlebar-bg);
}
```

```md
<!-- docs/theme-authoring-guide.md -->
- 主题可以依赖 `data-fishmark-surface="workspace-header"`、`data-fishmark-surface="settings-drawer"` 这类公开 surface hook。
- 主题不能依赖 `.workspace-header`、`.settings-shell`、`.app-titlebar` 这类实现 class。
```

- [ ] **Step 4: Run the theme-facing tests and one full documentation sanity pass**

Run: `npm run test -- src/renderer/app.autosave.test.ts src/renderer/theme-package-runtime.test.ts`
Expected: PASS with bundled theme fixtures using public surfaces only.

Run: `rg -n "\\.workspace-header|\\.settings-shell|\\.app-titlebar" docs fixtures/themes src/renderer/theme-packages`
Expected: no matches in docs and shipped theme fixtures except renderer-owned implementation code.

- [ ] **Step 5: Commit the public truth cleanup**

```bash
git add docs/design.md docs/progress.md docs/theme-authoring-guide.md fixtures/themes/rain-glass/styles/ui.css fixtures/themes/pearl-drift/styles/ui.css fixtures/themes/ember-ascend/styles/ui.css src/renderer/app.autosave.test.ts
git commit -m "docs: align public truth with architecture reset"
```

### Task 7: Run the full verification pass and write the handoff summary

**Files:**
- Modify: `docs/progress.md`
- Create: `docs/plans/2026-04-23-architecture-reset-handoff.md`

- [ ] **Step 1: Run focused tests for each refactor area**

```bash
npm run test -- \
  src/main/workspace-service.test.ts \
  src/main/workspace-application.test.ts \
  src/main/workspace-close-coordinator.test.ts \
  src/preload/preload.contract.test.ts \
  src/preload/preload.test.ts \
  src/renderer/editor/useWorkspaceController.test.tsx \
  src/renderer/editor/useSaveController.test.tsx \
  src/renderer/editor/useExternalConflictController.test.tsx \
  src/renderer/editor/WorkspaceShell.test.tsx \
  src/renderer/app.autosave.test.ts
```

Expected: PASS across canonical workspace, bridge, controller, shell, and theme-contract coverage.

- [ ] **Step 2: Run the full repo quality gates**

```bash
npm run lint
npm run typecheck
npm run build
npm run test
```

Expected: all four commands pass with no architecture-reset regressions.

- [ ] **Step 3: Update progress and record the execution handoff**

```md
<!-- docs/plans/2026-04-23-architecture-reset-handoff.md -->
# Architecture Reset Handoff

- Closed: workspace truth split
- Closed: renderer shell orchestration
- Closed: false workspace-open typing
- Closed: stale design baseline
- Closed: oversized preload bridge
- Closed: theme fixture private selector dependency

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test`
```

- [ ] **Step 4: Commit the verification pass**

```bash
git add docs/progress.md docs/plans/2026-04-23-architecture-reset-handoff.md
git commit -m "chore: verify architecture reset"
```

## Self-Review Checklist

- Spec coverage: Task 2 closes canonical workspace truth, Task 3 closes bridge typing/scope, Tasks 4-5 close renderer orchestration, and Task 6 closes docs/theme public-truth drift.
- Placeholder scan: no `TODO`/`TBD` placeholders are allowed during execution; every missing type/file referenced above must be created in the task that first mentions it.
- Type consistency: `OpenWorkspaceFileResult`, `ProductBridge`, `TestBridge`, and controller hook names must stay exactly consistent across shared, preload, renderer, and tests.

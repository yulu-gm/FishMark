# TASK-007 CodeMirror 6 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the temporary textarea editor with a minimal CodeMirror 6 editor whose text state is owned by the editor layer and still works with the existing open/save flow.

**Architecture:** Keep `main` and `preload` unchanged except for type compatibility, and move renderer text ownership into a dedicated CodeMirror wrapper. React continues to own document metadata, open/save state, and persisted-content snapshots, while the editor wrapper owns `EditorState`, emits text changes, and exposes a current-content getter for saves.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, Vitest

---

### Task 1: Add CodeMirror dependencies and editor wrapper tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/renderer/code-editor.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { createCodeEditorController } from "./code-editor";

describe("createCodeEditorController", () => {
  it("returns the latest document text after edits", () => {
    const host = document.createElement("div");
    const onChange = vi.fn();
    const controller = createCodeEditorController({
      parent: host,
      initialContent: "# Title\n",
      onChange,
      onSave: vi.fn(),
      onSaveAs: vi.fn()
    });

    controller.replaceContent("# Updated\n");

    expect(controller.getContent()).toBe("# Updated\n");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/code-editor.test.ts`
Expected: FAIL because `./code-editor` and CodeMirror dependencies do not exist yet

**Step 3: Install the minimum CodeMirror packages**

Run: `npm install @codemirror/commands @codemirror/state @codemirror/view`
Expected: dependencies added without unrelated package churn

**Step 4: Commit**

```bash
git add package.json package-lock.json src/renderer/code-editor.test.ts
git commit -m "test: add codemirror editor wrapper coverage"
```

### Task 2: Implement the editor controller

**Files:**
- Create: `src/renderer/code-editor.ts`
- Test: `src/renderer/code-editor.test.ts`

**Step 1: Write the next failing tests**

```ts
it("invokes save callbacks from keybindings", () => {
  const host = document.createElement("div");
  const onSave = vi.fn();
  const onSaveAs = vi.fn();

  const controller = createCodeEditorController({
    parent: host,
    initialContent: "draft",
    onChange: vi.fn(),
    onSave,
    onSaveAs
  });

  expect(controller.triggerSave()).toBe(true);
  expect(controller.triggerSaveAs()).toBe(true);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSaveAs).toHaveBeenCalledTimes(1);

  controller.destroy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/code-editor.test.ts`
Expected: FAIL because controller methods are not implemented yet

**Step 3: Write the minimal implementation**

```ts
export function createCodeEditorController(options: CreateCodeEditorControllerOptions) {
  const view = new EditorView({
    state: EditorState.create({
      doc: options.initialContent,
      extensions: [
        keymap.of([
          { key: "Mod-s", run: () => options.onSave() || true },
          { key: "Shift-Mod-s", run: () => options.onSaveAs() || true },
          ...historyKeymap,
          ...defaultKeymap
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.state.doc.toString());
          }
        })
      ]
    }),
    parent: options.parent
  });

  return {
    getContent: () => view.state.doc.toString(),
    replaceContent(nextContent: string) {
      view.setState(createEditorState(nextContent, options));
    },
    triggerSave: () => options.onSave() || true,
    triggerSaveAs: () => options.onSaveAs() || true,
    destroy: () => view.destroy()
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/code-editor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/code-editor.ts src/renderer/code-editor.test.ts
git commit -m "feat: add codemirror editor controller"
```

### Task 3: Refactor renderer state around persisted snapshots

**Files:**
- Modify: `src/renderer/document-state.ts`
- Modify: `src/renderer/document-state.test.ts`

**Step 1: Write the failing test**

```ts
it("marks the document dirty when editor content diverges from the persisted snapshot", () => {
  const opened = applyOpenMarkdownResult(createInitialAppState(), {
    status: "success",
    document: {
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Today\n",
      encoding: "utf-8"
    }
  });

  const nextState = applyEditorContentChanged(opened, "# Updated\n");

  expect(nextState.editorContent).toBe("# Updated\n");
  expect(nextState.lastSavedContent).toBe("# Today\n");
  expect(nextState.isDirty).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/document-state.test.ts`
Expected: FAIL because `applyEditorContentChanged` and `editorContent` are not implemented yet

**Step 3: Write the minimal implementation**

```ts
export type AppState = {
  currentDocument: OpenMarkdownDocument | null;
  editorContent: string;
  openState: OpenState;
  saveState: SaveState;
  isDirty: boolean;
  errorMessage: string | null;
  lastSavedContent: string | null;
};

export function applyEditorContentChanged(currentState: AppState, nextContent: string): AppState {
  if (!currentState.currentDocument) {
    return currentState;
  }

  return {
    ...currentState,
    editorContent: nextContent,
    isDirty: nextContent !== currentState.lastSavedContent
  };
}
```

**Step 4: Expand tests for save success and save-as metadata changes**

```ts
it("snapshots the current editor content after a successful save", () => {
  const opened = applyOpenMarkdownResult(createInitialAppState(), {
    status: "success",
    document: {
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Today\n",
      encoding: "utf-8"
    }
  });
  const dirty = applyEditorContentChanged(opened, "# Updated\n");

  const nextState = applySaveMarkdownResult(dirty, {
    status: "success",
    document: {
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Updated\n",
      encoding: "utf-8"
    }
  });

  expect(nextState.editorContent).toBe("# Updated\n");
  expect(nextState.lastSavedContent).toBe("# Updated\n");
  expect(nextState.isDirty).toBe(false);
});
```

**Step 5: Run test to verify it passes**

Run: `npm run test -- src/renderer/document-state.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer/document-state.ts src/renderer/document-state.test.ts
git commit -m "refactor: track codemirror editor snapshots in renderer state"
```

### Task 4: Wire the React shell to the editor controller

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Step 1: Write the failing UI integration test or state-driven coverage**

```ts
it("keeps save actions reading from the latest editor content", async () => {
  // Add a focused test around the save handler helper if extracted.
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts`
Expected: FAIL because App still reads from `currentDocument.content`

**Step 3: Write the minimal implementation**

```tsx
const [state, setState] = useState(createInitialAppState());

async function handleSaveMarkdown(): Promise<void> {
  if (!state.currentDocument) {
    return;
  }

  setState((current) => startSavingDocument(current));

  const result = await window.yulora.saveMarkdownFile({
    path: state.currentDocument.path,
    content: state.editorContent
  });

  setState((current) => applySaveMarkdownResult(current, result));
}
```

```tsx
<CodeEditor
  content={state.editorContent}
  documentKey={state.currentDocument?.path ?? "empty"}
  onContentChange={(nextContent) => {
    setState((current) => applyEditorContentChanged(current, nextContent));
  }}
  onSave={() => void handleSaveMarkdown()}
  onSaveAs={() => void handleSaveMarkdownAs()}
/>
```

**Step 4: Run targeted tests**

Run: `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: replace textarea with codemirror editor shell"
```

### Task 5: Verify and document TASK-007

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Modify: `docs/progress.md`
- Create: `reports/task-summaries/TASK-007.md`

**Step 1: Run project verification**

Run:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Expected:
- All commands PASS

**Step 2: Update task records**

Add:
- A decision-log entry describing the new renderer/editor boundary
- Fresh test-report evidence for TASK-007
- TASK-007 status in `docs/progress.md`
- A concise task summary in `reports/task-summaries/TASK-007.md`

**Step 3: Commit**

```bash
git add docs/decision-log.md docs/test-report.md docs/progress.md reports/task-summaries/TASK-007.md
git commit -m "docs: record task-007 codemirror integration"
```

import { describe, expect, it, vi } from "vitest";

import type { WorkspaceDocumentSnapshot, WorkspaceWindowSnapshot } from "../shared/workspace";
import { getActiveDocument } from "./editor/editor-shell-state";
import {
  WorkspaceRendererApplication,
  type WorkspaceRendererBridge
} from "./editor/workspace-renderer-application";
import { createEditorTestDriver } from "./editor-test-driver";

function createHarness() {
  let editorContent = "";
  const openWorkspaceFileFromPath = vi.fn();
  const saveMarkdownFile = vi.fn();
  const applyDocumentEdits = vi.fn(async (input: {
    tabId: string; clientSequence: number; baseRevision: number;
  }) => ({
    kind: "applied" as const,
    acknowledgedSequence: input.clientSequence,
    revision: input.baseRevision + 1,
    isDirty: true
  }));
  const flushDocumentEdits = vi.fn(async (input: { throughSequence: number }) => ({
    kind: "flushed" as const,
    acknowledgedSequence: input.throughSequence,
    revision: 1,
    savedRevision: 0,
    isDirty: true
  }));

  const application = new WorkspaceRendererApplication({
    bridge: {
      openWorkspaceFileFromPath,
      saveMarkdownFile,
      applyDocumentEdits,
      flushDocumentEdits,
      onDocumentProjection: vi.fn(() => () => {}),
      getWorkspaceSnapshot: vi.fn(async () =>
        application.getState().workspaceSnapshot ?? EMPTY_WORKSPACE_SNAPSHOT
      )
    } as unknown as WorkspaceRendererBridge,
    initialSnapshot: EMPTY_WORKSPACE_SNAPSHOT
  });

  application.subscribe(() => {
    const pending = application.getPendingEditorLoadIdentity();
    if (pending === null) {
      return;
    }
    editorContent = getActiveDocument(application.getState())?.content ?? "";
    application.acknowledgeEditorLoad(pending);
  });

  const applyEditorContent = (content: string): void => {
    const identity = application.getEditorBinding();
    if (identity === null) {
      editorContent = content;
      return;
    }
    const baseText = editorContent;
    editorContent = content;
    application.recordEditorDocumentChangeFrame({
      identity,
      baseText,
      resultingText: content,
      changes: [{ from: 0, to: baseText.length, insert: content }]
    });
  };

  const harness = {
    workspace: application.getEditorTestAdapter(),
    resetAutosaveRuntime: vi.fn(),
    editor: {
      getContent: () => editorContent,
      setContent: applyEditorContent,
      insertText: (text: string) => applyEditorContent(editorContent + text),
      getSelection: vi.fn(() => ({ anchor: 0, head: 0 })),
      setSelection: vi.fn(),
      pressEnter: vi.fn(() => {
        applyEditorContent(`${editorContent}\n`);
      }),
      pressBackspace: vi.fn(),
      pressTab: vi.fn(),
      pressArrowUp: vi.fn(),
      pressArrowDown: vi.fn()
    },
    openWorkspaceFileFromPath,
    saveMarkdownFile,
    applyDocumentEdits,
    applyEditorContent
  };

  const driver = createEditorTestDriver(harness);

  return {
    ...harness,
    driver,
    readState: application.getState,
    readEditorContent: () => editorContent
  };
}

const EMPTY_WORKSPACE_SNAPSHOT: WorkspaceWindowSnapshot = {
  windowId: "window-1",
  activeTabId: null,
  tabs: [],
  activeDocument: null
};

describe("createEditorTestDriver", () => {
  it("opens a fixture file into the active workspace tab and editor snapshot", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/open.md",
              name: "open.md",
              content: "# Fixture\n"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );

    await expect(
      harness.driver.run({
        type: "open-fixture-file",
        fixturePath: "C:/fixtures/open.md"
      })
    ).resolves.toEqual({
      ok: true,
      message: "Fixture file opened.",
      details: {
        path: "C:/fixtures/open.md"
      }
    });

    expect(harness.readState().workspaceSnapshot?.tabs).toHaveLength(1);
    expect(getActiveDocument(harness.readState())?.path).toBe("C:/fixtures/open.md");
    expect(harness.readEditorContent()).toBe("# Fixture\n");
  });

  it("opens a second fixture file as a second tab instead of replacing the first one", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath
      .mockResolvedValueOnce(
        createOpenWorkspaceFileFromPathSuccess(
          createWorkspaceSnapshot({
            tabs: [
              createWorkspaceDocument({
                tabId: "tab-1",
                path: "C:/fixtures/first.md",
                name: "first.md",
                content: "# First\n"
              })
            ],
            activeTabId: "tab-1"
          })
        )
      )
      .mockResolvedValueOnce(
        createOpenWorkspaceFileFromPathSuccess(
          createWorkspaceSnapshot({
            tabs: [
              createWorkspaceDocument({
                tabId: "tab-1",
                path: "C:/fixtures/first.md",
                name: "first.md",
                content: "# First\n"
              }),
              createWorkspaceDocument({
                tabId: "tab-2",
                path: "C:/fixtures/second.md",
                name: "second.md",
                content: "# Second\n"
              })
            ],
            activeTabId: "tab-2"
          })
        )
      );

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/first.md"
    });
    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/second.md"
    });

    expect(harness.readState().workspaceSnapshot?.tabs).toHaveLength(2);
    expect(harness.readState().workspaceSnapshot?.tabs.map((tab) => tab.path)).toEqual([
      "C:/fixtures/first.md",
      "C:/fixtures/second.md"
    ]);
    expect(getActiveDocument(harness.readState())?.path).toBe("C:/fixtures/second.md");
    expect(harness.readEditorContent()).toBe("# Second\n");
  });

  it("marks the active tab dirty after replacing editor content", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/open.md",
              name: "open.md",
              content: "# Fixture\n"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/open.md"
    });

    await expect(
      harness.driver.run({
        type: "set-editor-content",
        content: "# Updated\n"
      })
    ).resolves.toMatchObject({ ok: true });

    expect(harness.readEditorContent()).toBe("# Updated\n");
    expect(getActiveDocument(harness.readState())?.isDirty).toBe(true);
  });

  it("can assert document path, content, and dirty state against the active tab", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/open.md",
              name: "open.md",
              content: "# Fixture\n"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/open.md"
    });

    await expect(
      harness.driver.run({
        type: "assert-document-path",
        expectedPath: "C:/fixtures/open.md"
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.driver.run({
        type: "assert-editor-content",
        expectedContent: "# Fixture\n"
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.driver.run({
        type: "assert-dirty-state",
        expectedDirty: false
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it("reports an empty workspace before any document is open", async () => {
    const harness = createHarness();

    await expect(
      harness.driver.run({
        type: "assert-empty-workspace"
      })
    ).resolves.toMatchObject({ ok: true, message: "Workspace is empty." });
  });

  it("can set selection and press Enter through the driver", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/list.md",
              name: "list.md",
              content: "- [ ] todo"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );
    harness.editor.pressEnter = vi.fn(() => {
      harness.applyEditorContent("- [ ] todo\n- [ ] ");
    });

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/list.md"
    });

    await expect(
      harness.driver.run({
        type: "set-editor-selection",
        anchor: 10
      })
    ).resolves.toMatchObject({ ok: true, message: "Editor selection updated." });

    await expect(
      harness.driver.run({
        type: "press-editor-enter"
      })
    ).resolves.toMatchObject({ ok: true, message: "Editor Enter executed." });

    expect(harness.editor.setSelection).toHaveBeenCalledWith(10, 10);
    expect(harness.editor.pressEnter).toHaveBeenCalledTimes(1);
    expect(harness.readEditorContent()).toBe("- [ ] todo\n- [ ] ");
    expect(getActiveDocument(harness.readState())?.isDirty).toBe(true);
  });

  it("can execute navigation and indentation commands through the driver", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/nav.md",
              name: "nav.md",
              content: "# Title\nParagraph"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/nav.md"
    });

    await expect(harness.driver.run({ type: "press-editor-arrow-up" })).resolves.toMatchObject({
      ok: true,
      message: "Editor ArrowUp executed."
    });
    await expect(harness.driver.run({ type: "press-editor-arrow-down" })).resolves.toMatchObject({
      ok: true,
      message: "Editor ArrowDown executed."
    });
    await expect(
      harness.driver.run({ type: "press-editor-tab", shiftKey: true })
    ).resolves.toMatchObject({
      ok: true,
      message: "Editor Shift-Tab executed."
    });
    await expect(harness.driver.run({ type: "press-editor-backspace" })).resolves.toMatchObject({
      ok: true,
      message: "Editor Backspace executed."
    });

    expect(harness.editor.pressArrowUp).toHaveBeenCalledTimes(1);
    expect(harness.editor.pressArrowDown).toHaveBeenCalledTimes(1);
    expect(harness.editor.pressTab).toHaveBeenCalledWith(true);
    expect(harness.editor.pressBackspace).toHaveBeenCalledTimes(1);
  });

  it("can assert the current editor selection", async () => {
    const harness = createHarness();
    harness.openWorkspaceFileFromPath.mockResolvedValue(
      createOpenWorkspaceFileFromPathSuccess(
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: "C:/fixtures/selection.md",
              name: "selection.md",
              content: "Paragraph"
            })
          ],
          activeTabId: "tab-1"
        })
      )
    );
    harness.editor.getSelection.mockReturnValue({ anchor: 12, head: 12 });

    await harness.driver.run({
      type: "open-fixture-file",
      fixturePath: "C:/fixtures/selection.md"
    });

    await expect(
      harness.driver.run({
        type: "assert-editor-selection",
        expectedAnchor: 12
      })
    ).resolves.toMatchObject({ ok: true, message: "Editor selection matched." });

    await expect(
      harness.driver.run({
        type: "assert-editor-selection",
        expectedAnchor: 7,
        expectedHead: 9
      })
    ).resolves.toMatchObject({
      ok: false,
      message: "Editor selection mismatch."
    });
  });
});

function createWorkspaceSnapshot(input: {
  tabs: WorkspaceDocumentSnapshot[];
  activeTabId: string | null;
}): WorkspaceWindowSnapshot {
  const activeDocument =
    input.activeTabId === null
      ? null
      : (input.tabs.find((tab) => tab.tabId === input.activeTabId) ?? null);

  return {
    windowId: "window-1",
    activeTabId: input.activeTabId,
    tabs: input.tabs.map((tab) => ({
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    })),
    activeDocument
  };
}

function createOpenWorkspaceFileFromPathSuccess(snapshot: WorkspaceWindowSnapshot) {
  return {
    kind: "success" as const,
    snapshot
  };
}

function createWorkspaceDocument(input: {
  tabId: string;
  path: string | null;
  name: string;
  content: string;
  isDirty?: boolean;
}): WorkspaceDocumentSnapshot {
  return {
    tabId: input.tabId,
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8",
    revision: input.isDirty ? 1 : 0,
    savedRevision: 0,
    isDirty: input.isDirty ?? false,
    saveState: "idle"
  };
}

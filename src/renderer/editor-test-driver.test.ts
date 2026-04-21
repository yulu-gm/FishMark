import { describe, expect, it, vi } from "vitest";

import type { AppState } from "./document-state";
import { createInitialAppState } from "./document-state";
import { createEditorTestDriver } from "./editor-test-driver";

function createHarness() {
  let state: AppState = createInitialAppState();
  let editorContent = "";

  const harness = {
    getState: () => state,
    applyState: (updater: (current: AppState) => AppState) => {
      state = updater(state);
    },
    resetAutosaveRuntime: vi.fn(),
    editor: {
      getContent: () => editorContent,
      setContent: (content: string) => {
        editorContent = content;
      },
      insertText: (text: string) => {
        editorContent += text;
      },
      getSelection: vi.fn(() => ({ anchor: 0, head: 0 })),
      setSelection: vi.fn(),
      pressEnter: vi.fn(() => {
        editorContent += "\n";
      }),
      pressBackspace: vi.fn(),
      pressTab: vi.fn(),
      pressArrowUp: vi.fn(),
      pressArrowDown: vi.fn()
    },
    setEditorContentSnapshot: (content: string) => {
      editorContent = content;
    },
    openMarkdownFileFromPath: vi.fn(),
    saveMarkdownFile: vi.fn()
  };

  const driver = createEditorTestDriver(harness);

  return {
    ...harness,
    driver,
    readState: () => state,
    readEditorContent: () => editorContent
  };
}

describe("createEditorTestDriver", () => {
  it("opens a fixture file into app state and the editor snapshot", async () => {
    const harness = createHarness();
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/open.md",
        name: "open.md",
        content: "# Fixture\n",
        encoding: "utf-8"
      }
    });

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

    expect(harness.readState().currentDocument?.path).toBe("C:/fixtures/open.md");
    expect(harness.readEditorContent()).toBe("# Fixture\n");
  });

  it("marks the document dirty after replacing editor content", async () => {
    const harness = createHarness();
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/open.md",
        name: "open.md",
        content: "# Fixture\n",
        encoding: "utf-8"
      }
    });

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
    expect(harness.readState().isDirty).toBe(true);
  });

  it("can assert document path, content, and dirty state", async () => {
    const harness = createHarness();
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/open.md",
        name: "open.md",
        content: "# Fixture\n",
        encoding: "utf-8"
      }
    });

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
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/list.md",
        name: "list.md",
        content: "- [ ] todo",
        encoding: "utf-8"
      }
    });
    harness.editor.pressEnter = vi.fn(() => {
      harness.setEditorContentSnapshot("- [ ] todo\n- [ ] ");
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
    expect(harness.readState().isDirty).toBe(true);
  });

  it("can execute navigation and indentation commands through the driver", async () => {
    const harness = createHarness();
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/nav.md",
        name: "nav.md",
        content: "# Title\nParagraph",
        encoding: "utf-8"
      }
    });

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
    harness.openMarkdownFileFromPath.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/fixtures/selection.md",
        name: "selection.md",
        content: "Paragraph",
        encoding: "utf-8"
      }
    });
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

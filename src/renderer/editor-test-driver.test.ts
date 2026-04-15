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
      }
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
});

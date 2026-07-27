import { describe, expect, it, vi } from "vitest";

import {
  saveMarkdownFileToPath,
  showSaveMarkdownPathDialog
} from "./save-markdown-file";

describe("saveMarkdownFileToPath", () => {
  it("writes UTF-8 content to the target path and returns saved metadata", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveMarkdownFileToPath(
      {
        tabId: "tab-1",
        path: "C:/notes/today.md",
        content: "# Updated\n"
      },
      { writeFile }
    );

    expect(writeFile).toHaveBeenCalledWith("C:/notes/today.md", "# Updated\n", "utf8");
    expect(result).toEqual({
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });
  });

  it("returns write-failed when the file cannot be saved", async () => {
    const result = await saveMarkdownFileToPath(
      {
        tabId: "tab-1",
        path: "C:/notes/today.md",
        content: "# Updated\n"
      },
      {
        writeFile: vi.fn().mockRejectedValue(new Error("permission denied"))
      }
    );

    expect(result).toEqual({
      status: "error",
      error: {
        code: "write-failed",
        message: "The Markdown file could not be saved."
      }
    });
  });
});

describe("showSaveMarkdownPathDialog", () => {
  it("supports untitled documents by allowing a missing current path", async () => {
    const showSaveDialog = vi.fn().mockResolvedValue({ canceled: true, filePath: undefined });

    const result = await showSaveMarkdownPathDialog(
      { currentPath: null },
      { showSaveDialog }
    );

    expect(result).toEqual({ status: "cancelled" });
    expect(showSaveDialog).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled when the user closes the save dialog", async () => {
    const result = await showSaveMarkdownPathDialog(
      { currentPath: "C:/notes/today.md" },
      {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined })
      }
    );

    expect(result).toEqual({ status: "cancelled" });
  });

  it("returns the selected path without writing the document", async () => {
    const result = await showSaveMarkdownPathDialog(
      { currentPath: "C:/notes/today.md" },
      {
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePath: "C:/archive/renamed.md"
        })
      }
    );

    expect(result).toEqual({
      status: "success",
      path: "C:/archive/renamed.md"
    });
  });

  it("returns dialog-failed when the dialog does not provide a path", async () => {
    const result = await showSaveMarkdownPathDialog(
      { currentPath: "C:/notes/today.md" },
      {
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePath: undefined
        })
      }
    );

    expect(result).toEqual({
      status: "error",
      error: {
        code: "dialog-failed",
        message: "The save dialog could not be opened."
      }
    });
  });
});

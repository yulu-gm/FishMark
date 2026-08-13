import { describe, expect, it, vi } from "vitest";

import { showSaveMarkdownPathDialog } from "./save-markdown-file";

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

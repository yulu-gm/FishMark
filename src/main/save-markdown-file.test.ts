import { describe, expect, it, vi } from "vitest";

import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";

describe("saveMarkdownFileToPath", () => {
  it("writes UTF-8 content to the target path and returns saved metadata", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveMarkdownFileToPath(
      {
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

describe("showSaveMarkdownDialog", () => {
  it("returns cancelled when the user closes the save dialog", async () => {
    const result = await showSaveMarkdownDialog(
      {
        currentPath: "C:/notes/today.md",
        content: "# Updated\n"
      },
      {
        saveMarkdownFileToPath: vi.fn(),
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined })
      }
    );

    expect(result).toEqual({ status: "cancelled" });
  });

  it("writes the selected path and returns the updated metadata", async () => {
    const result = await showSaveMarkdownDialog(
      {
        currentPath: "C:/notes/today.md",
        content: "# Updated\n"
      },
      {
        saveMarkdownFileToPath: vi.fn().mockResolvedValue({
          status: "success",
          document: {
            path: "C:/archive/renamed.md",
            name: "renamed.md",
            content: "# Updated\n",
            encoding: "utf-8"
          }
        }),
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePath: "C:/archive/renamed.md"
        })
      }
    );

    expect(result).toEqual({
      status: "success",
      document: {
        path: "C:/archive/renamed.md",
        name: "renamed.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });
  });
});

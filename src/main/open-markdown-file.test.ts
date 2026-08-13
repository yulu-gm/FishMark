import { describe, expect, it, vi } from "vitest";

import { openMarkdownFileFromPath, showOpenMarkdownPathDialog } from "./open-markdown-file";

describe("openMarkdownFileFromPath", () => {
  it("returns a success result for a UTF-8 markdown file", async () => {
    const result = await openMarkdownFileFromPath("C:/notes/today.md", {
      readFile: vi.fn().mockResolvedValue(Buffer.from("# Today\n", "utf8")),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, mtimeMs: 123, size: 8 })
    });

    expect(result).toMatchObject({
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });
    expect(result.status === "success" && result.diskVersion.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes CRLF line endings to LF", async () => {
    const result = await openMarkdownFileFromPath("C:/notes/today.md", {
      readFile: vi.fn().mockResolvedValue(Buffer.from("# Today\r\nParagraph\r\n", "utf8")),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, mtimeMs: 123, size: 20 })
    });

    expect(result).toMatchObject({
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\nParagraph\n",
        encoding: "utf-8"
      }
    });
  });

  it("normalizes lone CR line endings to LF", async () => {
    const result = await openMarkdownFileFromPath("C:/notes/today.md", {
      readFile: vi.fn().mockResolvedValue(Buffer.from("# Today\rParagraph\r", "utf8")),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, mtimeMs: 123, size: 18 })
    });

    expect(result).toMatchObject({
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\nParagraph\n",
        encoding: "utf-8"
      }
    });
  });

  it("returns file-not-found when the selected path does not exist", async () => {
    const result = await openMarkdownFileFromPath("C:/missing.md", {
      readFile: vi.fn(),
      stat: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }))
    });

    expect(result).toEqual({
      status: "error",
      error: {
        code: "file-not-found",
        message: "Selected file could not be found."
      }
    });
  });

  it("returns not-a-file when the selected path is a directory", async () => {
    const result = await openMarkdownFileFromPath("C:/notes", {
      readFile: vi.fn(),
      stat: vi.fn().mockResolvedValue({ isFile: () => false })
    });

    expect(result).toEqual({
      status: "error",
      error: {
        code: "not-a-file",
        message: "Selected path is not a file."
      }
    });
  });

  it("returns read-failed when the file cannot be read", async () => {
    const result = await openMarkdownFileFromPath("C:/notes/today.md", {
      readFile: vi.fn().mockRejectedValue(new Error("permission denied")),
      stat: vi.fn().mockResolvedValue({ isFile: () => true })
    });

    expect(result).toEqual({
      status: "error",
      error: {
        code: "read-failed",
        message: "The Markdown file could not be read."
      }
    });
  });

  it("returns non-utf8 when the file cannot be decoded as UTF-8", async () => {
    const result = await openMarkdownFileFromPath("C:/notes/today.md", {
      readFile: vi.fn().mockResolvedValue(Buffer.from([0xc3, 0x28])),
      stat: vi.fn().mockResolvedValue({ isFile: () => true })
    });

    expect(result).toEqual({
      status: "error",
      error: {
        code: "non-utf8",
        message: "Only UTF-8 Markdown files are supported right now."
      }
    });
  });
});

describe("showOpenMarkdownPathDialog", () => {
  it("returns cancelled when the user closes the picker", async () => {
    const result = await showOpenMarkdownPathDialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
    });

    expect(result).toEqual({ status: "cancelled" });
  });

  it("returns dialog-failed when the file picker throws", async () => {
    const result = await showOpenMarkdownPathDialog({
      showOpenDialog: vi.fn().mockRejectedValue(new Error("picker failed"))
    });

    expect(result).toEqual({
      status: "error",
      error: {
        code: "dialog-failed",
        message: "The file picker could not be opened."
      }
    });
  });

  it("returns the selected path without reading it", async () => {
    const result = await showOpenMarkdownPathDialog({
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["C:/notes/today.md"]
      })
    });

    expect(result).toEqual({
      status: "success",
      path: "C:/notes/today.md"
    });
  });
});

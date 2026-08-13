import { describe, expect, it, vi } from "vitest";

import { createDocumentRepository } from "./document-repository";

describe("createDocumentRepository", () => {
  it("reads a present file and returns a hashed disk version", async () => {
    const repository = createDocumentRepository({
      readFile: async () => "# hello",
      stat: async () => ({ mtimeMs: 12, size: 7 }),
      writeFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
      hashContent: () => "hash-a",
      tempPathFor: (path) => `${path}.tmp`
    });

    await expect(repository.readDiskVersion("C:\\notes\\a.md")).resolves.toEqual({
      normalizedPath: "C:/notes/a.md",
      mtimeMs: 12,
      size: 7,
      contentHash: "hash-a"
    });
  });

  it("returns null for a missing file", async () => {
    const missing = Object.assign(new Error("gone"), { code: "ENOENT" });
    const repository = createDocumentRepository({
      readFile: async () => {
        throw missing;
      },
      stat: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn(),
      unlink: vi.fn(),
      hashContent: () => "unused",
      tempPathFor: (path) => `${path}.tmp`
    });

    await expect(repository.readDiskVersion("C:/notes/missing.md")).resolves.toBeNull();
  });

  it("writes to a temporary path, renames over the target, and returns the new version", async () => {
    const writeFile = vi.fn(async () => undefined);
    const rename = vi.fn(async () => undefined);
    const unlink = vi.fn(async () => undefined);
    const repository = createDocumentRepository({
      readFile: vi.fn(),
      stat: async () => ({ mtimeMs: 3, size: 5 }),
      writeFile,
      rename,
      unlink,
      hashContent: () => "hash-new",
      tempPathFor: (path) => `${path}.tmp`
    });

    const result = await repository.writeDocument({
      path: "C:/notes/a.md",
      content: "hello"
    });

    expect(writeFile).toHaveBeenCalledWith("C:/notes/a.md.tmp", "hello");
    expect(rename).toHaveBeenCalledWith("C:/notes/a.md.tmp", "C:/notes/a.md");
    expect(result).toEqual({
      status: "success",
      diskVersion: {
        normalizedPath: "C:/notes/a.md",
        mtimeMs: 3,
        size: 5,
        contentHash: "hash-new"
      },
      document: {
        path: "C:/notes/a.md",
        name: "a.md",
        content: "hello",
        encoding: "utf-8"
      }
    });
  });

  it("cleans up the temporary file when the rename fails and returns write-failed", async () => {
    const writeFile = vi.fn(async () => undefined);
    const rename = vi.fn(async () => {
      throw new Error("rename failed");
    });
    const unlink = vi.fn(async () => undefined);
    const repository = createDocumentRepository({
      readFile: vi.fn(),
      stat: vi.fn(),
      writeFile,
      rename,
      unlink,
      hashContent: () => "unused",
      tempPathFor: (path) => `${path}.tmp`
    });

    const result = await repository.writeDocument({
      path: "C:/notes/a.md",
      content: "hello"
    });

    expect(unlink).toHaveBeenCalledWith("C:/notes/a.md.tmp");
    expect(result).toEqual({
      status: "error",
      error: { code: "write-failed", message: "The Markdown file could not be written." }
    });
  });

  it("returns write-failed when the stat after write fails", async () => {
    const writeFile = vi.fn(async () => undefined);
    const rename = vi.fn(async () => undefined);
    const repository = createDocumentRepository({
      readFile: vi.fn(),
      stat: async () => {
        throw new Error("stat failed");
      },
      writeFile,
      rename,
      unlink: vi.fn(),
      hashContent: () => "unused",
      tempPathFor: (path) => `${path}.tmp`
    });

    const result = await repository.writeDocument({
      path: "C:/notes/a.md",
      content: "hello"
    });

    expect(result).toEqual({
      status: "error",
      error: { code: "write-failed", message: "The Markdown file could not be written." }
    });
  });
});

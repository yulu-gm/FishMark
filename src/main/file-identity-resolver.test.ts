import { link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createFileIdentityResolver } from "./file-identity-resolver";

describe("file identity resolver", () => {
  it("gives hard-link aliases one physical identity in a real filesystem", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "fishmark-file-identity-"));
    try {
      const original = path.join(directory, "original.md");
      const alias = path.join(directory, "hard-link.md");
      await writeFile(original, "body", "utf8");
      await link(original, alias);
      const resolver = createFileIdentityResolver();

      const [first, second] = await Promise.all([
        resolver.resolveExisting(original),
        resolver.resolveExisting(alias)
      ]);

      expect(first.identity.object).toBe(second.identity.object);
      expect(first.canonicalPath).not.toBe(second.canonicalPath);
      expect(first).toMatchObject({
        exists: true,
        physicalKey: second.identity.object
      });
      expect(second).toMatchObject({
        exists: true,
        physicalKey: first.identity.object
      });
      expect(first.pathKey).not.toBe(second.pathKey);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("gives symlink aliases one physical identity when the platform permits symlinks", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "fishmark-file-identity-"));
    try {
      const original = path.join(directory, "original.md");
      const alias = path.join(directory, "symbolic-link.md");
      await writeFile(original, "body", "utf8");
      try {
        await symlink(original, alias, "file");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EPERM") {
          return;
        }
        throw error;
      }
      const resolver = createFileIdentityResolver();

      const [first, second] = await Promise.all([
        resolver.resolveExisting(original),
        resolver.resolveExisting(alias)
      ]);

      expect(first.identity).toBe(second.identity);
      expect(first.canonicalPath).toBe(second.canonicalPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("folds Windows case after resolving an existing path", async () => {
    const resolver = createFileIdentityResolver({
      platform: "win32",
      cwd: () => "C:\\Work",
      realpath: vi.fn(async () => "C:\\Real\\Note.MD")
    });

    await expect(resolver.resolveExisting("c:\\alias\\note.md")).resolves.toMatchObject({
      canonicalPath: "C:\\Real\\Note.MD",
      identity: {
        location: "path:c:\\real\\note.md",
        object: "object:c:\\real\\note.md"
      },
      exists: true,
      pathKey: "path:c:\\real\\note.md",
      physicalKey: "object:c:\\real\\note.md"
    });
  });

  it("falls back to the canonical path when filesystem object ids are unavailable", async () => {
    const resolver = createFileIdentityResolver({
      platform: "darwin",
      cwd: () => "/Work",
      realpath: vi.fn(async () => "/Volume/CaseSensitive/Note.MD"),
      stat: vi.fn(async () => {
        throw Object.assign(new Error("unsupported"), { code: "ENOSYS" });
      })
    });

    await expect(resolver.resolveExisting("Note.MD")).resolves.toMatchObject({
      canonicalPath: "/Volume/CaseSensitive/Note.MD",
      identity: {
        location: "path:/Volume/CaseSensitive/Note.MD",
        object: "object:/Volume/CaseSensitive/Note.MD"
      }
    });
  });

  it("resolves a prospective path from its deepest existing ancestor", async () => {
    const realpath = vi.fn(async (candidate: string) => {
      if (candidate === "/work/new/deep/note.md" || candidate === "/work/new/deep") {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      if (candidate === "/work/new") {
        return "/volume/project/new";
      }
      throw new Error(`Unexpected candidate ${candidate}`);
    });
    const resolver = createFileIdentityResolver({
      platform: "linux",
      cwd: () => "/work",
      realpath
    });

    await expect(resolver.resolveProspective("new/deep/note.md")).resolves.toMatchObject({
      canonicalPath: "/volume/project/new/deep/note.md",
      identity: null,
      exists: false,
      physicalKey: null,
      pathKey: "path:/volume/project/new/deep/note.md"
    });
  });
});

import { createHash } from "node:crypto";
import path from "node:path";
import {
  readFile as defaultReadFile,
  rename as defaultRename,
  stat as defaultStat,
  unlink as defaultUnlink,
  writeFile as defaultWriteFile
} from "node:fs/promises";

import type { DiskVersion } from "@fishmark/workspace-domain";

export type DiskStat = {
  readonly mtimeMs: number;
  readonly size: number;
};

export type DocumentRepositoryDependencies = {
  readFile: (targetPath: string) => Promise<string>;
  stat: (targetPath: string) => Promise<DiskStat>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  rename: (fromPath: string, toPath: string) => Promise<void>;
  unlink: (targetPath: string) => Promise<void>;
  hashContent: (content: string) => string;
  tempPathFor: (targetPath: string) => string;
  isMissingFileError?: (error: unknown) => boolean;
};

export type WriteDocumentResult =
  | {
      readonly status: "success";
      readonly diskVersion: DiskVersion;
      readonly document: {
        readonly path: string;
        readonly name: string;
        readonly content: string;
        readonly encoding: "utf-8";
      };
    }
  | {
      readonly status: "error";
      readonly error: { readonly code: "write-failed"; readonly message: string };
    };

export type DocumentRepository = {
  readDiskVersion(targetPath: string): Promise<DiskVersion | null>;
  writeDocument(input: {
    readonly path: string;
    readonly content: string;
  }): Promise<WriteDocumentResult>;
};

const defaultDependencies: DocumentRepositoryDependencies = {
  readFile: (targetPath) => defaultReadFile(targetPath, "utf8"),
  stat: defaultStat,
  writeFile: (targetPath, content) => defaultWriteFile(targetPath, content, "utf8"),
  rename: defaultRename,
  unlink: defaultUnlink,
  hashContent: (content) => createHash("sha256").update(content).digest("hex"),
  tempPathFor: (targetPath) =>
    `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
};

export function createDocumentRepository(
  dependencies: DocumentRepositoryDependencies = defaultDependencies
): DocumentRepository {
  function normalizedPath(targetPath: string): string {
    return targetPath.replace(/\\/g, "/");
  }

  function isMissingFileError(error: unknown): boolean {
    if (dependencies.isMissingFileError !== undefined) {
      return dependencies.isMissingFileError(error);
    }
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  async function readDiskVersion(targetPath: string): Promise<DiskVersion | null> {
    let content: string;
    try {
      content = await dependencies.readFile(targetPath);
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
    const snapshot = await dependencies.stat(targetPath);
    return {
      normalizedPath: normalizedPath(targetPath),
      mtimeMs: snapshot.mtimeMs,
      size: snapshot.size,
      contentHash: dependencies.hashContent(content)
    };
  }

  async function writeDocument(input: {
    readonly path: string;
    readonly content: string;
  }): Promise<WriteDocumentResult> {
    const tempPath = dependencies.tempPathFor(input.path);
    try {
      await dependencies.writeFile(tempPath, input.content);
      await dependencies.rename(tempPath, input.path);
    } catch {
      try {
        await dependencies.unlink(tempPath);
      } catch {
        // The temporary file may not exist yet; cleanup failure must not mask the write error.
      }
      return {
        status: "error",
        error: { code: "write-failed", message: "The Markdown file could not be written." }
      };
    }

    let snapshot: DiskStat;
    try {
      snapshot = await dependencies.stat(input.path);
    } catch {
      return {
        status: "error",
        error: { code: "write-failed", message: "The Markdown file could not be written." }
      };
    }
    return {
      status: "success",
      diskVersion: {
        normalizedPath: normalizedPath(input.path),
        mtimeMs: snapshot.mtimeMs,
        size: snapshot.size,
        contentHash: dependencies.hashContent(input.content)
      },
      document: {
        path: input.path,
        name: path.basename(input.path),
        content: input.content,
        encoding: "utf-8"
      }
    };
  }

  return { readDiskVersion, writeDocument };
}

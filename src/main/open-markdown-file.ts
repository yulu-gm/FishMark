import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { dialog } from "electron";

import type { DocumentReadResult } from "@fishmark/workspace-application";

import {
  OPEN_MARKDOWN_FILE_ERROR_MESSAGES,
  type OpenMarkdownFileErrorCode
} from "../shared/open-markdown-file";

type FileStat = {
  isFile: () => boolean;
  mtimeMs: number;
  size: number;
};

export type OpenMarkdownFileDependencies = {
  readFile: (targetPath: string) => Promise<Buffer>;
  stat: (targetPath: string) => Promise<FileStat>;
};

const defaultDependencies: OpenMarkdownFileDependencies = {
  readFile,
  stat
};

type OpenDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

export type OpenMarkdownDialogDependencies = {
  showOpenDialog: () => Promise<OpenDialogResult>;
};

export type OpenMarkdownPathDialogResult =
  | { readonly status: "success"; readonly path: string }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly error: { readonly code: "dialog-failed"; readonly message: string } };

export async function openMarkdownFileFromPath(
  targetPath: string,
  dependencies: OpenMarkdownFileDependencies = defaultDependencies
): Promise<DocumentReadResult> {
  try {
    const fileStat = await dependencies.stat(targetPath);

    if (!fileStat.isFile()) {
      return createErrorResult("not-a-file");
    }

    const fileBuffer = await dependencies.readFile(targetPath);
    const content = decodeUtf8(fileBuffer);

    if (content === null) {
      return createErrorResult("non-utf8");
    }

    return {
      status: "success",
      document: {
        path: targetPath,
        name: path.basename(targetPath),
        content,
        encoding: "utf-8"
      },
      diskVersion: {
        normalizedPath: targetPath.replace(/\\/g, "/"),
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        contentHash: createHash("sha256").update(fileBuffer).digest("hex")
      }
    };
  } catch (error) {
    return mapReadError(error);
  }
}

export async function showOpenMarkdownPathDialog(
  dependencies: OpenMarkdownDialogDependencies = {
    showOpenDialog: () =>
      dialog.showOpenDialog({
        title: "Open Markdown",
        properties: ["openFile"],
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
      })
  }
): Promise<OpenMarkdownPathDialogResult> {
  try {
    const dialogResult = await dependencies.showOpenDialog();

    if (dialogResult.canceled) {
      return { status: "cancelled" };
    }

    const [selectedPath] = dialogResult.filePaths;

    if (!selectedPath) {
      return createDialogErrorResult();
    }

    return { status: "success", path: selectedPath };
  } catch {
    return createDialogErrorResult();
  }
}

function createDialogErrorResult(): Extract<
  OpenMarkdownPathDialogResult,
  { readonly status: "error" }
> {
  return {
    status: "error",
    error: {
      code: "dialog-failed",
      message: OPEN_MARKDOWN_FILE_ERROR_MESSAGES["dialog-failed"]
    }
  };
}

function decodeUtf8(fileBuffer: Buffer): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(fileBuffer);
    return text.replace(/\r\n|\r/g, "\n");
  } catch {
    return null;
  }
}

function createErrorResult(code: OpenMarkdownFileErrorCode): DocumentReadResult {
  return {
    status: "error",
    error: {
      code,
      message: OPEN_MARKDOWN_FILE_ERROR_MESSAGES[code]
    }
  };
}

function mapReadError(error: unknown): DocumentReadResult {
  if (isNodeErrorWithCode(error, "ENOENT")) {
    return createErrorResult("file-not-found");
  }

  return createErrorResult("read-failed");
}

function isNodeErrorWithCode(error: unknown, expectedCode: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === expectedCode
  );
}

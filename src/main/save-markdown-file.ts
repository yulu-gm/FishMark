import path from "node:path";
import { writeFile } from "node:fs/promises";
import { dialog } from "electron";

import {
  SAVE_MARKDOWN_FILE_ERROR_MESSAGES,
  type SaveMarkdownFileErrorCode,
  type SaveMarkdownFileResult
} from "../shared/save-markdown-file";

export type SaveMarkdownFileDependencies = {
  writeFile: (
    targetPath: string,
    content: string,
    encoding: BufferEncoding
  ) => Promise<void>;
};

type SaveDialogResult = {
  canceled: boolean;
  filePath?: string;
};

export type SaveMarkdownPathDialogDependencies = {
  showSaveDialog: () => Promise<SaveDialogResult>;
};

export type SaveMarkdownFileToPathInput = {
  tabId: string;
  path: string;
  content: string;
};

export type ShowSaveMarkdownPathDialogInput = {
  currentPath: string | null;
};

export type SaveMarkdownPathDialogResult =
  | { status: "success"; path: string }
  | { status: "cancelled" }
  | { status: "error"; error: { code: "dialog-failed"; message: string } };

const defaultDependencies: SaveMarkdownFileDependencies = {
  writeFile
};

export async function saveMarkdownFileToPath(
  input: SaveMarkdownFileToPathInput,
  dependencies: SaveMarkdownFileDependencies = defaultDependencies
): Promise<SaveMarkdownFileResult> {
  try {
    await dependencies.writeFile(input.path, input.content, "utf8");

    return {
      status: "success",
      document: {
        path: input.path,
        name: path.basename(input.path),
        content: input.content,
        encoding: "utf-8"
      }
    };
  } catch {
    return createErrorResult("write-failed");
  }
}

export async function showSaveMarkdownPathDialog(
  input: ShowSaveMarkdownPathDialogInput,
  dependencies: SaveMarkdownPathDialogDependencies = {
    showSaveDialog: () =>
      dialog.showSaveDialog({
        title: "Save Markdown As",
        ...(input.currentPath ? { defaultPath: input.currentPath } : {}),
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
      })
  }
): Promise<SaveMarkdownPathDialogResult> {
  try {
    const result = await dependencies.showSaveDialog();
    if (result.canceled) {
      return { status: "cancelled" };
    }
    return result.filePath
      ? { status: "success", path: result.filePath }
      : savePathDialogError();
  } catch {
    return savePathDialogError();
  }
}

function savePathDialogError(): Extract<SaveMarkdownPathDialogResult, { status: "error" }> {
  return {
    status: "error",
    error: {
      code: "dialog-failed",
      message: SAVE_MARKDOWN_FILE_ERROR_MESSAGES["dialog-failed"]
    }
  };
}

function createErrorResult(code: SaveMarkdownFileErrorCode): SaveMarkdownFileResult {
  return {
    status: "error",
    error: {
      code,
      message: SAVE_MARKDOWN_FILE_ERROR_MESSAGES[code]
    }
  };
}

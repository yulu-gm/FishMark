import path from "node:path";
import { writeFile } from "node:fs/promises";
import { dialog } from "electron";

import {
  SAVE_MARKDOWN_FILE_ERROR_MESSAGES,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileErrorCode,
  type SaveMarkdownFileInput,
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

export type SaveMarkdownDialogDependencies = {
  saveMarkdownFileToPath: typeof saveMarkdownFileToPath;
  showSaveDialog: () => Promise<SaveDialogResult>;
};

const defaultDependencies: SaveMarkdownFileDependencies = {
  writeFile
};

export async function saveMarkdownFileToPath(
  input: SaveMarkdownFileInput,
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

export async function showSaveMarkdownDialog(
  input: SaveMarkdownFileAsInput,
  dependencies: SaveMarkdownDialogDependencies = {
    saveMarkdownFileToPath,
    showSaveDialog: () =>
      dialog.showSaveDialog({
        title: "Save Markdown As",
        defaultPath: input.currentPath,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
      })
  }
): Promise<SaveMarkdownFileResult> {
  try {
    const dialogResult = await dependencies.showSaveDialog();

    if (dialogResult.canceled) {
      return { status: "cancelled" };
    }

    if (!dialogResult.filePath) {
      return createErrorResult("dialog-failed");
    }

    return dependencies.saveMarkdownFileToPath({
      path: dialogResult.filePath,
      content: input.content
    });
  } catch {
    return createErrorResult("dialog-failed");
  }
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

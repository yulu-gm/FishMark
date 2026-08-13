import { dialog } from "electron";

import { SAVE_MARKDOWN_FILE_ERROR_MESSAGES } from "../shared/save-markdown-file";

type SaveDialogResult = {
  canceled: boolean;
  filePath?: string;
};

export type SaveMarkdownPathDialogDependencies = {
  showSaveDialog: () => Promise<SaveDialogResult>;
};

export type ShowSaveMarkdownPathDialogInput = {
  currentPath: string | null;
};

export type SaveMarkdownPathDialogResult =
  | { status: "success"; path: string }
  | { status: "cancelled" }
  | { status: "error"; error: { code: "dialog-failed"; message: string } };

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

import type { OpenMarkdownDocument } from "./open-markdown-file";

export type SaveMarkdownFileErrorCode = "dialog-failed" | "write-failed";

export type SaveMarkdownDocument = OpenMarkdownDocument;

export type SaveMarkdownFileInput = {
  tabId: string;
  path: string;
  content: string;
};

export type SaveMarkdownFileAsInput = {
  tabId: string;
  currentPath: string | null;
  content: string;
};

export type SaveMarkdownFileResult =
  | {
      status: "success";
      document: SaveMarkdownDocument;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "error";
      error: {
        code: SaveMarkdownFileErrorCode;
        message: string;
      };
    };

export const SAVE_MARKDOWN_FILE_CHANNEL = "fishmark:save-markdown-file";
export const SAVE_MARKDOWN_FILE_AS_CHANNEL = "fishmark:save-markdown-file-as";

export const SAVE_MARKDOWN_FILE_ERROR_MESSAGES: Record<SaveMarkdownFileErrorCode, string> = {
  "dialog-failed": "The save dialog could not be opened.",
  "write-failed": "The Markdown file could not be saved."
};

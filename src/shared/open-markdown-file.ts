export type OpenMarkdownFileErrorCode =
  | "dialog-failed"
  | "file-not-found"
  | "not-a-file"
  | "read-failed"
  | "non-utf8";

export type OpenMarkdownDocument = {
  path: string;
  name: string;
  content: string;
  encoding: "utf-8";
};

export type OpenMarkdownFileResult =
  | {
      status: "success";
      document: OpenMarkdownDocument;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "error";
      error: {
        code: OpenMarkdownFileErrorCode;
        message: string;
      };
    };

export const OPEN_MARKDOWN_FILE_CHANNEL = "yulora:open-markdown-file";
export const OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL = "yulora:open-markdown-file-from-path";

export const OPEN_MARKDOWN_FILE_ERROR_MESSAGES: Record<OpenMarkdownFileErrorCode, string> = {
  "dialog-failed": "The file picker could not be opened.",
  "file-not-found": "Selected file could not be found.",
  "not-a-file": "Selected path is not a file.",
  "read-failed": "The Markdown file could not be read.",
  "non-utf8": "Only UTF-8 Markdown files are supported right now."
};

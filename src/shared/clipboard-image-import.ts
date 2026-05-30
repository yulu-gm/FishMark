export const IMPORT_CLIPBOARD_IMAGE_CHANNEL = "fishmark:import-clipboard-image";

export type ImportClipboardImageInput = {
  documentPath: string | null;
};

export type ImportClipboardImageResult =
  | {
      status: "success";
      markdown: string;
      storage: "assets" | "temporary";
      filePath: string;
      relativePath: string | null;
    }
  | {
      status: "error";
      error: {
        code: "no-image" | "image-too-large" | "write-failed";
        message: string;
      };
    };

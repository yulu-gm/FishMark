import type {
  WorkspaceMutationResult,
  WorkspaceSaveMutationResult
} from "@fishmark/workspace-domain";

import type {
  PersistedMarkdownDocument,
  SaveDocumentResult
} from "./ports";

export function requirePersistedMarkdownDocument(
  value: unknown,
  adapterName: string
): PersistedMarkdownDocument {
  if (
    typeof value !== "object" ||
    value === null ||
    !("path" in value) ||
    typeof value.path !== "string" ||
    value.path.trim().length === 0 ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !("content" in value) ||
    typeof value.content !== "string" ||
    !("encoding" in value) ||
    value.encoding !== "utf-8"
  ) {
    throw new Error(`${adapterName} returned an invalid persisted Markdown document.`);
  }
  return {
    path: value.path,
    name: value.name,
    content: value.content,
    encoding: value.encoding
  };
}

export function workspaceMutationSaveError(
  result: WorkspaceMutationResult | WorkspaceSaveMutationResult
): Extract<SaveDocumentResult, { readonly status: "error" }> | null {
  if (result.kind === "applied") return null;
  if (result.kind === "file-identity-conflict") {
    return saveError("file-identity-conflict");
  }
  return saveError(result.reason);
}

export function saveError(
  code: Extract<SaveDocumentResult, { readonly status: "error" }>["error"]["code"]
): Extract<SaveDocumentResult, { readonly status: "error" }> {
  const messages = {
    "dialog-failed": "The file picker could not be opened.",
    "write-failed": "The Markdown file could not be written.",
    "disk-version-conflict": "The file changed on disk since it was opened or last saved. Choose how to resolve the conflict before saving.",
    "file-identity-conflict": "That file is already open in another tab.",
    "file-identity-changed": "The selected file changed while preparing to save. Please try again.",
    "tab-missing": "The tab no longer exists.",
    "window-missing": "The owner window no longer exists.",
    "window-changed": "The tab moved to another window.",
    "revision-changed": "The document changed before the save could be committed.",
    "file-identity-missing": "The tab has no canonical file identity.",
    "runtime-context-unavailable": "The owner window is no longer available."
  } as const;
  return { status: "error", error: { code, message: messages[code] } };
}

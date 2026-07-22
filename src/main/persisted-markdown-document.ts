import type { OpenMarkdownDocument } from "../shared/open-markdown-file";

export function requirePersistedMarkdownDocument(
  value: unknown,
  adapterName: string
): OpenMarkdownDocument {
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

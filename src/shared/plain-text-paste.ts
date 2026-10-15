export const REQUEST_PLAIN_TEXT_PASTE_CHANNEL = "fishmark:request-plain-text-paste";

export type PlainTextPasteInput = {
  tabId: string;
  source: "shortcut" | "context-menu";
};

export type ShortcutId =
  | "toggle-strong"
  | "toggle-emphasis"
  | "toggle-heading-1"
  | "toggle-heading-2"
  | "toggle-heading-3"
  | "toggle-heading-4"
  | "toggle-bullet-list"
  | "toggle-blockquote"
  | "toggle-code-fence"
  | "table-next-cell"
  | "table-previous-cell"
  | "table-insert-row-below"
  | "table-move-up"
  | "table-move-down"
  | "table-enter-next-row";

export type ShortcutDescriptor = {
  readonly id: ShortcutId;
  readonly key: string;
  readonly label: string;
};

export type ShortcutGroupId = "default-text" | "table-editing";

export type ShortcutGroup = {
  readonly id: ShortcutGroupId;
  readonly label: string;
  readonly shortcuts: readonly ShortcutDescriptor[];
};

const DEFAULT_TEXT_SHORTCUTS: readonly ShortcutDescriptor[] = [
  { id: "toggle-strong", key: "Mod-b", label: "Bold" },
  { id: "toggle-emphasis", key: "Mod-i", label: "Italic" },
  { id: "toggle-heading-1", key: "Mod-1", label: "Heading 1" },
  { id: "toggle-heading-2", key: "Mod-2", label: "Heading 2" },
  { id: "toggle-heading-3", key: "Mod-3", label: "Heading 3" },
  { id: "toggle-heading-4", key: "Mod-4", label: "Heading 4" },
  { id: "toggle-bullet-list", key: "Mod-Shift-7", label: "Bullet List" },
  { id: "toggle-blockquote", key: "Mod-Shift-9", label: "Blockquote" },
  { id: "toggle-code-fence", key: "Mod-Alt-Shift-c", label: "Code Block" }
];

const TABLE_SHORTCUTS: readonly ShortcutDescriptor[] = [
  { id: "table-next-cell", key: "Tab", label: "Next Cell" },
  { id: "table-previous-cell", key: "Shift-Tab", label: "Previous Cell" },
  { id: "table-insert-row-below", key: "Mod-Enter", label: "Insert Row Below" },
  { id: "table-move-up", key: "ArrowUp", label: "Row Above" },
  { id: "table-move-down", key: "ArrowDown", label: "Row Below" },
  { id: "table-enter-next-row", key: "Enter", label: "Next Row / Exit" }
];

export const DEFAULT_TEXT_SHORTCUT_GROUP: ShortcutGroup = {
  id: "default-text",
  label: "Text",
  shortcuts: DEFAULT_TEXT_SHORTCUTS
};

export const TABLE_EDITING_SHORTCUT_GROUP: ShortcutGroup = {
  id: "table-editing",
  label: "Table",
  shortcuts: TABLE_SHORTCUTS
};

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP
];

const formatShortcutHintToken = (token: string) => {
  if (token === "Mod") {
    return "";
  }

  if (token.length === 1) {
    return token.toUpperCase();
  }

  return token.charAt(0).toUpperCase() + token.slice(1);
};

export const formatShortcutHintKey = (key: string, platform: string) => {
  const modifier = platform === "darwin" ? "Cmd" : "Ctrl";

  return key
    .split("-")
    .map((token) => (token === "Mod" ? modifier : formatShortcutHintToken(token)))
    .filter(Boolean)
    .join("+");
};

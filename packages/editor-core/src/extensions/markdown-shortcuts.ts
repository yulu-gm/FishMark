import type { EditorView, KeyBinding } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import {
  runTableInsertRowBelow,
  runTableMoveDown,
  runTableMoveDownOrExit,
  runTableMoveUp,
  runTableNextCell,
  runTablePreviousCell,
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleEmphasis,
  toggleHeading,
  toggleStrong
} from "../commands";

export type TextEditingShortcut = {
  id:
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
  key: string;
  label: string;
  run: TextEditingShortcutRunner;
};

type TextEditingShortcutRunner = (
  view: EditorView,
  activeState: ActiveBlockState
) => boolean;

export type ShortcutGroupId = "default-text" | "table-editing";

export type ShortcutGroup = {
  id: ShortcutGroupId;
  label: string;
  shortcuts: readonly TextEditingShortcut[];
};

const defaultTextEditingShortcuts: readonly TextEditingShortcut[] = [
  { id: "toggle-strong", key: "Mod-b", label: "Bold", run: toggleStrong },
  { id: "toggle-emphasis", key: "Mod-i", label: "Italic", run: toggleEmphasis },
  {
    id: "toggle-heading-1",
    key: "Mod-1",
    label: "Heading 1",
    run: (view, activeState) => toggleHeading(1)(view, activeState)
  },
  {
    id: "toggle-heading-2",
    key: "Mod-2",
    label: "Heading 2",
    run: (view, activeState) => toggleHeading(2)(view, activeState)
  },
  {
    id: "toggle-heading-3",
    key: "Mod-3",
    label: "Heading 3",
    run: (view, activeState) => toggleHeading(3)(view, activeState)
  },
  {
    id: "toggle-heading-4",
    key: "Mod-4",
    label: "Heading 4",
    run: (view, activeState) => toggleHeading(4)(view, activeState)
  },
  {
    id: "toggle-bullet-list",
    key: "Mod-Shift-7",
    label: "Bullet List",
    run: toggleBulletList
  },
  {
    id: "toggle-blockquote",
    key: "Mod-Shift-9",
    label: "Blockquote",
    run: toggleBlockquote
  },
  {
    id: "toggle-code-fence",
    key: "Mod-Alt-Shift-c",
    label: "Code Block",
    run: toggleCodeFence
  }
];

const tableEditingShortcuts: readonly TextEditingShortcut[] = [
  {
    id: "table-next-cell",
    key: "Tab",
    label: "Next Cell",
    run: runTableNextCell
  },
  {
    id: "table-previous-cell",
    key: "Shift-Tab",
    label: "Previous Cell",
    run: runTablePreviousCell
  },
  {
    id: "table-insert-row-below",
    key: "Mod-Enter",
    label: "Insert Row Below",
    run: runTableInsertRowBelow
  },
  {
    id: "table-move-up",
    key: "ArrowUp",
    label: "Row Above",
    run: runTableMoveUp
  },
  {
    id: "table-move-down",
    key: "ArrowDown",
    label: "Row Below",
    run: runTableMoveDown
  },
  {
    id: "table-enter-next-row",
    key: "Enter",
    label: "Next Row / Exit",
    run: runTableMoveDownOrExit
  }
];

export const DEFAULT_TEXT_SHORTCUT_GROUP: ShortcutGroup = {
  id: "default-text",
  label: "Text",
  shortcuts: defaultTextEditingShortcuts
};

export const TABLE_EDITING_SHORTCUT_GROUP: ShortcutGroup = {
  id: "table-editing",
  label: "Table",
  shortcuts: tableEditingShortcuts
};

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP
];

export const TEXT_EDITING_SHORTCUTS = DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts;

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

export const createTextEditingShortcutKeymap = (
  getActiveBlockState: () => ActiveBlockState
): KeyBinding[] =>
  DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts.map(({ key, run }) => ({
    key,
    run: (view) => run(view, getActiveBlockState())
  }));

function createShortcutKeymap(
  shortcuts: readonly TextEditingShortcut[],
  getActiveBlockState: () => ActiveBlockState
): KeyBinding[] {
  return shortcuts.map(({ key, run }) => ({
    key,
    run: (view) => run(view, getActiveBlockState())
  }));
}

export function createGroupedShortcutKeymaps(getActiveBlockState: () => ActiveBlockState): {
  defaultText: KeyBinding[];
  tableEditing: KeyBinding[];
} {
  return {
    defaultText: createShortcutKeymap(
      DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts,
      getActiveBlockState
    ),
    tableEditing: createShortcutKeymap(
      TABLE_EDITING_SHORTCUT_GROUP.shortcuts,
      getActiveBlockState
    )
  };
}

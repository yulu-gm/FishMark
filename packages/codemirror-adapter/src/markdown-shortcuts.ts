import type { EditorView, KeyBinding } from "@codemirror/view";

import type { ActiveBlockState } from "@fishmark/editor-model";
import {
  runTableInsertRowBelow,
  runTableMoveDown,
  runTableMoveDownOrExit,
  runTableMoveUp,
  runTableNextCell,
  runTablePreviousCell
} from "./table-commands";
import {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading
} from "./toggle-block-commands";
import { toggleEmphasis, toggleStrong } from "./toggle-inline-commands";
import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  SHORTCUT_GROUPS,
  TABLE_EDITING_SHORTCUT_GROUP,
  formatShortcutHintKey,
  type ShortcutDescriptor,
  type ShortcutGroup,
  type ShortcutGroupId,
  type ShortcutId
} from "./shortcut-descriptors";

type TextEditingShortcutRunner = (
  view: EditorView,
  activeState: ActiveBlockState
) => boolean;

export type TextEditingShortcut = ShortcutDescriptor & {
  readonly run: TextEditingShortcutRunner;
};

const shortcutRunners: Readonly<Record<ShortcutId, TextEditingShortcutRunner>> = {
  "toggle-strong": toggleStrong,
  "toggle-emphasis": toggleEmphasis,
  "toggle-heading-1": (view, activeState) => toggleHeading(1)(view, activeState),
  "toggle-heading-2": (view, activeState) => toggleHeading(2)(view, activeState),
  "toggle-heading-3": (view, activeState) => toggleHeading(3)(view, activeState),
  "toggle-heading-4": (view, activeState) => toggleHeading(4)(view, activeState),
  "toggle-bullet-list": toggleBulletList,
  "toggle-blockquote": toggleBlockquote,
  "toggle-code-fence": toggleCodeFence,
  "table-next-cell": runTableNextCell,
  "table-previous-cell": runTablePreviousCell,
  "table-insert-row-below": runTableInsertRowBelow,
  "table-move-up": runTableMoveUp,
  "table-move-down": runTableMoveDown,
  "table-enter-next-row": runTableMoveDownOrExit
};

function bindShortcutRunners(
  shortcuts: readonly ShortcutDescriptor[]
): readonly TextEditingShortcut[] {
  return shortcuts.map((shortcut) => ({
    ...shortcut,
    run: shortcutRunners[shortcut.id]
  }));
}

export const TEXT_EDITING_SHORTCUTS = bindShortcutRunners(
  DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts
);

const TABLE_EDITING_SHORTCUTS = bindShortcutRunners(
  TABLE_EDITING_SHORTCUT_GROUP.shortcuts
);

export {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  SHORTCUT_GROUPS,
  TABLE_EDITING_SHORTCUT_GROUP,
  formatShortcutHintKey,
  type ShortcutGroup,
  type ShortcutGroupId
} from "./shortcut-descriptors";

export const createTextEditingShortcutKeymap = (
  getActiveBlockState: () => ActiveBlockState
): KeyBinding[] =>
  createShortcutKeymap(TEXT_EDITING_SHORTCUTS, getActiveBlockState);

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
    defaultText: createShortcutKeymap(TEXT_EDITING_SHORTCUTS, getActiveBlockState),
    tableEditing: createShortcutKeymap(TABLE_EDITING_SHORTCUTS, getActiveBlockState)
  };
}

import type { EditorView, KeyBinding } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import {
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
    | "toggle-code-fence";
  key: string;
  label: string;
  run: TextEditingShortcutRunner;
};

type TextEditingShortcutRunner = (
  view: EditorView,
  activeState: ActiveBlockState
) => boolean;

export const TEXT_EDITING_SHORTCUTS: readonly TextEditingShortcut[] = [
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
  TEXT_EDITING_SHORTCUTS.map(({ key, run }) => ({
    key,
    run: (view) => run(view, getActiveBlockState())
  }));

import type { CSSProperties } from "react";

import { formatShortcutHintKey, type TextEditingShortcut } from "@yulora/editor-core";

const HIDE_ANIMATION_DURATION = "180ms";

type ShortcutHintOverlayProps = {
  visible: boolean;
  platform: string;
  shortcuts: readonly TextEditingShortcut[];
};

export function ShortcutHintOverlay({ visible, platform, shortcuts }: ShortcutHintOverlayProps) {
  const style = {
    ["--shortcut-hint-overlay-duration" as string]: HIDE_ANIMATION_DURATION
  } as CSSProperties;

  if (!visible) {
    return null;
  }

  return (
    <div
      className="shortcut-hint-overlay"
      data-yulora-region="shortcut-hint-overlay"
      data-state="open"
      aria-hidden="true"
      role="presentation"
      style={style}
    >
      <ul className="shortcut-hint-overlay-list">
        {shortcuts.map(({ id, key, label }) => (
          <li
            key={id}
            className="shortcut-hint-overlay-item"
          >
            <span className="shortcut-hint-overlay-key">{formatShortcutHintKey(key, platform)}</span>
            <span className="shortcut-hint-overlay-label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

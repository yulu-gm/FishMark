import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { formatShortcutHintKey, type TextEditingShortcut } from "@yulora/editor-core";

const HIDE_ANIMATION_DURATION = "180ms";

type ShortcutHintOverlayProps = {
  visible: boolean;
  platform: string;
  shortcuts: readonly TextEditingShortcut[];
};

type OverlayState = "hidden" | "open" | "closing";
type OverlayRenderState = {
  phase: OverlayState;
  visible: boolean;
};

function ShortcutHintOverlayContent({
  platform,
  shortcuts
}: Omit<ShortcutHintOverlayProps, "visible">) {
  return (
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
  );
}

export function ShortcutHintOverlay({ visible, platform, shortcuts }: ShortcutHintOverlayProps) {
  const [renderState, setRenderState] = useState<OverlayRenderState>({
    phase: visible ? "open" : "hidden",
    visible
  });
  const style = {
    ["--shortcut-hint-overlay-duration" as string]: HIDE_ANIMATION_DURATION
  } as CSSProperties;

  if (visible !== renderState.visible) {
    setRenderState({
      visible,
      phase: visible ? "open" : renderState.phase === "hidden" ? "hidden" : "closing"
    });
  }

  const state = visible !== renderState.visible
    ? visible
      ? "open"
      : renderState.phase === "hidden"
        ? "hidden"
        : "closing"
    : renderState.phase;

  useEffect(() => {
    if (state !== "closing") {
      return undefined;
    }

    const hideTimer = window.setTimeout(() => {
      setRenderState({
        visible: false,
        phase: "hidden"
      });
    }, Number.parseInt(HIDE_ANIMATION_DURATION, 10));

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [state]);

  if (state === "hidden") {
    return null;
  }

  return (
    <div
      className="shortcut-hint-overlay"
      data-yulora-region="shortcut-hint-overlay"
      data-state={state}
      aria-hidden="true"
      role="presentation"
      style={style}
    >
      <ShortcutHintOverlayContent
        platform={platform}
        shortcuts={shortcuts}
      />
    </div>
  );
}

export function ShortcutHintOverlayMeasure({
  platform,
  shortcuts
}: Omit<ShortcutHintOverlayProps, "visible">) {
  return (
    <div
      className="shortcut-hint-overlay shortcut-hint-overlay-measure"
      data-yulora-region="shortcut-hint-overlay-measure"
      aria-hidden="true"
      role="presentation"
    >
      <ShortcutHintOverlayContent
        platform={platform}
        shortcuts={shortcuts}
      />
    </div>
  );
}

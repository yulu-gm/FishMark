import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP,
  formatShortcutHintKey,
  type ShortcutGroup,
  type ShortcutGroupId
} from "@fishmark/codemirror-adapter";

const CONTAINER_FADE_DURATION_MS = 105;
const ITEM_STAGGER_DURATION_MS = 18;
const ITEM_ANIMATION_DURATION_MS = 105;

type ShortcutHintOverlayProps = {
  visible: boolean;
  platform: string;
  groupId: ShortcutGroupId;
};

type OverlayState = "hidden" | "open" | "closing";
type OverlayRenderState = {
  phase: OverlayState;
  visible: boolean;
};

function ShortcutHintOverlayContent({
  platform,
  group
}: Omit<ShortcutHintOverlayProps, "visible">) {
  return (
    <ul
      key={group.id}
      className="shortcut-hint-overlay-list"
      data-shortcut-group={group.id}
    >
      {group.shortcuts.map(({ id, key, label }, index) => (
        <li
          key={id}
          className="shortcut-hint-overlay-item"
          style={
            {
              ["--shortcut-index" as string]: index
            } as CSSProperties
          }
        >
          <span className="shortcut-hint-overlay-key">{formatShortcutHintKey(key, platform)}</span>
          <span className="shortcut-hint-overlay-label">{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ShortcutHintOverlay({ visible, platform, groupId }: ShortcutHintOverlayProps) {
  const group: ShortcutGroup =
    groupId === "table-editing"
      ? TABLE_EDITING_SHORTCUT_GROUP
      : DEFAULT_TEXT_SHORTCUT_GROUP;
  const [renderState, setRenderState] = useState<OverlayRenderState>({
    phase: visible ? "open" : "hidden",
    visible
  });
  const closeAnimationDurationMs =
    ITEM_ANIMATION_DURATION_MS +
    ITEM_STAGGER_DURATION_MS * Math.max(group.shortcuts.length - 1, 0);
  const style = {
    ["--shortcut-hint-overlay-duration" as string]: `${CONTAINER_FADE_DURATION_MS}ms`,
    ["--shortcut-hint-overlay-item-duration" as string]: `${ITEM_ANIMATION_DURATION_MS}ms`,
    ["--shortcut-hint-overlay-item-stagger" as string]: `${ITEM_STAGGER_DURATION_MS}ms`
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
    }, closeAnimationDurationMs);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [closeAnimationDurationMs, state]);

  if (state === "hidden") {
    return null;
  }

  return (
    <div
      className="shortcut-hint-overlay"
      data-fishmark-region="shortcut-hint-overlay"
      data-state={state}
      data-shortcut-group={group.id}
      aria-hidden="true"
      role="presentation"
      style={style}
    >
      <div className="shortcut-hint-overlay-panel">
        <ShortcutHintOverlayContent
          platform={platform}
          group={group}
        />
      </div>
    </div>
  );
}

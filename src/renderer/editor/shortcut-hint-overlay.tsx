import { useEffect, useRef, useState } from "react";

import { formatShortcutHintKey, type TextEditingShortcut } from "@yulora/editor-core";

const HIDE_ANIMATION_MS = 180;

type ShortcutHintOverlayProps = {
  visible: boolean;
  platform: string;
  shortcuts: readonly TextEditingShortcut[];
};

type OverlayState = "open" | "closing";

export function ShortcutHintOverlay({ visible, platform, shortcuts }: ShortcutHintOverlayProps) {
  const [isRendered, setIsRendered] = useState(visible);
  const [state, setState] = useState<OverlayState>(visible ? "open" : "closing");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (visible) {
      setIsRendered(true);
      setState("open");
      return;
    }

    if (!isRendered) {
      return;
    }

    setState("closing");
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setIsRendered(false);
    }, HIDE_ANIMATION_MS);

    return () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [isRendered, visible]);

  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
    },
    []
  );

  if (!isRendered) {
    return null;
  }

  return (
    <section
      className="shortcut-hint-overlay"
      data-yulora-region="shortcut-hint-overlay"
      data-state={state}
      aria-label="Text editing shortcuts"
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
    </section>
  );
}
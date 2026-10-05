import { useEffect, useRef, useState } from "react";
const SHORTCUT_HINT_HOLD_DELAY_MS = 1000;
const PRIMARY_MODIFIER_LEFT_LOCATION = 1;
const PRIMARY_MODIFIER_RIGHT_LOCATION = 2;

function getPrimaryShortcutModifierId(
  event: KeyboardEvent,
  primaryModifierKey: "Control" | "Meta"
): string | null {
  if (event.key !== primaryModifierKey) {
    return null;
  }

  if (
    event.code === `${primaryModifierKey}Left` ||
    event.code === `${primaryModifierKey}Right`
  ) {
    return event.code;
  }

  if (event.location === PRIMARY_MODIFIER_LEFT_LOCATION) {
    return `${primaryModifierKey}Left`;
  }

  if (event.location === PRIMARY_MODIFIER_RIGHT_LOCATION) {
    return `${primaryModifierKey}Right`;
  }

  return primaryModifierKey;
}


export function useShortcutHintPresentation({ platform, isDocumentOpen, isEditorFocused, onWindowBlur }: { platform: NodeJS.Platform; isDocumentOpen: boolean; isEditorFocused: boolean; onWindowBlur: () => void }) {
  const [isShortcutHintArmed, setIsShortcutHintArmed] = useState(false);
  const shortcutHintHoldTimerRef = useRef<number | null>(null);
  const pressedShortcutModifiersRef = useRef<Set<string>>(new Set());
  const shortcutHintModifierKey: "Control" | "Meta" = platform === "darwin" ? "Meta" : "Control";
  const isShortcutHintVisible = isDocumentOpen && isEditorFocused && isShortcutHintArmed;

  function clearShortcutHintHoldTimer(): void {
    if (shortcutHintHoldTimerRef.current !== null) {
      clearTimeout(shortcutHintHoldTimerRef.current);
      shortcutHintHoldTimerRef.current = null;
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      const wasHeld = pressedShortcutModifiersRef.current.size > 0;
      pressedShortcutModifiersRef.current.add(modifierId);

      if (wasHeld || shortcutHintHoldTimerRef.current !== null) {
        return;
      }

      shortcutHintHoldTimerRef.current = window.setTimeout(() => {
        shortcutHintHoldTimerRef.current = null;

        if (
          pressedShortcutModifiersRef.current.size > 0 &&
          isDocumentOpen &&
          isEditorFocused
        ) {
          setIsShortcutHintArmed(true);
        }
      }, SHORTCUT_HINT_HOLD_DELAY_MS);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      pressedShortcutModifiersRef.current.delete(modifierId);

      if (pressedShortcutModifiersRef.current.size === 0) {
        clearShortcutHintHoldTimer();
        setIsShortcutHintArmed(false);
      }
    };

    const handleWindowBlur = () => {
      clearShortcutHintHoldTimer();
      pressedShortcutModifiersRef.current.clear();
      onWindowBlur();
      setIsShortcutHintArmed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      clearShortcutHintHoldTimer();
    };
  }, [isDocumentOpen, isEditorFocused, onWindowBlur, shortcutHintModifierKey]);

  useEffect(() => {
    if (isDocumentOpen) {
      return;
    }

    clearShortcutHintHoldTimer();
    pressedShortcutModifiersRef.current.clear();
    onWindowBlur();
  }, [isDocumentOpen, onWindowBlur]);

  // Clear local arming at the no-document presentation boundary.
  if (!isDocumentOpen && isShortcutHintArmed) {
    setIsShortcutHintArmed(false);
  }


  return { isShortcutHintVisible };
}

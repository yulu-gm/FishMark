type ActivatableWindow = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
};

/** Focus alone cannot bring a hidden or minimized Windows window back. */
export function activateEditorWindow(window: ActivatableWindow): boolean {
  if (window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  return true;
}

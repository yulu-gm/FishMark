const EDITOR_INTERACTIVE_TARGET_SELECTOR = [
  ".cm-table-widget",
  ".cm-table-widget-input",
  "input",
  "textarea",
  "[contenteditable='true']"
].join(", ");

const WORKSPACE_NON_EDITOR_INTERACTIVE_SELECTOR = [
  ".outline-panel",
  ".outline-entry",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']"
].join(", ");

function isPointerInsideRect(event: MouseEvent, element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

export function isEditingContentPointerEvent(
  event: MouseEvent,
  editorContainer: HTMLElement
): boolean {
  const target = event.target;

  if (target instanceof Element && target.closest(EDITOR_INTERACTIVE_TARGET_SELECTOR)) {
    return true;
  }

  const contentElement = editorContainer.querySelector<HTMLElement>(".cm-content");
  return contentElement ? isPointerInsideRect(event, contentElement) : false;
}

export function isEditorScrollbarPointerEvent(
  event: MouseEvent,
  editorContainer: HTMLElement
): boolean {
  return editorScrollbarPointerAxis(event, editorContainer) !== null;
}

export function editorScrollbarPointerAxis(
  event: MouseEvent,
  editorContainer: HTMLElement
): "vertical" | "horizontal" | null {
  const target = event.target;
  const scrollerElement = target instanceof Element
    ? target.closest<HTMLElement>(".cm-scroller")
    : null;

  if (!scrollerElement || !editorContainer.contains(scrollerElement)) {
    return null;
  }

  const rect = scrollerElement.getBoundingClientRect();
  const verticalScrollbarWidth = Math.max(0, scrollerElement.offsetWidth - scrollerElement.clientWidth);
  const horizontalScrollbarHeight = Math.max(0, scrollerElement.offsetHeight - scrollerElement.clientHeight);
  const hasVerticalScrollbar =
    scrollerElement.scrollHeight > scrollerElement.clientHeight && verticalScrollbarWidth > 0;
  const hasHorizontalScrollbar =
    scrollerElement.scrollWidth > scrollerElement.clientWidth && horizontalScrollbarHeight > 0;

  if (hasVerticalScrollbar &&
      event.clientX >= rect.right - verticalScrollbarWidth &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom) return "vertical";
  if (hasHorizontalScrollbar &&
      event.clientY >= rect.bottom - horizontalScrollbarHeight &&
      event.clientY <= rect.bottom &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right) return "horizontal";
  return null;
}

export function isWorkspaceNonEditorInteractiveTarget(target: Element): boolean {
  return Boolean(target.closest(WORKSPACE_NON_EDITOR_INTERACTIVE_SELECTOR));
}

export function isFocusedEditorInteractiveElement(editorContainer: HTMLElement | null): boolean {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof Element) || !editorContainer?.contains(activeElement)) {
    return false;
  }

  return Boolean(activeElement.closest(EDITOR_INTERACTIVE_TARGET_SELECTOR));
}

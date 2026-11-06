// Keep Select All inside the focused cell's editing host. Chromium's native
// command can focus the surrounding CodeMirror content and lose this selection.
export function selectTableCellContents(element: Element | null): boolean {
  if (!(element instanceof HTMLElement) || !element.classList.contains("cm-table-widget-input")) return false;
  const selection = element.ownerDocument.getSelection();
  if (!selection) return false;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

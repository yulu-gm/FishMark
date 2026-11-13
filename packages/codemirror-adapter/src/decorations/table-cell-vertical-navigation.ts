import { parseInlineAst, projectTableCellSource, type InlineNode, type InlineRoot } from "@fishmark/markdown-engine";

const hardBreakSelector = "[data-table-cell-hard-break]";
const breakCaretObservers = new WeakMap<HTMLElement, AbortController>();

type BreakRange = { from: number; to: number };

export function tableCellHardBreaks(text: string, inline?: InlineRoot, source?: string): BreakRange[] {
  if (!/<br\b/iu.test(text)) return [];
  const root = inline ?? parseInlineAst(text, 0, text.length);
  const start = root.startOffset;
  const raw = source?.slice(start, root.endOffset) ?? text;
  const offsets = raw === text ? null : projectTableCellSource(raw).boundaries;
  const result: BreakRange[] = [];
  const visit = (nodes: readonly InlineNode[]) => {
    for (const node of nodes) {
      if (node.type === "hardBreak") {
        const from = offsets ? offsets.indexOf(node.startOffset - start) : node.startOffset - start;
        const to = offsets ? offsets.indexOf(node.endOffset - start) : node.endOffset - start;
        if (from >= 0 && to > from && /^<br\s*\/?>$/iu.test(text.slice(from, to))) result.push({ from, to });
      } else if ("children" in node) visit(node.children);
    }
  };
  visit(root.children);
  return result;
}

export function appendTableCellHardBreak(fragment: DocumentFragment, text: string): void {
  const doc = fragment.ownerDocument;
  const wrapper = doc.createElement("span");
  wrapper.dataset.tableCellHardBreak = "";
  const marker = doc.createElement("span");
  marker.hidden = true;
  marker.textContent = text;
  // 真实 BR 提供浏览器的行布局；隐藏的原标记保留 textContent 及源偏移。
  wrapper.append(doc.createElement("br"), marker);
  fragment.append(wrapper);
}

export function hasMatchingTableCellHardBreaks(editor: HTMLElement, expected: readonly BreakRange[]): boolean {
  const markers = Array.from(editor.querySelectorAll<HTMLElement>(`${hardBreakSelector} > [hidden]`));
  if (markers.length !== expected.length) return false;
  const prefix = editor.ownerDocument.createRange();
  prefix.selectNodeContents(editor);
  return markers.every((marker, index) => {
    if (marker.previousSibling?.nodeName !== "BR") return false;
    prefix.setEndBefore(marker);
    const from = prefix.toString().length;
    return from === expected[index]!.from && from + (marker.textContent?.length ?? 0) === expected[index]!.to;
  });
}

export function normalizeTableCellBreakCaret(editor: HTMLElement): void {
  const selection = editor.ownerDocument.getSelection();
  const node = selection?.focusNode;
  if (!selection?.isCollapsed || !node || !editor.contains(node)) return;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const marker = element?.closest(`${hardBreakSelector} > [hidden]`);
  const wrapper = marker?.parentElement;
  const br = wrapper?.querySelector("br");
  if (!wrapper || !br) return;
  // 源选区恢复可能落在隐藏标记内部；只修正这种位置，避免重复触发 selectionchange。
  const range = editor.ownerDocument.createRange();
  if (selection.focusOffset === 0) range.setStartBefore(br);
  else if (wrapper.nextSibling?.nodeType === Node.TEXT_NODE) range.setStart(wrapper.nextSibling, 0);
  else range.setStartAfter(wrapper);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function observeTableCellBreakCaret(editor: HTMLElement): void {
  stopObservingTableCellBreakCaret(editor);
  const observer = new AbortController();
  breakCaretObservers.set(editor, observer);
  const doc = editor.ownerDocument;
  doc.addEventListener("selectionchange", () => {
    if (doc.activeElement === editor && editor.dataset.tableCellComposing !== "true") {
      normalizeTableCellBreakCaret(editor);
    }
  }, { signal: observer.signal });
}

export function stopObservingTableCellBreakCaret(editor: HTMLElement): void {
  breakCaretObservers.get(editor)?.abort();
  breakCaretObservers.delete(editor);
}

export function canLeaveTableCellVertically(editor: HTMLElement, event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
      event.isComposing || event.keyCode === 229 || editor.dataset.tableCellComposing === "true") return false;
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.isCollapsed || selection.rangeCount !== 1 || !editor.contains(selection.focusNode)) return false;

  const caret = selection.getRangeAt(0);
  // jsdom 没有排版；真实浏览器始终根据当前单元格的行框判断。
  if (typeof caret.getClientRects !== "function") return true;
  const content = caret.cloneRange();
  content.selectNodeContents(editor);
  const lines = readRects(content);
  if (lines.length === 0) return true;

  let caretRects = readRects(caret);
  if (caretRects.length === 0) {
    // 连续 BR 的空行通常以元素边界表示，此时 Range 本身没有矩形。
    const side = content.cloneRange();
    side.setStart(caret.startContainer, caret.startOffset);
    const following = readRects(side)[0];
    if (following) caretRects = [following];
    else {
      side.selectNodeContents(editor);
      side.setEnd(caret.startContainer, caret.startOffset);
      const preceding = readRects(side).at(-1);
      if (preceding) caretRects = [preceding];
    }
  }
  if (caretRects.length === 0) return false;

  const down = event.key === "ArrowDown";
  const edge = lines.reduce((outer, rect) =>
    down ? Math.max(outer, centerY(rect)) : Math.min(outer, centerY(rect)), down ? -Infinity : Infinity);
  // 自动折行处同一个 DOM 偏移可能对应两个行框。无法确定时交给原生移动，避免提前跨格。
  return caretRects.every(rect => Math.abs(centerY(rect) - edge) <= rect.height / 2);
}

function readRects(range: Range): DOMRect[] {
  return Array.from(range.getClientRects()).filter(rect => Number.isFinite(rect.top) && rect.height > 0);
}

function centerY(rect: DOMRect): number {
  return rect.top + rect.height / 2;
}

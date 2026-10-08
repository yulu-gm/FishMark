import type { EditorView } from "@codemirror/view";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { readEditableSelection } from "./decorations/table-widget";
import { readCompositionState, readEditorStructureCache } from "./transaction-adapter";

/** 将受控表格编辑 DOM 的范围选区映射到当前源文档，不改写 CodeMirror 状态。 */
export function readEditorSelection(view: EditorView): { anchor: number; head: number } {
  const selection = view.state.selection.main;
  const canonical = { anchor: selection.anchor, head: selection.head };
  const document = view.dom.ownerDocument;
  const editor = document.activeElement;
  if (!(editor instanceof HTMLElement) || !view.dom.contains(editor) ||
      !editor.matches(".cm-table-widget-input") || editor.contentEditable !== "true" ||
      editor.dataset.tableCellRenderMode !== "plain" ||
      readCompositionState(view.state).active) return canonical;
  const domSelection = document.getSelection();
  if (!domSelection || domSelection.rangeCount !== 1 || domSelection.isCollapsed) return canonical;
  const range = domSelection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return canonical;

  // 先用当前规范快照定位单元格，再验证 DOM 投影身份；不以 widget 的旧 offset 决定源位置。
  const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(view.state));
  const target = snapshot.tableAt(selection.head);
  if (!target || editor.dataset.tableCell !== `${target.rowIndex}:${target.columnIndex}`) return canonical;
  const tableStart = snapshot.lineAt(target.node.source.startOffset)?.range.startOffset;
  if (tableStart === undefined ||
      editor.closest<HTMLElement>(".cm-table-widget")?.dataset.tableStartOffset !== String(tableStart)) return canonical;
  const from = target.cell.content.startOffset;
  const text = view.state.doc.sliceString(from, target.cell.content.endOffset);
  // 例如转义竖线被解码后长度已不同；没有精确映射时保留规范选区，不猜测偏移。
  if (editor.textContent !== text) return canonical;

  const offsets = readEditableSelection(editor);
  const backwards = domSelection.anchorNode === range.endContainer && domSelection.anchorOffset === range.endOffset;
  return backwards
    ? { anchor: from + offsets.end, head: from + offsets.start }
    : { anchor: from + offsets.start, head: from + offsets.end };
}

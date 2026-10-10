import "../src/renderer/styles/base.css";
import "../src/renderer/styles/primitives.css";
import "../src/renderer/styles/editor-source.css";
import "../src/renderer/styles/markdown-render.css";
import { EditorView } from "@codemirror/view";
import { StateEffect, Transaction } from "@codemirror/state";
import { undoDepth, redoDepth } from "@codemirror/commands";
import { createCodeEditorController } from "../src/renderer/code-editor";
import { parseMarkdownDocument } from "@fishmark/markdown-engine";

// Diagnostic observers only: no event prevention, product transform, history reset or undo shim.
const initial = "Plain paragraph.\n\n| Name | Value |\n| --- | --- |\n| Alpha | Beta |";
const edited = "Plain paragraph.\n\n| Name  | Value |\n| :---- | :---- |\n| Delta | Beta  |";
const canonicalOriginal = "Plain paragraph.\n\n| Name  | Value |\n| :---- | :---- |\n| Alpha | Beta  |";
const root = document.getElementById("probe-root")!;
root.className = "document-editor";
root.style.cssText = "height:720px;width:1000px;overflow:hidden";
let action = "construct";
const records: unknown[] = [];
let nextSequence = 0;
const record = (data: Record<string, unknown>) => records.push({ sequence: nextSequence++, action, at: performance.now(), ...data });
const controller = createCodeEditorController({ parent: root, initialContent: initial, onChange: (source) => record({ kind: "content", source }),
  onDocumentChangeFrame: (frame) => record({ kind: "frame", ...frame }) });
const view = EditorView.findFromDOM(root.querySelector<HTMLElement>(".cm-editor")!)!;
if (!view) throw new Error("Product EditorView missing");

function state() {
  const active = document.activeElement as HTMLElement | null;
  const table = parseMarkdownDocument(controller.getContent()).blocks.find((block) => block.type === "table");
  return { source: controller.getContent(), cellTexts: [...root.querySelectorAll<HTMLElement>("[data-table-cell]")].map((element) => ({
    cell: element.dataset.tableCell, text: element.textContent })),
  sourceCells: table?.type === "table" ? [table.header, ...table.rows].flatMap((cells) => cells.map((cell) => ({ cell: `${cell.rowIndex}:${cell.columnIndex}`, text: cell.text }))) : [],
  selection: controller.getSelection(), domSelection: window.getSelection()?.toString() ?? null,
  focus: { className: active?.className ?? null, cell: active?.dataset.tableCell ?? null },
  history: { undo: undoDepth(view.state), redo: redoDepth(view.state) } };
}

view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of((update) => {
  for (const transaction of update.transactions) {
    const changes: unknown[] = [];
    transaction.changes.iterChanges((from, to, fromB, toB, text) => changes.push({ from, to, fromB, toB, insert: text.toString() }));
    record({ kind: "transaction", docChanged: transaction.docChanged, userEvent: transaction.annotation(Transaction.userEvent) ?? null,
      addToHistory: transaction.annotation(Transaction.addToHistory) ?? null, beforeSource: transaction.startState.doc.toString(),
      afterSource: transaction.newDoc.toString(), changes, effectCount: transaction.effects.length, history: state().history });
  }
})) });

for (const type of ["keydown", "keyup", "beforeinput", "input", "mousedown", "mouseup", "click", "focusin", "focusout", "compositionstart", "compositionupdate", "compositionend"]) {
  for (const capture of [true, false]) document.addEventListener(type, (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const keyboard = event instanceof KeyboardEvent ? event : null;
    const input = event instanceof InputEvent ? event : null;
    record({ kind: "event", type, phase: capture ? "capture" : "bubble", isTrusted: event.isTrusted,
      defaultPrevented: event.defaultPrevented, target: { className: target?.className ?? null, cell: target?.dataset.tableCell ?? null },
      key: keyboard?.key ?? null, ctrlKey: keyboard?.ctrlKey ?? null, shiftKey: keyboard?.shiftKey ?? null,
      inputType: input?.inputType ?? null, data: input?.data ?? null, isComposing: input?.isComposing ?? null, state: state() });
  }, capture);
}

window.__tableHistory = {
  initial, edited, canonicalOriginal,
  setAction(label: string) { action = label; },
  snapshot(label: string) { const snapshot = { label, ...state() }; record({ kind: "snapshot", ...snapshot }); return snapshot; },
  records() { return records; },
  cellPoint(cell: string) { const element = root.querySelector<HTMLElement>(`[data-table-cell="${cell}"]`)!;
    const rect = element.getBoundingClientRect(); return { x: Math.round(rect.left + Math.min(15, rect.width / 2)), y: Math.round(rect.top + rect.height / 2) }; },
  selectAlpha() { const element = root.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
    element.focus(); const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    return { preparation: "DOM range, not trusted keyboard selection", text: selection.toString(), ...state() }; },
  selectCellRange(cell: string, start: number, end: number) {
    const element = root.querySelector<HTMLElement>(`[data-table-cell="${cell}"]`)!;
    element.focus();
    (element as HTMLElement & { setSelectionRange(start: number, end: number): void }).setSelectionRange(start, end);
    return { preparation: "DOM range, not trusted keyboard selection", text: window.getSelection()?.toString(), ...state() };
  },
  focusDocument() { const before = state(); controller.setSelection(6); controller.focus(); return { before, after: state() }; },
  presentation() { const css = getComputedStyle(view.contentDOM); return { dpr: devicePixelRatio, fontFamily: css.fontFamily, fontSize: css.fontSize,
    lineHeight: css.lineHeight, width: root.getBoundingClientRect().width }; }
};

declare global { interface Window { __tableHistory: {
  initial: string; edited: string; canonicalOriginal: string;
  setAction(label: string): void;
  snapshot(label: string): ReturnType<typeof state> & { label: string };
  records(): unknown[];
  cellPoint(cell: string): { x: number; y: number };
  selectAlpha(): ReturnType<typeof state> & { preparation: string; text: string };
  selectCellRange(cell: string, start: number, end: number): ReturnType<typeof state> & { preparation: string; text: string | undefined };
  focusDocument(): { before: ReturnType<typeof state>; after: ReturnType<typeof state> };
  presentation(): { dpr: number; fontFamily: string; fontSize: string; lineHeight: string; width: number };
} } }

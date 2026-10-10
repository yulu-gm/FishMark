import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
} from "@codemirror/search";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { EditorSelection, type Text } from "@codemirror/state";
import {
  getMarkdownEditorViewMode,
  readCompositionState,
  readEditorStructureCache,
  computeEditorRevealDelta
} from "@fishmark/codemirror-adapter";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import type { FindReplaceMatch, FindReplaceSnapshot } from "./code-editor";

export {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
};

const resultProjections = new WeakMap<EditorView, { doc: Text; query: SearchQuery; matches: FindReplaceMatch[] }>();

export function invalidateFindReplaceResults(view: EditorView) {
  resultProjections.delete(view);
}

export function readFindReplaceSnapshot(view: EditorView): FindReplaceSnapshot {
  const { state } = view;
  const query = getSearchQuery(state);
  let projection = resultProjections.get(view);
  if (!projection || projection.doc !== state.doc || projection.query !== query) {
    const matches: FindReplaceMatch[] = [];
    if (query.valid && query.search) {
      const cursor = query.getCursor(state);
      for (let next = cursor.next(); !next.done; next = cursor.next()) {
        const { from, to } = next.value;
        const line = state.doc.lineAt(from);
        const start = Math.max(line.from, from - 35);
        const end = Math.max(Math.min(line.to, from + 65), Math.min(to, from + 100));
        matches.push({ from, to, line: line.number, column: from - line.from + 1,
          snippet: `${start > line.from ? "…" : ""}${state.sliceDoc(start, end).replace(/\s+/gu, " ")}${end < line.to || end < to ? "…" : ""}` });
      }
    }
    projection = { doc: state.doc, query, matches };
    resultProjections.set(view, projection);
  }
  const { matches } = projection;
  const selected = matches.findIndex(match => match.from === state.selection.main.from && match.to === state.selection.main.to);
  return { matchCount: matches.length, currentMatchIndex: selected < 0 ? null : selected + 1, matches };
}

export function selectFindReplaceMatch(view: EditorView, match: FindReplaceMatch) {
  const query = getSearchQuery(view.state);
  if (!query.valid || !query.search || !searchPanelOpen(view.state) || readCompositionState(view.state).active) return;
  // Objects belong to this exact query and immutable source document projection.
  // An old result from a reload, edit, or query change must never select a new match.
  if (!readFindReplaceSnapshot(view).matches.includes(match)) return;
  view.dispatch({ selection: { anchor: match.from, head: match.to },
    effects: EditorView.scrollIntoView(EditorSelection.range(match.from, match.to), { y: "center" }), userEvent: "select.search" });
}

export function createFishmarkSearchExtension() {
  return [search({
    createPanel: () => {
      const dom = document.createElement("div");

      dom.hidden = true;
      dom.setAttribute("aria-hidden", "true");
      return { dom, top: true };
    }
  }), tableSearchPresentation, EditorView.scrollHandler.of((view, range) => {
    const selection = view.state.selection.main;
    if (range.from !== selection.from || range.to !== selection.to) return false;
    const cell = currentTableSearchCell(view);
    if (!cell) return false;

    // 此时 CodeMirror 已挂载滚动目标所在视口；默认源码几何只认识整张替换表格。
    // scrollHandler 本身处于布局阶段，须在 CM 清除目标并重算视口前完成滚动。
    const scroller = view.scrollDOM;
    const delta = computeEditorRevealDelta(cell.getBoundingClientRect(), scroller.getBoundingClientRect(), "navigate");
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta.top);
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta.left);
    return true;
  })];
}

function currentTableSearchCell(view: EditorView): HTMLElement | null {
  const { state } = view;
  const selection = state.selection.main;
  if (selection.empty || !searchPanelOpen(state) || getMarkdownEditorViewMode(state) === "source" ||
      readCompositionState(state).active) return null;
  const query = getSearchQuery(state);
  if (!query.valid || !query.search) return null;
  const match = query.getCursor(state, selection.from, selection.to).next();
  if (match.done || match.value.from !== selection.from || match.value.to !== selection.to) return null;

  // 每次都从当前规范快照定位。DOM offset 仅作投影查找键，不能代替源码与单元格身份。
  const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(state));
  const target = snapshot.tableAt(selection.from);
  if (!target || selection.from < target.cell.content.startOffset || selection.to > target.cell.content.endOffset) return null;
  const start = snapshot.lineAt(target.node.source.startOffset)?.range.startOffset;
  if (start === undefined) return null;
  const table = view.dom.querySelector<HTMLElement>(`.cm-table-widget[data-table-start-offset="${start}"]`);
  return table?.querySelector<HTMLElement>(`[data-table-cell="${target.rowIndex}:${target.columnIndex}"]`) ?? null;
}

const tableSearchClasses = ["cm-table-search-match", "cm-searchMatch", "cm-searchMatch-selected"];
const tableSearchPresentation = ViewPlugin.fromClass(class {
  private queued = false;
  private destroyed = false;

  constructor(private readonly view: EditorView) {
    this.update();
  }

  update() {
    if (this.queued) return;
    this.queued = true;
    // 插件更新先于 widget DOM 更新；微任务中重读最终状态，兼顾仅装饰和视口刷新。
    queueMicrotask(() => {
      this.queued = false;
      if (this.destroyed) return;
      const target = currentTableSearchCell(this.view);
      for (const cell of this.view.dom.querySelectorAll<HTMLElement>(".cm-table-search-match")) {
        if (cell !== target) cell.classList.remove(...tableSearchClasses);
      }
      target?.classList.add(...tableSearchClasses);
    });
  }

  destroy() {
    this.destroyed = true;
    for (const cell of this.view.dom.querySelectorAll<HTMLElement>(".cm-table-search-match")) {
      cell.classList.remove(...tableSearchClasses);
    }
  }
});

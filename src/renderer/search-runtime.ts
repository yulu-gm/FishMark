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
  readTableSourceRange,
  readTableSourceRangeRects,
  revealTableRect
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
    const cell = currentTableSearchTarget(view)?.cell;
    if (!cell) return false;

    // 此时 CodeMirror 已挂载滚动目标所在视口；默认源码几何只认识整张替换表格。
    // scrollHandler 本身处于布局阶段，须在 CM 清除目标并重算视口前完成滚动。
    const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(view.state));
    const target = snapshot.tableAt(selection.from);
    if (!target) return false;
    const from = target.cell.content.startOffset;
    const source = view.state.doc.sliceString(from, target.cell.content.endOffset);
    const boxes = readTableSourceRangeRects(cell, source, selection.from - from, selection.to - from);
    if (!boxes.length) {
      // Preserve the existing canonical-cell reveal for previews whose text
      // normalization has no proven source projection. This is a cell fallback,
      // not evidence that the requested source characters have visible geometry.
      const fallback = cell.getBoundingClientRect();
      if (!(fallback.height > 0) || ![fallback.top, fallback.bottom, fallback.left, fallback.right].every(Number.isFinite)) return false;
      return revealTableRect(view, cell, fallback, "navigate");
    }
    const rect = { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)),
      top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)), width: 0, height: 0 };
    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;
    // A match spanning more than a viewport reveals its active end, not the
    // thousands-pixel cell containing it.
    const fragment = rect.height <= view.scrollDOM.clientHeight ? rect : boxes[boxes.length - 1]!;
    return revealTableRect(view, cell, fragment, "navigate");
  })];
}

function currentTableSearchTarget(view: EditorView): { table: HTMLElement; cell: HTMLElement | null } | null {
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
  const node = target?.node ?? snapshot.nodeAt(selection.from);
  if (node?.kind !== "table" || selection.to > node.source.endOffset) return null;
  const start = snapshot.lineAt(node.source.startOffset)?.range.startOffset;
  if (start === undefined) return null;
  const table = view.dom.querySelector<HTMLElement>(`.cm-table-widget[data-table-start-offset="${start}"]`);
  if (!table) return null;
  const cell = target && selection.from >= target.cell.content.startOffset && selection.to <= target.cell.content.endOffset
    ? table.querySelector<HTMLElement>(`[data-table-cell="${target.rowIndex}:${target.columnIndex}"]`) : null;
  return { table, cell };
}

const tableSearchClasses = ["cm-table-search-match", "cm-table-search-exact", "cm-searchMatch", "cm-searchMatch-selected"];
const tableSearchHighlight = "fishmark-table-search";
const tableSearchPresentation = ViewPlugin.fromClass(class {
  private queued = false;
  private destroyed = false;
  private highlight: { registry: HighlightRegistry; range: Range; value: Highlight } | null = null;
  private sourceHint: { table: HTMLElement; title: string | null } | null = null;

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
      this.clearHighlight();
      const match = currentTableSearchTarget(this.view);
      const target = match?.cell;
      for (const cell of this.view.dom.querySelectorAll<HTMLElement>(".cm-table-search-match")) {
        cell.classList.remove(...tableSearchClasses);
      }
      if (!target) {
        if (match) {
          // 分隔符或跨格范围没有单一可见文字投影，明确提示查看源码。
          this.sourceHint = { table: match.table, title: match.table.getAttribute("title") };
          match.table.classList.add("cm-table-search-source-match");
          match.table.title = "匹配项包含表格结构，切换源码视图可查看完整范围。";
        }
        return;
      }
      const { state } = this.view;
      const cell = createEditorDerivedSnapshotFromCache(readEditorStructureCache(state)).tableAt(state.selection.main.from)?.cell;
      const win = target.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      const registry = win?.CSS?.highlights;
      const range = cell && readTableSourceRange(target, state.sliceDoc(cell.content.startOffset, cell.content.endOffset),
        state.selection.main.from - cell.content.startOffset, state.selection.main.to - cell.content.startOffset);
      // 原生高亮只绘制命中的字，不包裹 DOM，也不会抢走搜索框焦点或改变编辑选区。
      // 隐藏标记和无法证明源码映射的内容，继续使用整格提示。
      if (range && registry && win.Highlight && Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0)) {
        const value = registry.get(tableSearchHighlight) ?? new win.Highlight();
        value.add(range);
        registry.set(tableSearchHighlight, value);
        this.highlight = { registry, range, value };
        target.classList.add("cm-table-search-match", "cm-table-search-exact");
      } else {
        target.classList.add("cm-table-search-match", "cm-searchMatch", "cm-searchMatch-selected");
      }
    });
  }

  private clearHighlight() {
    if (this.sourceHint) {
      const { table, title } = this.sourceHint;
      table.classList.remove("cm-table-search-source-match");
      if (title === null) table.removeAttribute("title");
      else table.setAttribute("title", title);
      this.sourceHint = null;
    }
    if (!this.highlight) return;
    const { registry, range, value } = this.highlight;
    value.delete(range);
    // 同一窗口可以挂载多个编辑器，只清理本插件拥有的范围。
    if (!value.size && registry.get(tableSearchHighlight) === value) registry.delete(tableSearchHighlight);
    this.highlight = null;
  }

  destroy() {
    this.destroyed = true;
    this.clearHighlight();
    for (const cell of this.view.dom.querySelectorAll<HTMLElement>(".cm-table-search-match")) {
      cell.classList.remove(...tableSearchClasses);
    }
  }
});

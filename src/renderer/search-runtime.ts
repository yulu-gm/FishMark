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
import {
  getMarkdownEditorViewMode,
  readCompositionState,
  readEditorStructureCache,
  computeEditorRevealDelta
} from "@fishmark/codemirror-adapter";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";

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

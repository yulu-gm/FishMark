import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache, deriveTableCursorState } from "@fishmark/editor-model";

import { createCodeEditorController, type CodeEditorController } from "./code-editor";

type SerializableRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type TableFocusScrollSample = {
  bodyScrollTop: number;
  cell: string | null;
  documentScrollTop: number;
  editorRect: SerializableRect | null;
  pageScrollY: number;
  pass: boolean;
  scrollerRect: SerializableRect;
  scrollTop: number;
};

type TableFocusScrollProbeResult = {
  failures: string[];
  pass: boolean;
  samples: TableFocusScrollSample[];
};

const TABLE_ROWS = Array.from({ length: 48 }, (_, index) => {
  const row = index + 1;
  return `| item-${String(row).padStart(2, "0")} | ${row} | note ${row} |`;
});

const CONTENT = [
  "# Table focus scroll probe",
  "",
  ...Array.from({ length: 16 }, (_, index) => `Paragraph before ${index + 1}`),
  "",
  "| name | qty | note |",
  "| --- | ---: | --- |",
  ...TABLE_ROWS,
  "",
  ...Array.from({ length: 16 }, (_, index) => `Paragraph after ${index + 1}`)
].join("\n");

function toSerializableRect(rect: DOMRect): SerializableRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getTableCell(root: ParentNode, row: number, column: number): HTMLElement {
  const cell = root.querySelector<HTMLElement>(`[data-table-cell="${row}:${column}"]`);

  if (!cell) {
    throw new Error(`Could not find table cell ${row}:${column}.`);
  }

  return cell;
}

function sampleActiveCell(root: ParentNode, scroller: HTMLElement): TableFocusScrollSample {
  const editor =
    root.querySelector<HTMLElement>(".cm-table-widget-input:focus") ??
    root.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"] .cm-table-widget-input');
  const scrollerRect = scroller.getBoundingClientRect();
  const editorRect = editor?.getBoundingClientRect() ?? null;
  const pageScrollY = window.scrollY;
  const documentScrollTop = document.documentElement.scrollTop;
  const bodyScrollTop = document.body.scrollTop;
  const pass =
    !!editorRect &&
    editorRect.top >= scrollerRect.top - 1 &&
    editorRect.bottom <= scrollerRect.bottom + 1 &&
    pageScrollY === 0 &&
    documentScrollTop === 0 &&
    bodyScrollTop === 0;

  return {
    bodyScrollTop,
    cell: editor?.dataset.tableCell ?? null,
    documentScrollTop,
    editorRect: editorRect ? toSerializableRect(editorRect) : null,
    pageScrollY,
    pass,
    scrollerRect: toSerializableRect(scrollerRect),
    scrollTop: scroller.scrollTop
  };
}

// The key event is dispatched synchronously, but the table widget may rebuild its DOM and
// re-apply the active-cell marker over more than one frame (decoration rebuild + focus
// restore). Waiting a bounded number of frames removes that render-latency race without
// weakening the viewport assertion: if the active cell never appears, the probe still fails.
const ACTIVE_CELL_FRAME_BUDGET = 10;

function findActiveTableCellInput(root: ParentNode): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>(".cm-table-widget-input:focus") ??
    root.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"] .cm-table-widget-input')
  );
}

async function waitForActiveTableCellInput(root: ParentNode): Promise<HTMLElement | null> {
  for (let frame = 0; frame < ACTIVE_CELL_FRAME_BUDGET; frame += 1) {
    const input = findActiveTableCellInput(root);
    if (input) {
      return input;
    }
    await nextFrame();
  }

  return findActiveTableCellInput(root);
}

function describeMissingActiveCell(
  context: {
    controller: Pick<CodeEditorController, "getContent" | "getSelection">;
    root: ParentNode;
    scroller: HTMLElement;
    requested: { row: number; column: number };
    syntheticFocusInRestoresActiveCell: boolean | null;
  },
  step: number
): string {
  const { controller, requested, root, scroller, syntheticFocusInRestoresActiveCell } = context;
  const cells = Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget-cell"));
  const inputs = Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget-input"));
  const activeElement = document.activeElement as HTMLElement | null;
  const visibleCells = cells.filter((cell) => cell.getBoundingClientRect().height > 0);
  const frameBudget = `${ACTIVE_CELL_FRAME_BUDGET} frames`;
  const selection = controller.getSelection();
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(controller.getContent()));
  const derivedCursor = deriveTableCursorState(snapshot, selection, null);
  const widgetStartOffsets = Array.from(root.querySelectorAll<HTMLElement>(".cm-table-widget"))
    .map((widget) => widget.dataset.tableStartOffset ?? "none");

  return [
    `Missing active table cell during navigation at step ${step} after waiting ${frameBudget}.`,
    `document.hasFocus=${String(document.hasFocus())}`,
    `activeElement=${activeElement ? `${activeElement.tagName}.${activeElement.className}` : "null"}`,
    `cells=${cells.length} visibleCells=${visibleCells.length} inputs=${inputs.length}`,
    `cellStates=${JSON.stringify(
      cells.slice(0, 6).map((cell) => ({
        cell: cell.querySelector<HTMLElement>(".cm-table-widget-input")?.dataset.tableCell ?? null,
        active: cell.dataset.active ?? null,
        focusedInput: cell.contains(document.activeElement)
      }))
    )}`,
    // Distinguishes "the click never moved the table cursor" (planner/offset problem) from
    // "the cursor is right but the widget DOM was never rebuilt" (decoration refresh problem).
    `codeMirrorSelection=${JSON.stringify(selection)}`,
    `derivedTableCursor=${JSON.stringify(derivedCursor)}`,
    `widgetStartOffsets=${JSON.stringify(widgetStartOffsets)}`,
    `activeCellMatchesDerivedCursor=${
      derivedCursor?.mode === "inside" &&
      derivedCursor.row >= requested.row &&
      derivedCursor.row <= requested.row + step &&
      derivedCursor.column === requested.column &&
      widgetStartOffsets.includes(String(derivedCursor.tableStartOffset))
    }`,
    `syntheticFocusInRestoresActiveCell=${String(syntheticFocusInRestoresActiveCell)}`,
    `scrollerRect=${JSON.stringify(toSerializableRect(scroller.getBoundingClientRect()))}`
  ].join(" ");
}

// The editor only repaints on a selection-only transaction when its own "editor has focus" flag is
// set, and that flag is fed exclusively by DOM focus events (`focusin` on the editor subtree). A
// host whose page never becomes the focused page (a hidden Electron window) never receives them, so
// the flag stays false forever and the table widget keeps the active position it was built with.
// Re-dispatching the event here proves in one run whether the missing repaint is a focus-signal
// problem or a genuine table-cursor/decoration problem.
async function syntheticFocusInRestoresActiveCell(root: ParentNode): Promise<boolean | null> {
  const editorRoot = root.querySelector<HTMLElement>(".cm-editor");

  if (!editorRoot) {
    return null;
  }

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await nextFrame();

  return findActiveTableCellInput(root) !== null;
}

function scrollCellToMiddle(scroller: HTMLElement, cell: HTMLElement): void {
  const scrollerRect = scroller.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  scroller.scrollTop += cellRect.top - scrollerRect.top - scrollerRect.height / 2 + cellRect.height / 2;
}

export async function runTableFocusScrollProbe(content?: string | null): Promise<TableFocusScrollProbeResult> {
  document.body.style.margin = "0";
  document.body.style.background = "#fff";
  document.body.style.color = "#1f2937";
  document.body.style.fontFamily = "Georgia, 'Times New Roman', serif";
  document.body.style.fontSize = "16px";
  document.documentElement.style.overflow = content ? "auto" : "hidden";
  document.body.style.overflow = content ? "auto" : "hidden";

  const root = document.getElementById("probe-root");
  if (!root) {
    throw new Error("Missing probe root.");
  }

  root.innerHTML = "";
  root.setAttribute("class", "document-editor");
  root.setAttribute(
    "style",
    [
      "box-sizing: border-box",
      "width: 720px",
      "height: 420px",
      "margin: 0 auto",
      "padding: 0",
      "--fishmark-document-font-family: Georgia, 'Times New Roman', serif",
      "--fishmark-document-font-size: 16px"
    ].join(";")
  );

  const controller = createCodeEditorController({
    parent: root,
    initialContent: content ?? CONTENT,
    onChange: () => undefined
  });

  const scroller = root.querySelector<HTMLElement>(".cm-scroller");
  if (!scroller) {
    throw new Error("Missing CodeMirror scroller.");
  }

  // This host renders the editor in a hidden BrowserWindow, so the page is never the focused page
  // and the browser therefore never dispatches the `focusin` events the editor uses to track "the
  // editor has focus". Without that signal a selection-only transaction cannot repaint at all
  // (`createSelectionScopedBlockDecorations` bails out with no focus), so the table widget would
  // keep the active position it was built with and the geometry assertions below could never run.
  // Every other Electron geometry probe performs the same normalization.
  const editorRoot = root.querySelector<HTMLElement>(".cm-editor");
  if (!editorRoot) {
    throw new Error("Missing CodeMirror editor root.");
  }

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await nextFrame();

  const startPosition = content ? { row: 1, column: 0 } : { row: 30, column: 0 };
  const startCell = getTableCell(root, startPosition.row, startPosition.column);
  scrollCellToMiddle(scroller, startCell);
  await nextFrame();

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  await nextFrame();

  startCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  startCell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();

  const samples: TableFocusScrollSample[] = [sampleActiveCell(root, scroller)];

  const stepCount = content ? 3 : 8;

  for (let index = 0; index < stepCount; index += 1) {
    const active = await waitForActiveTableCellInput(root);
    if (!active) {
      throw new Error(
        describeMissingActiveCell(
          {
            controller,
            requested: startPosition,
            root,
            scroller,
            syntheticFocusInRestoresActiveCell: await syntheticFocusInRestoresActiveCell(root)
          },
          index
        )
      );
    }

    active.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true
      })
    );
    await nextFrame();
    samples.push(sampleActiveCell(root, scroller));
  }

  controller.destroy();

  const failures = samples
    .filter((sample) => !sample.pass)
    .map(
      (sample) =>
        `${sample.cell ?? "no-cell"} is outside the editor scroller viewport or scrolled the page ` +
        `(window=${sample.pageScrollY}, document=${sample.documentScrollTop}, body=${sample.bodyScrollTop})`
    );

  return {
    failures,
    pass: failures.length === 0,
    samples
  };
}

Object.assign(window, {
  __runFishmarkTableFocusScrollProbe: runTableFocusScrollProbe
});

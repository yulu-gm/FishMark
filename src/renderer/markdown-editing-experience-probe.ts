import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { EditorView } from "@codemirror/view";

import { createCodeEditorController } from "./code-editor";

type CaseResult = {
  actualContent: string;
  actualSelection: { anchor: number; head: number };
  details?: Record<string, unknown>;
  expectedContent?: string;
  expectedSelection?: { anchor: number; head: number };
  grammar: string;
  name: string;
  pass: boolean;
};

type ProbeResult = {
  cases: CaseResult[];
  failures: string[];
  pass: boolean;
};

type Harness = {
  controller: ReturnType<typeof createCodeEditorController>;
  root: HTMLElement;
  view: EditorView;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextFrame();
}

function setupHarness(initialContent: string): Harness {
  const root = document.getElementById("probe-root");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Missing probe root.");
  }

  root.innerHTML = "";
  root.setAttribute("class", "document-editor");
  root.setAttribute(
    "style",
    [
      "box-sizing: border-box",
      "width: 760px",
      "height: 520px",
      "margin: 0 auto",
      "padding: 0",
      "--fishmark-document-font-family: Georgia, 'Times New Roman', serif",
      "--fishmark-document-font-size: 16px"
    ].join(";")
  );

  const controller = createCodeEditorController({
    parent: root,
    initialContent,
    onChange: () => undefined
  });
  const editorRoot = root.querySelector<HTMLElement>(".cm-editor");
  if (!editorRoot) {
    throw new Error("Missing CodeMirror editor root.");
  }

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  controller.focus();

  const view = EditorView.findFromDOM(editorRoot);
  if (!view) {
    throw new Error("Could not resolve CodeMirror EditorView.");
  }

  return { controller, root, view };
}

function resultFor(
  input: Omit<CaseResult, "actualContent" | "actualSelection" | "pass"> & {
    harness: Harness;
    pass: boolean;
  }
): CaseResult {
  return {
    actualContent: input.harness.controller.getContent(),
    actualSelection: input.harness.controller.getSelection(),
    details: input.details,
    expectedContent: input.expectedContent,
    expectedSelection: input.expectedSelection,
    grammar: input.grammar,
    name: input.name,
    pass: input.pass
  };
}

function nativeInsertText(view: EditorView, text: string): boolean {
  view.contentDOM.focus();
  return document.execCommand("insertText", false, text);
}

function nativeInsertTextIntoFocusedElement(text: string): boolean {
  return document.execCommand("insertText", false, text);
}

function dispatchBackspace(view: EditorView): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      bubbles: true,
      cancelable: true
    })
  );
}

function dispatchFocusedKeydown(key: string): boolean {
  const activeElement = document.activeElement;

  if (!activeElement) {
    return false;
  }

  return activeElement.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: key,
      bubbles: true,
      cancelable: true
    })
  );
}

function describeElement(element: Element | null): Record<string, string | null> {
  if (!(element instanceof HTMLElement)) {
    return { className: null, dataTableCell: null, tagName: null };
  }

  return {
    className: element.className,
    dataTableCell: element.dataset.tableCell ?? null,
    tagName: element.tagName
  };
}

function findTextRect(root: ParentNode, text: string): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const value = node.nodeValue ?? "";
    const index = value.indexOf(text);

    if (index >= 0) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const rect = Array.from(range.getClientRects()).find((entry) => entry.width > 0 && entry.height > 0);
      range.detach();

      if (rect) {
        return rect;
      }
    }

    node = walker.nextNode();
  }

  return null;
}

function findLineByText(root: ParentNode, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(".cm-line")).find((line) =>
    line.textContent?.includes(text)
  ) ?? null;
}

function dispatchMouse(target: EventTarget, type: string, init: MouseEventInit): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      ...init
    })
  );
}

function dispatchMouseSequence(target: EventTarget, init: MouseEventInit): void {
  dispatchMouse(target, "mousedown", init);
  dispatchMouse(target, "mouseup", init);
  dispatchMouse(target, "click", init);
}

async function clickTableCell(harness: Harness, row: number, column: number): Promise<HTMLElement> {
  const cell = harness.root.querySelector<HTMLElement>(`[data-table-cell="${row}:${column}"]`);

  if (!cell) {
    throw new Error(`Missing table cell ${row}:${column}.`);
  }

  const rect = cell.getBoundingClientRect();
  dispatchMouseSequence(cell, {
    clientX: rect.left + Math.max(2, rect.width / 2),
    clientY: rect.top + Math.max(2, rect.height / 2)
  });
  await settle();

  return cell;
}

async function clickEditorPosition(harness: Harness, anchor: number): Promise<{
  target: Element | null;
  x: number;
  y: number;
}> {
  const caretRect = harness.view.coordsAtPos(anchor);
  const contentRect = harness.view.contentDOM.getBoundingClientRect();
  const lineRects = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .map((line) => line.getBoundingClientRect())
    .filter((rect) => rect.width >= 0 && rect.height > 0 && Number.isFinite(rect.top));
  const lastLineRect = lineRects.at(-1) ?? null;
  const caretLeft = caretRect && Number.isFinite(caretRect.left) ? caretRect.left : null;
  const caretTop = caretRect && Number.isFinite(caretRect.top) ? caretRect.top : null;
  const caretHeight =
    caretRect && Number.isFinite(caretRect.bottom) && Number.isFinite(caretRect.top)
      ? Math.max(0, caretRect.bottom - caretRect.top)
      : null;
  const x = Math.max(contentRect.left + 6, (caretLeft ?? lastLineRect?.left ?? contentRect.left) + 1);
  const y =
    caretTop !== null && caretHeight !== null
      ? caretTop + Math.max(1, caretHeight / 2)
      : lastLineRect
        ? lastLineRect.top + Math.max(1, lastLineRect.height / 2)
        : contentRect.bottom - 4;
  const target = document.elementFromPoint(x, y);

  dispatchMouseSequence(target ?? harness.view.contentDOM, { clientX: x, clientY: y });
  await settle();

  return { target, x, y };
}

async function runNativeInsertCase(input: {
  anchor: number;
  expectedContent: string;
  grammar: string;
  initialContent: string;
  name: string;
  text: string;
  visibleText: string;
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);
  harness.controller.setSelection(input.anchor);
  await settle();

  const insertAccepted = nativeInsertText(harness.view, input.text);
  await settle();

  const visibleRect = findTextRect(harness.root, input.visibleText);
  const pass =
    insertAccepted &&
    harness.controller.getContent() === input.expectedContent &&
    visibleRect !== null;

  const result = resultFor({
    details: {
      insertAccepted,
      visibleTextMeasured: visibleRect !== null
    },
    expectedContent: input.expectedContent,
    grammar: input.grammar,
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runListDoubleEnterExitInsertCase(): Promise<CaseResult> {
  const initialContent = ["- 11111", "- 22222"].join("\n");
  const expectedContent = ["- 11111", "- 22222", "", "正文一", "正文二"].join("\n");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();
  harness.controller.pressEnter();
  await settle();
  const contentAfterFirstEnter = harness.controller.getContent();
  harness.controller.pressEnter();
  await settle();
  const contentAfterExit = harness.controller.getContent();
  const firstInsertAccepted = nativeInsertText(harness.view, "正文一");
  await settle();
  harness.controller.pressEnter();
  await settle();
  const secondInsertAccepted = nativeInsertText(harness.view, "正文二");
  await settle();

  const firstLine = findLineByText(harness.root, "正文一");
  const secondLine = findLineByText(harness.root, "正文二");
  const firstRect = findTextRect(harness.root, "正文一");
  const secondRect = findTextRect(harness.root, "正文二");
  const firstLineClasses = firstLine?.className ?? "";
  const secondLineClasses = secondLine?.className ?? "";
  const secondLineVisible = secondLine !== null && secondLine.getBoundingClientRect().height > 0;
  const pass =
    firstInsertAccepted &&
    secondInsertAccepted &&
    harness.controller.getContent() === expectedContent &&
    contentAfterFirstEnter === `${initialContent}\n- ` &&
    contentAfterExit === `${initialContent}\n\n` &&
    firstRect !== null &&
    secondLineVisible &&
    !/\bcm-(?:active|inactive)-list(?:-continuation)?\b/u.test(firstLineClasses) &&
    !/\bcm-(?:active|inactive)-list(?:-continuation)?\b/u.test(secondLineClasses);

  const result = resultFor({
    details: {
      contentAfterExit,
      contentAfterFirstEnter,
      firstInsertAccepted,
      firstLineClasses,
      firstTextMeasured: firstRect !== null,
      secondInsertAccepted,
      secondLineClasses,
      secondLineVisible,
      secondTextMeasured: secondRect !== null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "list",
    harness,
    name: "double Enter exits a list before native Chinese insert",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runListDoubleEnterBackspaceCase(): Promise<CaseResult> {
  const initialContent = ["- 11111", "- 22222"].join("\n");
  const exitedContent = `${initialContent}\n\n`;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();
  harness.controller.pressEnter();
  await settle();
  harness.controller.pressEnter();
  await settle();
  const contentAfterExit = harness.controller.getContent();

  dispatchBackspace(harness.view);
  await settle();

  const selection = harness.controller.getSelection();
  const pass =
    contentAfterExit === exitedContent &&
    harness.controller.getContent() === initialContent &&
    selection.anchor === initialContent.length &&
    selection.head === initialContent.length;

  const result = resultFor({
    details: {
      contentAfterExit,
      selectionAfterBackspace: selection
    },
    expectedContent: initialContent,
    expectedSelection: { anchor: initialContent.length, head: initialContent.length },
    grammar: "list",
    harness,
    name: "Backspace returns from the list-exit blank line in one press",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTableBelowInsertCase(): Promise<CaseResult> {
  const initialContent = ["| 表格 | 表格 |", "| --- | --- |", "|  |  |", "", ""].join("\n");
  const expectedContent = ["| 表格 | 表格 |", "| --- | --- |", "|  |  |", "", "下方"].join("\n");
  const harness = setupHarness(initialContent);
  await settle();

  await clickTableCell(harness, 0, 0);
  const activeElementAfterCellClick = describeElement(document.activeElement);
  const clickSample = await clickEditorPosition(harness, initialContent.length);
  const activeElementAfterBelowClick = describeElement(document.activeElement);
  const selectionAfterBelowClick = harness.controller.getSelection();
  const insertAccepted = nativeInsertTextIntoFocusedElement("下方");
  await settle();

  const firstCell = harness.root.querySelector<HTMLElement>('[data-table-cell="0:0"]');
  const activeElementAfterInsert = describeElement(document.activeElement);
  const pass =
    insertAccepted &&
    harness.controller.getContent() === expectedContent &&
    harness.controller.getSelection().anchor === expectedContent.length &&
    firstCell?.textContent === "表格";

  const result = resultFor({
    details: {
      activeElementAfterBelowClick,
      activeElementAfterCellClick,
      activeElementAfterInsert,
      clickTarget: describeElement(clickSample.target),
      clickX: clickSample.x,
      clickY: clickSample.y,
      firstCellText: firstCell?.textContent ?? null,
      insertAccepted,
      selectionAfterBelowClick
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "table",
    harness,
    name: "native insert below a rendered table writes to the visual caret line",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTableBlankCanvasBelowInsertCase(): Promise<CaseResult> {
  const initialContent = ["| 表格 | 表格 |", "| --- | --- |", "|  |  |", ""].join("\n");
  const expectedContent = `${initialContent}下方`;
  const harness = setupHarness(initialContent);
  await settle();

  await clickTableCell(harness, 1, 0);
  const activeElementAfterCellClick = describeElement(document.activeElement);
  const content = harness.root.querySelector<HTMLElement>(".cm-content");
  const table = harness.root.querySelector<HTMLElement>(".cm-table-widget");

  if (!content || !table) {
    const result = resultFor({
      details: { reason: "missing content or table widget" },
      expectedContent,
      grammar: "table",
      harness,
      name: "native insert after clicking the blank canvas below a rendered table stays below the table",
      pass: false
    });
    harness.controller.destroy();
    return result;
  }

  const contentRect = content.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const clickX = contentRect.left + 8;
  const clickY = Math.min(contentRect.bottom - 6, tableRect.bottom + 48);
  const clickTarget = document.elementFromPoint(clickX, clickY) ?? content;

  dispatchMouseSequence(clickTarget, { clientX: clickX, clientY: clickY });
  await settle();

  const activeElementAfterBelowClick = describeElement(document.activeElement);
  const selectionAfterBelowClick = harness.controller.getSelection();
  const insertAccepted = nativeInsertTextIntoFocusedElement("下方");
  await settle();

  const firstBodyCell = harness.root.querySelector<HTMLElement>('[data-table-cell="1:0"]');
  const unexpectedNewRowCell = harness.root.querySelector<HTMLElement>('[data-table-cell="2:0"]');
  const activeElementAfterInsert = describeElement(document.activeElement);
  const pass =
    insertAccepted &&
    harness.controller.getContent() === expectedContent &&
    harness.controller.getSelection().anchor === expectedContent.length &&
    firstBodyCell?.textContent === "" &&
    unexpectedNewRowCell === null;

  const result = resultFor({
    details: {
      activeElementAfterBelowClick,
      activeElementAfterCellClick,
      activeElementAfterInsert,
      clickTarget: describeElement(clickTarget),
      clickX,
      clickY,
      firstBodyCellText: firstBodyCell?.textContent ?? null,
      insertAccepted,
      selectionAfterBelowClick,
      unexpectedNewRowCellText: unexpectedNewRowCell?.textContent ?? null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "table",
    harness,
    name: "native insert after clicking the blank canvas below a rendered table stays below the table",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTableLastRowClickCase(): Promise<CaseResult> {
  const initialContent = ["| 表格 | 表格 |", "| --- | --- |", "| 最后一行 |  |", "下方"].join("\n");
  const harness = setupHarness(initialContent);
  await settle();

  const clickedCell = await clickTableCell(harness, 1, 0);
  const activeElementAfterClick = describeElement(document.activeElement);
  const activeCell = harness.root.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');
  const unexpectedNewRowCell = harness.root.querySelector<HTMLElement>('[data-table-cell="2:0"]');
  const selectionAfterClick = harness.controller.getSelection();
  const pass =
    document.activeElement === clickedCell &&
    clickedCell.dataset.tableCell === "1:0" &&
    activeCell?.querySelector('[data-table-cell="1:0"]') === clickedCell &&
    unexpectedNewRowCell === null &&
    harness.controller.getContent() === initialContent;

  const result = resultFor({
    details: {
      activeElementAfterClick,
      activeCellText: activeCell?.textContent ?? null,
      selectionAfterClick,
      unexpectedNewRowCellText: unexpectedNewRowCell?.textContent ?? null
    },
    expectedContent: initialContent,
    grammar: "table",
    harness,
    name: "clicking the last table row stays inside that table cell",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTableKeyboardExitInsertCase(key: "ArrowDown" | "Enter"): Promise<CaseResult> {
  const initialContent = ["| 表格 | 表格 |", "| --- | --- |", "|  |  |"].join("\n");
  const expectedContent = ["| 表格 | 表格 |", "| --- | --- |", "|  |  |", "下方"].join("\n");
  const harness = setupHarness(initialContent);
  await settle();

  await clickTableCell(harness, 1, 0);
  const activeElementAfterCellClick = describeElement(document.activeElement);
  const keydownNotPrevented = dispatchFocusedKeydown(key);
  await settle();

  const activeElementAfterExit = describeElement(document.activeElement);
  const selectionAfterExit = harness.controller.getSelection();
  const insertAccepted = nativeInsertTextIntoFocusedElement("下方");
  await settle();

  const firstBodyCell = harness.root.querySelector<HTMLElement>('[data-table-cell="1:0"]');
  const unexpectedNewRowCell = harness.root.querySelector<HTMLElement>('[data-table-cell="2:0"]');
  const activeElementAfterInsert = describeElement(document.activeElement);
  const pass =
    !keydownNotPrevented &&
    insertAccepted &&
    harness.controller.getContent() === expectedContent &&
    harness.controller.getSelection().anchor === expectedContent.length &&
    firstBodyCell?.textContent === "" &&
    unexpectedNewRowCell === null;

  const result = resultFor({
    details: {
      activeElementAfterCellClick,
      activeElementAfterExit,
      activeElementAfterInsert,
      firstBodyCellText: firstBodyCell?.textContent ?? null,
      insertAccepted,
      keydownNotPrevented,
      selectionAfterExit,
      unexpectedNewRowCellText: unexpectedNewRowCell?.textContent ?? null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "table",
    harness,
    name: `${key} exit from the last table row accepts native insert below the table`,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTableDashBelowKeepsRenderedTableCase(): Promise<CaseResult> {
  const initialContent = ["| 1 | 2 |", "| :--- | :--- |", "| 1 | 2 |", "| 2 | 1", ""].join("\n");
  const expectedContent = ["| 1 | 2 |", "| :--- | :--- |", "| 1 | 2 |", "| 2 | 1", "-"].join("\n");
  const harness = setupHarness(initialContent);
  await settle();

  const clickSample = await clickEditorPosition(harness, initialContent.length);
  const selectionAfterBelowClick = harness.controller.getSelection();
  const insertAccepted = nativeInsertTextIntoFocusedElement("-");
  await settle();

  const table = harness.root.querySelector<HTMLElement>(".cm-table-widget");
  const firstHeaderCell = harness.root.querySelector<HTMLElement>('[data-table-cell="0:0"]');
  const lastBodyCell = harness.root.querySelector<HTMLElement>('[data-table-cell="2:1"]');
  const cellCount = harness.root.querySelectorAll("[data-table-cell]").length;
  const pass =
    insertAccepted &&
    harness.controller.getContent() === expectedContent &&
    harness.controller.getSelection().anchor === expectedContent.length &&
    table !== null &&
    cellCount === 6 &&
    firstHeaderCell?.textContent === "1" &&
    lastBodyCell?.textContent === "1";

  const result = resultFor({
    details: {
      cellCount,
      clickTarget: describeElement(clickSample.target),
      clickX: clickSample.x,
      clickY: clickSample.y,
      firstHeaderCellText: firstHeaderCell?.textContent ?? null,
      insertAccepted,
      lastBodyCellText: lastBodyCell?.textContent ?? null,
      selectionAfterBelowClick,
      tableRendered: table !== null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "table",
    harness,
    name: "typing a dash below a rendered table keeps the table rendered",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBackspaceCase(input: {
  anchor: number;
  expectedContent: string;
  expectedSelection: { anchor: number; head: number };
  grammar: string;
  initialContent: string;
  name: string;
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);
  harness.controller.setSelection(input.anchor);
  await settle();

  dispatchBackspace(harness.view);
  await settle();

  const actualSelection = harness.controller.getSelection();
  const pass =
    harness.controller.getContent() === input.expectedContent &&
    actualSelection.anchor === input.expectedSelection.anchor &&
    actualSelection.head === input.expectedSelection.head;

  const result = resultFor({
    expectedContent: input.expectedContent,
    expectedSelection: input.expectedSelection,
    grammar: input.grammar,
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteRawPrefixCase(): Promise<CaseResult> {
  const initialContent = "> ";
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(initialContent.length);
  await settle();

  const hasActiveMarkerDecoration = harness.root.querySelector(".cm-active-blockquote-marker") !== null;
  const sourcePrefixRect = findTextRect(harness.root, "> ");
  const caretRect = harness.view.coordsAtPos(initialContent.length);
  const pass =
    !hasActiveMarkerDecoration &&
    sourcePrefixRect !== null &&
    sourcePrefixRect.width > 0 &&
    caretRect !== null &&
    caretRect.left >= sourcePrefixRect.right - 2;

  const result = resultFor({
    details: {
      caretLeft: caretRect?.left ?? null,
      hasActiveMarkerDecoration,
      sourcePrefixMeasured: sourcePrefixRect !== null,
      sourcePrefixWidth: sourcePrefixRect?.width ?? null
    },
    grammar: "blockquote",
    harness,
    name: "focused blockquote source prefix remains raw editable text",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteDragSelectionCase(): Promise<CaseResult> {
  const initialContent = "> 选择这一整行";
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(initialContent.length);
  await settle();

  const rect = findTextRect(harness.root, "选择这一整行");
  if (!rect) {
    const result = resultFor({
      details: { reason: "content rect missing" },
      grammar: "blockquote",
      harness,
      name: "mouse drag can select a rendered blockquote line",
      pass: false
    });
    harness.controller.destroy();
    return result;
  }

  const y = rect.top + rect.height / 2;
  const fromX = rect.left - 12;
  const toX = rect.right + 6;

  dispatchMouse(harness.view.contentDOM, "mousedown", { clientX: fromX, clientY: y });
  dispatchMouse(document, "mousemove", { clientX: toX, clientY: y });
  dispatchMouse(document, "mouseup", { clientX: toX, clientY: y });
  await settle();

  const selection = harness.controller.getSelection();
  const selectedFrom = Math.min(selection.anchor, selection.head);
  const selectedTo = Math.max(selection.anchor, selection.head);
  const pass = selectedFrom <= 2 && selectedTo >= initialContent.length;

  const result = resultFor({
    details: {
      dragFromX: fromX,
      dragToX: toX,
      selectedFrom,
      selectedText: initialContent.slice(selectedFrom, selectedTo),
      selectedTo
    },
    expectedSelection: { anchor: 2, head: initialContent.length },
    grammar: "blockquote",
    harness,
    name: "mouse drag can select a rendered blockquote line",
    pass
  });
  harness.controller.destroy();
  return result;
}

export async function runMarkdownEditingExperienceProbe(): Promise<ProbeResult> {
  document.body.style.margin = "0";
  document.body.style.background = "#fff";
  document.body.style.color = "#1f2937";
  document.body.style.fontFamily = "Georgia, 'Times New Roman', serif";
  document.body.style.fontSize = "16px";

  const cases: CaseResult[] = [];

  cases.push(
    await runNativeInsertCase({
      anchor: "Paragraph".length,
      expectedContent: "Paragraph 中文",
      grammar: "paragraph",
      initialContent: "Paragraph",
      name: "native Chinese insert stays visible in paragraph",
      text: " 中文",
      visibleText: "中文"
    })
  );

  cases.push(
    await runNativeInsertCase({
      anchor: "# 标题".length,
      expectedContent: "# 标题中文",
      grammar: "heading",
      initialContent: "# 标题",
      name: "native Chinese insert stays visible in heading",
      text: "中文",
      visibleText: "中文"
    })
  );

  cases.push(
    await runNativeInsertCase({
      anchor: "- 项目".length,
      expectedContent: "- 项目中文",
      grammar: "list",
      initialContent: "- 项目",
      name: "native Chinese insert stays visible in list item",
      text: "中文",
      visibleText: "中文"
    })
  );

  {
    const initialContent = [
      "- 1",
      "- 2",
      "1. 111",
      "2. 222",
      "  1. 333",
      "  2. 222",
      "    1. 111",
      "    2. 22",
      "3. 222",
      "   "
    ].join("\n");
    const expectedContent = [
      "- 1",
      "- 2",
      "1. 111",
      "2. 222",
      "  1. 333",
      "  2. 222",
      "    1. 111",
      "    2. 22",
      "3. 222",
      "正文"
    ].join("\n");

    cases.push(
      await runNativeInsertCase({
        anchor: initialContent.length,
        expectedContent,
        grammar: "list",
        initialContent,
        name: "native Chinese insert on a whitespace-only line after a list starts body text",
        text: "正文",
        visibleText: "正文"
      })
    );
  }

  cases.push(await runListDoubleEnterExitInsertCase());
  cases.push(await runListDoubleEnterBackspaceCase());

  cases.push(
    await runNativeInsertCase({
      anchor: 2,
      expectedContent: "> 中文",
      grammar: "blockquote",
      initialContent: "> ",
      name: "native Chinese insert stays visible in a new blockquote",
      text: "中文",
      visibleText: "中文"
    })
  );

  cases.push(
    await runNativeInsertCase({
      anchor: "```txt\n".length,
      expectedContent: "```txt\n代码\n```",
      grammar: "codeFence",
      initialContent: "```txt\n\n```",
      name: "native Chinese insert stays visible in fenced code content",
      text: "代码",
      visibleText: "代码"
    })
  );

  cases.push(
    await runNativeInsertCase({
      anchor: "---".length,
      expectedContent: "---中文",
      grammar: "thematicBreak",
      initialContent: "---",
      name: "native Chinese insert can edit a thematic break marker line",
      text: "中文",
      visibleText: "中文"
    })
  );

  cases.push(await runBlockquoteRawPrefixCase());

  cases.push(
    await runBackspaceCase({
      anchor: "> 引用".length,
      expectedContent: "> 引",
      expectedSelection: { anchor: "> 引".length, head: "> 引".length },
      grammar: "blockquote",
      initialContent: "> 引用",
      name: "Backspace deletes blockquote content normally",
    })
  );

  cases.push(
    await runBackspaceCase({
      anchor: 2,
      expectedContent: "引用",
      expectedSelection: { anchor: 0, head: 0 },
      grammar: "blockquote",
      initialContent: "> 引用",
      name: "Backspace at blockquote content start removes the quote marker",
    })
  );

  cases.push(
    await runBackspaceCase({
      anchor: "> 引用\n\n".length,
      expectedContent: "> 引用下方",
      expectedSelection: { anchor: "> 引用".length, head: "> 引用".length },
      grammar: "blockquote",
      initialContent: "> 引用\n\n下方",
      name: "Backspace below a blockquote returns to the quote line",
    })
  );

  cases.push(await runBlockquoteDragSelectionCase());

  cases.push(await runTableBelowInsertCase());
  cases.push(await runTableLastRowClickCase());
  cases.push(await runTableBlankCanvasBelowInsertCase());
  cases.push(await runTableKeyboardExitInsertCase("Enter"));
  cases.push(await runTableKeyboardExitInsertCase("ArrowDown"));
  cases.push(await runTableDashBelowKeepsRenderedTableCase());

  const failures = cases
    .filter((entry) => !entry.pass)
    .map((entry) => `${entry.grammar}/${entry.name}`);

  return {
    cases,
    failures,
    pass: failures.length === 0
  };
}

Object.assign(window, {
  __runFishmarkMarkdownEditingExperienceProbe: runMarkdownEditingExperienceProbe
});

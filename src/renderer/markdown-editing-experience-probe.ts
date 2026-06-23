import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { EditorView } from "@codemirror/view";

import { createCodeEditorController } from "./code-editor";

type CaseResult = {
  actualContent: string;
  actualSelection: { anchor: number; head: number };
  caseId: string;
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

type ClickSample = {
  reason?: string;
  target: Element | null;
  x: number | null;
  y: number | null;
};

type LineSnapshot = {
  className: string;
  text: string;
  whiteSpace: string;
};

type VisualAssertion = {
  details?: Record<string, unknown>;
  name: string;
  pass: boolean;
};

type OracleVisualSnapshot = {
  actualContent: string;
  actualSelection: { anchor: number; head: number };
  caretAfterActions: Record<string, number | null>;
  linesAfterActions: LineSnapshot[];
};

type HumanListAction =
  | { kind: "backspace"; count?: number }
  | { kind: "enter" }
  | { kind: "tab" }
  | { kind: "type"; text: string };

type HumanListCheckpoint = {
  afterAction: number;
  expectedContent: string;
  name: string;
};

type OracleProbeAction =
  | { text: string; type: "type" }
  | { key: "ArrowDown" | "ArrowUp" | "Backspace" | "Enter"; type: "key" };

type NamedProbeCase = {
  caseId: string;
  group: string;
  run: () => Promise<CaseResult>;
};

type OracleVisualAssertionFactory = (snapshot: OracleVisualSnapshot) => VisualAssertion[];

function makeLegacyCaseId(grammar: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return `legacy-${grammar}-${slug || "case"}`;
}

function visualAssertion(
  name: string,
  pass: boolean,
  details?: Record<string, unknown>
): VisualAssertion {
  return { details, name, pass };
}

function hasFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertFiniteCaret(snapshot: OracleVisualSnapshot): VisualAssertion {
  const pass =
    hasFiniteMetric(snapshot.caretAfterActions.bottom) &&
    hasFiniteMetric(snapshot.caretAfterActions.left) &&
    hasFiniteMetric(snapshot.caretAfterActions.right) &&
    hasFiniteMetric(snapshot.caretAfterActions.top);

  return visualAssertion("caret has finite geometry after actions", pass, {
    caretAfterActions: snapshot.caretAfterActions
  });
}

function assertLineAt(
  snapshot: OracleVisualSnapshot,
  index: number,
  expected: {
    classTokens?: string[];
    text: string;
    whiteSpace?: string;
  }
): VisualAssertion {
  const line = snapshot.linesAfterActions[index] ?? null;
  const classTokens = expected.classTokens ?? [];
  const hasExpectedClasses =
    line !== null &&
    classTokens.every((classToken) => line.className.split(/\s+/u).includes(classToken));
  const hasExpectedWhiteSpace =
    line !== null &&
    (expected.whiteSpace === undefined || line.whiteSpace === expected.whiteSpace);
  const pass =
    line !== null &&
    line.text === expected.text &&
    hasExpectedClasses &&
    hasExpectedWhiteSpace;

  return visualAssertion(`line ${index} matches expected editing surface`, pass, {
    actualLine: line,
    expected
  });
}

function assertLineSequence(
  snapshot: OracleVisualSnapshot,
  expectedLines: Array<{
    classTokens?: string[];
    text: string;
    whiteSpace?: string;
  }>
): VisualAssertion[] {
  return expectedLines.map((expected, index) => assertLineAt(snapshot, index, expected));
}

function createOracleVisualAssertions(
  expectedLines: Array<{
    classTokens?: string[];
    text: string;
    whiteSpace?: string;
  }>
): OracleVisualAssertionFactory {
  return (snapshot) => [
    assertFiniteCaret(snapshot),
    ...assertLineSequence(snapshot, expectedLines)
  ];
}

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
  input: Omit<CaseResult, "actualContent" | "actualSelection" | "caseId" | "pass"> & {
    caseId?: string;
    harness: Harness;
    pass: boolean;
  }
): CaseResult {
  return {
    actualContent: input.harness.controller.getContent(),
    actualSelection: input.harness.controller.getSelection(),
    caseId: input.caseId ?? makeLegacyCaseId(input.grammar, input.name),
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

  if (/^[ \t]+$/u.test(text)) {
    const selection = view.state.selection.main;
    const anchor = selection.from + text.length;

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text
      },
      selection: {
        anchor,
        head: anchor
      },
      userEvent: "input.type"
    });
    return true;
  }

  const beforeInputAccepted = view.contentDOM.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: "insertText"
    })
  );

  if (!beforeInputAccepted) {
    return true;
  }

  return document.execCommand("insertText", false, text);
}

function nativeInsertTextIntoFocusedElement(text: string): boolean {
  return document.execCommand("insertText", false, text);
}

function dispatchCompositionEvent(
  target: HTMLElement,
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data: string
): boolean {
  return target.dispatchEvent(
    new CompositionEvent(type, {
      bubbles: true,
      cancelable: true,
      data
    })
  );
}

function dispatchBackspace(view: EditorView): boolean {
  return view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      bubbles: true,
      cancelable: true
    })
  );
}

function dispatchEnter(view: EditorView): boolean {
  return view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    })
  );
}

function dispatchTab(view: EditorView, shiftKey = false): boolean {
  return view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true,
      shiftKey
    })
  );
}

function dispatchKey(view: EditorView, key: "ArrowDown" | "ArrowUp" | "Backspace" | "Enter"): boolean {
  return view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: key,
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

function findTextRectOutsideClosestClasses(
  root: ParentNode,
  text: string,
  ignoredClasses: readonly string[]
): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parentElement = node.parentElement;
    const shouldIgnore =
      parentElement !== null &&
      ignoredClasses.some((className) => parentElement.closest(`.${className}`) !== null);

    if (shouldIgnore) {
      node = walker.nextNode();
      continue;
    }

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

function findLineByExactText(root: ParentNode, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(".cm-line")).find((line) =>
    (line.textContent ?? "") === text
  ) ?? null;
}

function describeDomSelectionGeometry(): Record<string, number | string | boolean | null> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return {
      anchorOffset: null,
      anchorParentClass: null,
      anchorText: null,
      collapsed: null,
      rectBottom: null,
      rectHeight: null,
      rectLeft: null,
      rectTop: null,
      rectWidth: null
    };
  }

  const range = selection.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  range.detach();

  const anchorNode = selection.anchorNode;
  const anchorParent = anchorNode instanceof Element
    ? anchorNode
    : anchorNode?.parentElement ?? null;
  const anchorText = anchorNode?.nodeType === Node.TEXT_NODE
    ? anchorNode.nodeValue
    : anchorParent?.textContent ?? null;

  return {
    anchorOffset: selection.anchorOffset,
    anchorParentClass: anchorParent instanceof HTMLElement ? anchorParent.className : null,
    anchorText,
    collapsed: selection.isCollapsed,
    rectBottom: Number.isFinite(rect.bottom) ? rect.bottom : null,
    rectHeight: Number.isFinite(rect.height) ? rect.height : null,
    rectLeft: Number.isFinite(rect.left) ? rect.left : null,
    rectTop: Number.isFinite(rect.top) ? rect.top : null,
    rectWidth: Number.isFinite(rect.width) ? rect.width : null
  };
}

function describeRect(
  rect: {
    bottom: number;
    height?: number;
    left: number;
    right: number;
    top: number;
    width?: number;
  } | null
): Record<string, number | null> {
  return {
    bottom: rect && Number.isFinite(rect.bottom) ? rect.bottom : null,
    height: rect && typeof rect.height === "number" && Number.isFinite(rect.height) ? rect.height : null,
    left: rect && Number.isFinite(rect.left) ? rect.left : null,
    right: rect && Number.isFinite(rect.right) ? rect.right : null,
    top: rect && Number.isFinite(rect.top) ? rect.top : null,
    width: rect && typeof rect.width === "number" && Number.isFinite(rect.width) ? rect.width : null
  };
}

function isVisibleTextPresent(root: ParentNode, text: string): boolean {
  return findTextRect(root, text) !== null || findLineByText(root, text) !== null;
}

function isTransparentColor(color: string): boolean {
  const normalized = color.trim().toLowerCase();

  return (
    normalized === "" ||
    normalized === "transparent" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    /\brgba\([^)]*,\s*0(?:\.0+)?\s*\)$/u.test(normalized) ||
    /\bcolor\(srgb [^)]* \/ 0(?:\.0+)?\)$/u.test(normalized)
  );
}

function measureTemporaryInlineText(parent: HTMLElement | null, text: string): {
  color: string | null;
  height: number | null;
  width: number | null;
} {
  if (!parent) {
    return { color: null, height: null, width: null };
  }

  const span = document.createElement("span");
  span.dataset.fishmarkImePreeditProbe = "true";
  span.textContent = text;
  parent.append(span);

  const rect = span.getBoundingClientRect();
  const color = window.getComputedStyle(span).color;
  span.remove();

  return {
    color,
    height: rect.height,
    width: rect.width
  };
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

async function clickEditorPosition(harness: Harness, anchor: number): Promise<ClickSample> {
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

async function clickVisibleTextEnd(
  harness: Harness,
  text: string
): Promise<ClickSample> {
  const rect = findTextRect(harness.root, text);

  if (!rect) {
    return { reason: "missing text rect", target: null, x: null, y: null };
  }

  const x = rect.right + 1;
  const y = rect.top + Math.max(1, rect.height / 2);
  const target = document.elementFromPoint(x, y) ?? harness.view.contentDOM;
  dispatchMouseSequence(target, { clientX: x, clientY: y });
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

async function runClickedNativeInsertCase(input: {
  anchor: number;
  expectedContent: string;
  grammar: string;
  initialContent: string;
  name: string;
  text: string;
  textClickAnchor?: string;
  visibleText: string;
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);
  await settle();

  const clickSample = input.textClickAnchor
    ? await clickVisibleTextEnd(harness, input.textClickAnchor)
    : await clickEditorPosition(harness, input.anchor);
  const selectionAfterClick = harness.controller.getSelection();
  const insertAccepted = nativeInsertTextIntoFocusedElement(input.text);
  await settle();

  const visibleRect = findTextRect(harness.root, input.visibleText);
  const pass =
    insertAccepted &&
    harness.controller.getContent() === input.expectedContent &&
    visibleRect !== null;

  const result = resultFor({
    details: {
      activeElementAfterClick: describeElement(document.activeElement),
      clickTarget: describeElement(clickSample.target),
      clickX: clickSample.x,
      clickY: clickSample.y,
      clickReason: clickSample.reason ?? null,
      insertAccepted,
      selectionAfterClick,
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

async function runListStyleClickedInsertCase(input: {
  initialContent: string;
  insertAfter: string;
  name: string;
}): Promise<CaseResult> {
  const anchor = input.initialContent.indexOf(input.insertAfter) + input.insertAfter.length;

  return runClickedNativeInsertCase({
    anchor,
    expectedContent: `${input.initialContent.slice(0, anchor)}中文${input.initialContent.slice(anchor)}`,
    grammar: "list",
    initialContent: input.initialContent,
    name: input.name,
    text: "中文",
    textClickAnchor: input.initialContent === input.insertAfter ? undefined : input.insertAfter,
    visibleText: "中文"
  });
}

async function runListStyleNativeInputCases(): Promise<CaseResult[]> {
  const inputs = [
    {
      initialContent: "- dash item",
      insertAfter: "dash item",
      name: "clicked native insert edits a dash unordered list item"
    },
    {
      initialContent: "* star item",
      insertAfter: "star item",
      name: "clicked native insert edits a star unordered list item"
    },
    {
      initialContent: "+ plus item",
      insertAfter: "plus item",
      name: "clicked native insert edits a plus unordered list item"
    },
    {
      initialContent: "1. ordered dot",
      insertAfter: "ordered dot",
      name: "clicked native insert edits a dot ordered list item"
    },
    {
      initialContent: "1) ordered paren",
      insertAfter: "ordered paren",
      name: "clicked native insert edits a paren ordered list item"
    },
    {
      initialContent: "- [ ] unchecked task",
      insertAfter: "unchecked task",
      name: "clicked native insert edits an unchecked task list item"
    },
    {
      initialContent: "- [x] checked task",
      insertAfter: "checked task",
      name: "clicked native insert edits a checked task list item"
    },
    {
      initialContent: ["- parent", "  - child item"].join("\n"),
      insertAfter: "child item",
      name: "clicked native insert edits a nested unordered list item"
    },
    {
      initialContent: ["1. parent", "   1. child item"].join("\n"),
      insertAfter: "child item",
      name: "clicked native insert edits a nested ordered list item"
    },
    {
      initialContent: ["- [ ] parent", "  - [ ] child task"].join("\n"),
      insertAfter: "child task",
      name: "clicked native insert edits a nested task list item"
    },
    {
      initialContent: ["- parent", "  continuation line"].join("\n"),
      insertAfter: "continuation line",
      name: "clicked native insert edits a list continuation line"
    },
    {
      initialContent: "- ",
      insertAfter: "- ",
      name: "clicked native insert edits an empty unordered list item"
    },
    {
      initialContent: "1. ",
      insertAfter: "1. ",
      name: "clicked native insert edits an empty ordered list item"
    },
    {
      initialContent: "- [ ] ",
      insertAfter: "- [ ] ",
      name: "clicked native insert edits an empty task list item"
    }
  ];
  const results: CaseResult[] = [];

  for (const input of inputs) {
    results.push(await runListStyleClickedInsertCase(input));
  }

  return results;
}

async function runSequentialNativeTypingCase(input: {
  expectedContent: string;
  grammar: string;
  initialContent: string;
  name: string;
  sequences: readonly string[];
  visibleTexts: readonly string[];
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);
  harness.controller.setSelection(input.initialContent.length);
  await settle();

  const insertResults: boolean[] = [];
  const enterResults: boolean[] = [];

  for (const sequence of input.sequences) {
    for (const character of Array.from(sequence)) {
      if (character === "\n") {
        enterResults.push(dispatchEnter(harness.view));
      } else {
        insertResults.push(nativeInsertText(harness.view, character));
      }
      await settle();
    }
  }

  const measuredTexts = input.visibleTexts.map((text) => ({
    measured: isVisibleTextPresent(harness.root, text),
    text
  }));
  const pass =
    insertResults.every(Boolean) &&
    harness.controller.getContent() === input.expectedContent &&
    measuredTexts.every((entry) => entry.measured);

  const result = resultFor({
    details: {
      enterResults,
      insertResults,
      measuredTexts
    },
    expectedContent: input.expectedContent,
    expectedSelection: {
      anchor: input.expectedContent.length,
      head: input.expectedContent.length
    },
    grammar: input.grammar,
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runSequentialListTypingCases(): Promise<CaseResult[]> {
  return [
    await runSequentialNativeTypingCase({
      expectedContent: ["- content 01", "- 中文内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits dash list items from an empty document",
      sequences: ["- content 01\n", "中文内容 02\n", "\n"],
      visibleTexts: ["content 01", "中文内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["- content 01", "", "- 中文内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing hand-enters explicit dash markers on separate empty lines",
      sequences: ["- content 01\n", "\n", "- 中文内容 02\n", "\n"],
      visibleTexts: ["content 01", "中文内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["* star content 01", "* 星号内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits star list items from an empty document",
      sequences: ["* star content 01\n", "星号内容 02\n", "\n"],
      visibleTexts: ["star content 01", "星号内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["+ plus content 01", "+ 加号内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits plus list items from an empty document",
      sequences: ["+ plus content 01\n", "加号内容 02\n", "\n"],
      visibleTexts: ["plus content 01", "加号内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["1. ordered content 01", "2. 有序内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits dot ordered list items from an empty document",
      sequences: ["1. ordered content 01\n", "有序内容 02\n", "\n"],
      visibleTexts: ["ordered content 01", "有序内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["1) paren content 01", "2) 括号内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits paren ordered list items from an empty document",
      sequences: ["1) paren content 01\n", "括号内容 02\n", "\n"],
      visibleTexts: ["paren content 01", "括号内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["- [ ] task content 01", "- [ ] 任务内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits unchecked task list items from an empty document",
      sequences: ["- [ ] task content 01\n", "任务内容 02\n", "\n"],
      visibleTexts: ["task content 01", "任务内容 02"]
    }),
    await runSequentialNativeTypingCase({
      expectedContent: ["- [x] done content 01", "- [ ] 完成内容 02", "", ""].join("\n"),
      grammar: "list",
      initialContent: "",
      name: "sequential typing creates and exits checked task list items from an empty document",
      sequences: ["- [x] done content 01\n", "完成内容 02\n", "\n"],
      visibleTexts: ["done content 01", "完成内容 02"]
    })
  ];
}

async function runStrictHumanListInputCase(input: {
  actions: readonly HumanListAction[];
  checkpoints?: readonly HumanListCheckpoint[];
  expectedContent: string;
  expectedSelectionAnchor?: number;
  name: string;
  visibleTexts?: readonly string[];
}): Promise<CaseResult> {
  const harness = setupHarness("");
  harness.controller.setSelection(0);
  await settle();

  const insertResults: boolean[] = [];
  const keyResults: Array<{ accepted: boolean; key: string }> = [];
  const checkpointByAction = new Map((input.checkpoints ?? []).map((checkpoint) => [
    checkpoint.afterAction,
    checkpoint
  ]));
  const checkpointResults: Array<{
    actualContent: string;
    expectedContent: string;
    name: string;
    pass: boolean;
  }> = [];
  let typedCharacterCount = 0;
  let backspaceCount = 0;
  let enterCount = 0;
  let tabCount = 0;

  for (const [actionIndex, action] of input.actions.entries()) {
    switch (action.kind) {
      case "type": {
        if (/[\r\n]/u.test(action.text)) {
          throw new Error(`Strict human input action cannot include newline characters: ${action.text}`);
        }

        for (const character of Array.from(action.text)) {
          insertResults.push(nativeInsertText(harness.view, character));
          typedCharacterCount += 1;
          await settle();
        }
        break;
      }
      case "enter":
        keyResults.push({ accepted: dispatchEnter(harness.view), key: "Enter" });
        enterCount += 1;
        await settle();
        break;
      case "tab":
        keyResults.push({ accepted: dispatchTab(harness.view), key: "Tab" });
        tabCount += 1;
        await settle();
        break;
      case "backspace": {
        const count = action.count ?? 1;

        for (let index = 0; index < count; index += 1) {
          keyResults.push({ accepted: dispatchBackspace(harness.view), key: "Backspace" });
          backspaceCount += 1;
          await settle();
        }
        break;
      }
    }

    const checkpoint = checkpointByAction.get(actionIndex + 1);

    if (checkpoint) {
      const actualContent = harness.controller.getContent();
      checkpointResults.push({
        actualContent,
        expectedContent: checkpoint.expectedContent,
        name: checkpoint.name,
        pass: actualContent === checkpoint.expectedContent
      });
    }
  }

  const measuredTexts = (input.visibleTexts ?? []).map((text) => ({
    measured: isVisibleTextPresent(harness.root, text),
    text
  }));
  const expectedSelectionAnchor = input.expectedSelectionAnchor ?? input.expectedContent.length;
  const selection = harness.controller.getSelection();
  const pass =
    insertResults.every(Boolean) &&
    harness.controller.getContent() === input.expectedContent &&
    selection.anchor === expectedSelectionAnchor &&
    selection.head === expectedSelectionAnchor &&
    checkpointResults.every((checkpoint) => checkpoint.pass) &&
    measuredTexts.every((entry) => entry.measured);

  const result = resultFor({
    details: {
      backspaceCount,
      checkpointResults,
      enterCount,
      insertResults,
      keyResults,
      measuredTexts,
      tabCount,
      typedCharacterCount
    },
    expectedContent: input.expectedContent,
    expectedSelection: {
      anchor: expectedSelectionAnchor,
      head: expectedSelectionAnchor
    },
    grammar: "list",
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runStrictHumanListInputCases(): Promise<CaseResult[]> {
  const mainExpectedContent = [
    "- content 01",
    "- 中文内容 02",
    "",
    "1. ordered 01",
    "2. 有序内容 02",
    "",
    "- parent",
    "  - child 01",
    "  - 中文 child 02",
    "",
    "- final"
  ].join("\n");

  return [
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "content 01" },
        { kind: "enter" },
        { kind: "type", text: "中文内容 02" },
        { kind: "enter" },
        { kind: "enter" },
        { kind: "type", text: "1" },
        { kind: "type", text: "." },
        { kind: "type", text: " " },
        { kind: "type", text: "ordered 01" },
        { kind: "enter" },
        { kind: "type", text: "有序内容 02" },
        { kind: "enter" },
        { kind: "enter" },
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "parent" },
        { kind: "enter" },
        { kind: "tab" },
        { kind: "type", text: "child 01" },
        { kind: "enter" },
        { kind: "type", text: "中文 child 02" },
        { kind: "enter" },
        { kind: "enter" },
        { kind: "enter" },
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "final" }
      ],
      checkpoints: [
        {
          afterAction: 1,
          expectedContent: "-",
          name: "bare dash is still paragraph source"
        },
        {
          afterAction: 2,
          expectedContent: "- ",
          name: "dash-space commits an unordered marker"
        },
        {
          afterAction: 10,
          expectedContent: ["- content 01", "- 中文内容 02", "", "1. "].join("\n"),
          name: "ordered marker commits only after dot-space"
        },
        {
          afterAction: 20,
          expectedContent: [
            "- content 01",
            "- 中文内容 02",
            "",
            "1. ordered 01",
            "2. 有序内容 02",
            "",
            "- parent",
            "  - "
          ].join("\n"),
          name: "Tab demotes the auto-created child marker"
        }
      ],
      expectedContent: mainExpectedContent,
      name: "strict human typing builds mixed unordered ordered and nested lists",
      visibleTexts: ["content 01", "中文内容 02", "ordered 01", "有序内容 02", "child 01", "中文 child 02", "final"]
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes a just-created unordered marker without source fallback"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "1" },
        { kind: "type", text: "." },
        { kind: "type", text: " " },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes a just-created ordered marker without source fallback"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "[ ] " },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes a just-created unchecked task marker without source fallback"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "[x] " },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes a just-created checked task marker without source fallback"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "content 01" },
        { kind: "backspace", count: Array.from("content 01").length },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes an empty unordered marker after content is deleted"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "中文内容 02" },
        { kind: "backspace", count: Array.from("中文内容 02").length },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes an empty Chinese unordered marker"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "1" },
        { kind: "type", text: "." },
        { kind: "type", text: " " },
        { kind: "type", text: "ordered 01" },
        { kind: "backspace", count: Array.from("ordered 01").length },
        { kind: "backspace" }
      ],
      expectedContent: "",
      name: "strict Backspace removes an empty ordered marker after content is deleted"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "parent" },
        { kind: "enter" },
        { kind: "tab" },
        { kind: "type", text: "child" },
        { kind: "backspace", count: Array.from("child").length },
        { kind: "backspace" },
        { kind: "backspace" },
        { kind: "backspace" }
      ],
      checkpoints: [
        {
          afterAction: 8,
          expectedContent: "- parent\n  ",
          name: "child marker deletion preserves child indentation"
        },
        {
          afterAction: 9,
          expectedContent: "- parent\n ",
          name: "child indentation deletes one source space at a time"
        }
      ],
      expectedContent: "- parent\n",
      name: "strict Backspace removes a child marker and indentation in source order"
    }),
    await runStrictHumanListInputCase({
      actions: [
        { kind: "type", text: "-" },
        { kind: "type", text: " " },
        { kind: "type", text: "item" },
        { kind: "enter" },
        { kind: "backspace" }
      ],
      expectedContent: "- item\n",
      name: "strict Backspace removes an auto-created empty list item"
    })
  ];
}

async function runBareMarkerDraftInputCase(input: {
  contentText: string;
  markerInput: string;
  name: string;
}): Promise<CaseResult> {
  const initialContent = "";
  const committedMarker = `${input.markerInput} `;
  const expectedContent = `${committedMarker}${input.contentText}`;
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(0);
  await settle();

  const markerInsertResults: boolean[] = [];

  for (const character of Array.from(input.markerInput)) {
    markerInsertResults.push(nativeInsertText(harness.view, character));
    await settle();
  }

  const markerInsertAccepted = markerInsertResults.every(Boolean);

  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();
  const lineAfterMarker = findLineByText(harness.root, input.markerInput);
  const lineAfterMarkerClasses = lineAfterMarker?.className ?? "";
  const markerBeforePadding = lineAfterMarker?.querySelector(".cm-active-list-marker") ?? null;
  const paddingInsertAccepted = nativeInsertText(harness.view, " ");
  await settle();

  const contentAfterPadding = harness.controller.getContent();
  const selectionAfterPadding = harness.controller.getSelection();
  const lineAfterPadding = findLineByText(harness.root, committedMarker);
  const lineAfterPaddingClasses = lineAfterPadding?.className ?? "";
  const activeMarker = lineAfterPadding?.querySelector(".cm-active-list-marker") ?? null;
  const caretAfterPaddingRect = harness.view.coordsAtPos(selectionAfterPadding.anchor);
  const caretAfterPaddingHeight =
    caretAfterPaddingRect !== null &&
    Number.isFinite(caretAfterPaddingRect.bottom) &&
    Number.isFinite(caretAfterPaddingRect.top)
      ? Math.max(0, caretAfterPaddingRect.bottom - caretAfterPaddingRect.top)
      : null;
  const markerRect = activeMarker?.getBoundingClientRect() ?? null;
  const caretAfterPaddingHasGeometry =
    caretAfterPaddingHeight !== null &&
    caretAfterPaddingHeight > 0;
  const caretAfterPaddingIsAfterMarker =
    caretAfterPaddingRect !== null &&
    markerRect !== null &&
    caretAfterPaddingRect.left > markerRect.right + 1;
  const markerStyle = activeMarker instanceof Element
    ? window.getComputedStyle(activeMarker)
    : null;
  const markerColor = markerStyle?.color ?? "";
  const markerVisible = !isTransparentColor(markerColor);
  const contentInsertAccepted = nativeInsertText(harness.view, input.contentText);
  await settle();

  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, input.contentText);
  const finalLineClasses = finalLine?.className ?? "";
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .map((line) => line.textContent ?? "")
    .filter((text) => text.length > 0);
  const pass =
    markerInsertAccepted &&
    paddingInsertAccepted &&
    contentInsertAccepted &&
    contentAfterMarker === input.markerInput &&
    selectionAfterMarker.anchor === input.markerInput.length &&
    selectionAfterMarker.head === input.markerInput.length &&
    lineAfterMarker !== null &&
    /\bcm-active-paragraph\b/u.test(lineAfterMarkerClasses) &&
    !/\bcm-active-list\b/u.test(lineAfterMarkerClasses) &&
    markerBeforePadding === null &&
    contentAfterPadding === committedMarker &&
    selectionAfterPadding.anchor === committedMarker.length &&
    selectionAfterPadding.head === committedMarker.length &&
    harness.controller.getContent() === expectedContent &&
    harness.view.state.doc.lines === 1 &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    lineAfterPadding !== null &&
    /\bcm-active-list\b/u.test(lineAfterPaddingClasses) &&
    activeMarker?.textContent === input.markerInput &&
    markerVisible &&
    caretAfterPaddingHasGeometry &&
    caretAfterPaddingIsAfterMarker &&
    finalLine !== null &&
    /\bcm-active-list\b/u.test(finalLineClasses) &&
    isVisibleTextPresent(harness.root, input.contentText) &&
    visibleLines.length === 1;

  const result = resultFor({
    details: {
      activeMarkerText: activeMarker?.textContent ?? null,
      caretAfterPaddingHasGeometry,
      caretAfterPaddingHeight,
      caretAfterPaddingIsAfterMarker,
      caretAfterPaddingLeft: caretAfterPaddingRect?.left ?? null,
      contentAfterMarker,
      contentAfterPadding,
      contentInsertAccepted,
      documentLines: harness.view.state.doc.lines,
      finalLineClasses,
      lineAfterMarkerClasses,
      lineAfterPaddingClasses,
      markerLeft: markerRect?.left ?? null,
      markerBeforePaddingText: markerBeforePadding?.textContent ?? null,
      markerColor,
      markerVisible,
      markerRight: markerRect?.right ?? null,
      markerInsertAccepted,
      markerInsertResults,
      paddingInsertAccepted,
      selectionAfterPadding,
      selectionAfterMarker,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "list",
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runSingleDashDraftInputCase(): Promise<CaseResult> {
  return runBareMarkerDraftInputCase({
    contentText: "content",
    markerInput: "-",
    name: "a bare dash stays paragraph text until a following space commits the list marker"
  });
}

async function runSingleOrderedMarkerDraftInputCase(): Promise<CaseResult> {
  return runBareMarkerDraftInputCase({
    contentText: "中文",
    markerInput: "1.",
    name: "a bare ordered marker stays paragraph text until a following space commits the list marker"
  });
}

async function runSingleDashDirectChineseInputCase(): Promise<CaseResult> {
  const initialContent = "";
  const expectedContent = "-中文";
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(0);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, "-");
  await settle();

  const markerSelection = harness.controller.getSelection();
  const firstChineseInsertAccepted = nativeInsertText(harness.view, "中");
  await settle();

  const contentAfterFirstChinese = harness.controller.getContent();
  const selectionAfterFirstChinese = harness.controller.getSelection();
  const secondChineseInsertAccepted = nativeInsertText(harness.view, "文");
  await settle();

  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "中文");
  const finalLineClasses = finalLine?.className ?? "";
  const marker = finalLine?.querySelector(".cm-active-list-marker") ?? null;
  const chineseRect = findTextRect(harness.root, "中文");
  const firstChineseRect = findTextRect(harness.root, "中");
  const lineRect = finalLine?.getBoundingClientRect() ?? null;
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .map((line) => line.textContent ?? "")
    .filter((text) => text.length > 0);
  const firstChineseStaysOnLine =
    firstChineseRect !== null &&
    lineRect !== null &&
    firstChineseRect.top >= lineRect.top - 2 &&
    firstChineseRect.bottom <= lineRect.bottom + 2;
  const caretHasGeometry =
    caretRect !== null &&
    Number.isFinite(caretRect.top) &&
    Number.isFinite(caretRect.bottom) &&
    caretRect.bottom > caretRect.top;
  const caretStaysAfterChinese =
    caretRect !== null &&
    chineseRect !== null &&
    caretRect.left >= chineseRect.right - 2 &&
    Math.abs(caretRect.top - chineseRect.top) <= 2;
  const pass =
    markerInsertAccepted &&
    firstChineseInsertAccepted &&
    secondChineseInsertAccepted &&
    markerSelection.anchor === 1 &&
    markerSelection.head === 1 &&
    contentAfterFirstChinese === "-中" &&
    selectionAfterFirstChinese.anchor === "-中".length &&
    selectionAfterFirstChinese.head === "-中".length &&
    harness.controller.getContent() === expectedContent &&
    harness.view.state.doc.lines === 1 &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-active-paragraph\b/u.test(finalLineClasses) &&
    !/\bcm-active-list\b/u.test(finalLineClasses) &&
    marker === null &&
    chineseRect !== null &&
    firstChineseStaysOnLine &&
    caretHasGeometry &&
    caretStaysAfterChinese &&
    visibleLines.length === 1;

  const result = resultFor({
    details: {
      caretHasGeometry,
      caretLeft: caretRect?.left ?? null,
      caretStaysAfterChinese,
      caretTop: caretRect?.top ?? null,
      chineseLeft: chineseRect?.left ?? null,
      chineseRight: chineseRect?.right ?? null,
      chineseTop: chineseRect?.top ?? null,
      contentAfterFirstChinese,
      documentLines: harness.view.state.doc.lines,
      finalLineClasses,
      firstChineseInsertAccepted,
      firstChineseStaysOnLine,
      lineBottom: lineRect?.bottom ?? null,
      lineTop: lineRect?.top ?? null,
      markerInsertAccepted,
      markerText: marker?.textContent ?? null,
      markerSelection,
      secondChineseInsertAccepted,
      selectionAfterFirstChinese,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "paragraph",
    harness,
    name: "typing Chinese directly after a bare dash keeps paragraph text on one line",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runSingleOrderedMarkerDirectChineseInputCase(): Promise<CaseResult> {
  const initialContent = "";
  const markerInput = "1.";
  const expectedContent = "1.中文";
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(0);
  await settle();

  const markerInsertResults: boolean[] = [];

  for (const character of Array.from(markerInput)) {
    markerInsertResults.push(nativeInsertText(harness.view, character));
    await settle();
  }

  const markerInsertAccepted = markerInsertResults.every(Boolean);
  const markerSelection = harness.controller.getSelection();
  const firstChineseInsertAccepted = nativeInsertText(harness.view, "中");
  await settle();

  const contentAfterFirstChinese = harness.controller.getContent();
  const selectionAfterFirstChinese = harness.controller.getSelection();
  const secondChineseInsertAccepted = nativeInsertText(harness.view, "文");
  await settle();

  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "中文");
  const finalLineClasses = finalLine?.className ?? "";
  const marker = finalLine?.querySelector(".cm-active-list-marker") ?? null;
  const chineseRect = findTextRect(harness.root, "中文");
  const firstChineseRect = findTextRect(harness.root, "中");
  const lineRect = finalLine?.getBoundingClientRect() ?? null;
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .map((line) => line.textContent ?? "")
    .filter((text) => text.length > 0);
  const firstChineseStaysOnLine =
    firstChineseRect !== null &&
    lineRect !== null &&
    firstChineseRect.top >= lineRect.top - 2 &&
    firstChineseRect.bottom <= lineRect.bottom + 2;
  const caretHasGeometry =
    caretRect !== null &&
    Number.isFinite(caretRect.top) &&
    Number.isFinite(caretRect.bottom) &&
    caretRect.bottom > caretRect.top;
  const caretStaysAfterChinese =
    caretRect !== null &&
    chineseRect !== null &&
    caretRect.left >= chineseRect.right - 2 &&
    Math.abs(caretRect.top - chineseRect.top) <= 2;
  const pass =
    markerInsertAccepted &&
    firstChineseInsertAccepted &&
    secondChineseInsertAccepted &&
    markerSelection.anchor === markerInput.length &&
    markerSelection.head === markerInput.length &&
    contentAfterFirstChinese === "1.中" &&
    selectionAfterFirstChinese.anchor === "1.中".length &&
    selectionAfterFirstChinese.head === "1.中".length &&
    harness.controller.getContent() === expectedContent &&
    harness.view.state.doc.lines === 1 &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-active-paragraph\b/u.test(finalLineClasses) &&
    !/\bcm-active-list\b/u.test(finalLineClasses) &&
    marker === null &&
    chineseRect !== null &&
    firstChineseStaysOnLine &&
    caretHasGeometry &&
    caretStaysAfterChinese &&
    visibleLines.length === 1;

  const result = resultFor({
    details: {
      caretHasGeometry,
      caretLeft: caretRect?.left ?? null,
      caretStaysAfterChinese,
      caretTop: caretRect?.top ?? null,
      chineseLeft: chineseRect?.left ?? null,
      chineseRight: chineseRect?.right ?? null,
      chineseTop: chineseRect?.top ?? null,
      contentAfterFirstChinese,
      documentLines: harness.view.state.doc.lines,
      finalLineClasses,
      firstChineseInsertAccepted,
      firstChineseStaysOnLine,
      lineBottom: lineRect?.bottom ?? null,
      lineTop: lineRect?.top ?? null,
      markerInsertAccepted,
      markerInsertResults,
      markerText: marker?.textContent ?? null,
      markerSelection,
      secondChineseInsertAccepted,
      selectionAfterFirstChinese,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "paragraph",
    harness,
    name: "typing Chinese directly after a bare ordered marker keeps paragraph text on one line",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBareDashCompositionPreviewCase(): Promise<CaseResult> {
  const initialContent = "";
  const expectedContent = "-list";
  const harness = setupHarness(initialContent);
  const editorRoot = harness.root.querySelector<HTMLElement>(".cm-editor");
  if (!editorRoot) {
    throw new Error("Missing editor root.");
  }

  harness.controller.setSelection(0);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, "-");
  await settle();

  const selectionAfterMarker = harness.controller.getSelection();
  const compositionStartAccepted = dispatchCompositionEvent(editorRoot, "compositionstart", "l");
  const compositionUpdateAccepted = dispatchCompositionEvent(editorRoot, "compositionupdate", "list");
  const previewInsertAccepted = nativeInsertText(harness.view, "list");
  await settle();

  const finalSelection = harness.controller.getSelection();
  const line = findLineByText(harness.root, "list");
  const lineClasses = line?.className ?? "";
  const dashRect = findTextRect(harness.root, "-");
  const previewRect = findTextRect(harness.root, "list");
  const lineRect = line?.getBoundingClientRect() ?? null;
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const previewStaysOnMarkerLine =
    dashRect !== null &&
    previewRect !== null &&
    Math.abs(previewRect.top - dashRect.top) <= 2 &&
    lineRect !== null &&
    previewRect.top >= lineRect.top - 2 &&
    previewRect.bottom <= lineRect.bottom + 2;
  const previewStartsAfterMarker =
    dashRect !== null &&
    previewRect !== null &&
    previewRect.left >= dashRect.right - 2;
  const caretStaysAfterPreview =
    caretRect !== null &&
    previewRect !== null &&
    caretRect.left >= previewRect.right - 2 &&
    Math.abs(caretRect.top - previewRect.top) <= 2;
  const pass =
    markerInsertAccepted &&
    compositionStartAccepted &&
    compositionUpdateAccepted &&
    previewInsertAccepted &&
    selectionAfterMarker.anchor === 1 &&
    selectionAfterMarker.head === 1 &&
    harness.controller.getContent() === expectedContent &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    line !== null &&
    /\bcm-active-paragraph\b/u.test(lineClasses) &&
    !/\bcm-active-list\b/u.test(lineClasses) &&
    line.querySelector(".cm-active-list-marker") === null &&
    previewStaysOnMarkerLine &&
    previewStartsAfterMarker &&
    caretStaysAfterPreview;

  dispatchCompositionEvent(editorRoot, "compositionend", "list");
  await settle();

  const result = resultFor({
    details: {
      caretLeft: caretRect?.left ?? null,
      caretStaysAfterPreview,
      caretTop: caretRect?.top ?? null,
      compositionStartAccepted,
      compositionUpdateAccepted,
      dashBottom: dashRect?.bottom ?? null,
      dashLeft: dashRect?.left ?? null,
      dashRight: dashRect?.right ?? null,
      dashTop: dashRect?.top ?? null,
      lineBottom: lineRect?.bottom ?? null,
      lineClasses,
      lineTop: lineRect?.top ?? null,
      markerInsertAccepted,
      previewBottom: previewRect?.bottom ?? null,
      previewInsertAccepted,
      previewLeft: previewRect?.left ?? null,
      previewRight: previewRect?.right ?? null,
      previewStartsAfterMarker,
      previewStaysOnMarkerLine,
      previewTop: previewRect?.top ?? null,
      selectionAfterMarker
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "paragraph",
    harness,
    name: "IME composition preview after a bare dash stays on the same paragraph line",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runCommittedDashListCompositionPreviewCase(): Promise<CaseResult> {
  const initialContent = "";
  const committedMarker = "- ";
  const compositionText = "list";
  const expectedContent = `${committedMarker}${compositionText}`;
  const harness = setupHarness(initialContent);
  const editorRoot = harness.root.querySelector<HTMLElement>(".cm-editor");
  if (!editorRoot) {
    throw new Error("Missing editor root.");
  }

  harness.controller.setSelection(0);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, "-");
  await settle();

  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();
  const lineAfterMarker = findLineByText(harness.root, "-");
  const lineAfterMarkerClasses = lineAfterMarker?.className ?? "";
  const markerBeforePadding = lineAfterMarker?.querySelector(".cm-active-list-marker") ?? null;

  const paddingInsertAccepted = nativeInsertText(harness.view, " ");
  await settle();

  const contentAfterPadding = harness.controller.getContent();
  const selectionAfterPadding = harness.controller.getSelection();
  const lineAfterPadding = findLineByText(harness.root, committedMarker);
  const lineAfterPaddingClasses = lineAfterPadding?.className ?? "";
  const activeMarker = lineAfterPadding?.querySelector<HTMLElement>(".cm-active-list-marker") ?? null;
  const sourcePrefix = lineAfterPadding?.querySelector<HTMLElement>(".cm-active-list-source-prefix") ?? null;
  const paddingAnchor = lineAfterPadding?.querySelector<HTMLElement>(".cm-active-list-padding-anchor") ?? null;
  const markerRect = activeMarker?.getBoundingClientRect() ?? null;
  const sourcePrefixRect = sourcePrefix?.getBoundingClientRect() ?? null;
  const paddingAnchorRect = paddingAnchor?.getBoundingClientRect() ?? null;
  const paddingAnchorStyle = paddingAnchor instanceof Element
    ? window.getComputedStyle(paddingAnchor)
    : null;
  const paddingAnchorCaretColor = paddingAnchorStyle?.caretColor ?? "";
  const paddingAnchorOverflow = paddingAnchorStyle?.overflow ?? "";
  const paddingAnchorTextColor = paddingAnchorStyle?.color ?? "";
  const paddingAnchorWidth = paddingAnchorRect?.width ?? null;
  const imePreeditVisibilityProbe = measureTemporaryInlineText(paddingAnchor, "pin");
  const lineAfterPaddingRect = lineAfterPadding?.getBoundingClientRect() ?? null;
  const caretAfterPaddingRect = harness.view.coordsAtPos(selectionAfterPadding.anchor);
  const domSelectionAfterPadding = describeDomSelectionGeometry();

  const compositionStartAccepted = dispatchCompositionEvent(editorRoot, "compositionstart", "l");
  const compositionUpdateAccepted = dispatchCompositionEvent(editorRoot, "compositionupdate", compositionText);
  const previewInsertAccepted = nativeInsertText(harness.view, compositionText);
  await settle();

  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, compositionText);
  const finalLineClasses = finalLine?.className ?? "";
  const previewRect = findTextRect(harness.root, compositionText);
  const finalLineRect = finalLine?.getBoundingClientRect() ?? null;
  const caretAfterPreviewRect = harness.view.coordsAtPos(finalSelection.anchor);
  const domSelectionAfterPreview = describeDomSelectionGeometry();
  const activeMarkerAfterPreview = finalLine?.querySelector<HTMLElement>(".cm-active-list-marker") ?? null;
  const markerAfterPreviewRect = activeMarkerAfterPreview?.getBoundingClientRect() ?? null;
  const sourcePrefixAfterPreview =
    finalLine?.querySelector<HTMLElement>(".cm-active-list-source-prefix") ?? null;
  const sourcePrefixAfterPreviewRect = sourcePrefixAfterPreview?.getBoundingClientRect() ?? null;
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .map((line) => line.textContent ?? "")
    .filter((text) => text.length > 0);
  const markerStyle = activeMarkerAfterPreview instanceof Element
    ? window.getComputedStyle(activeMarkerAfterPreview)
    : null;
  const markerColor = markerStyle?.color ?? "";
  const markerVisible = !isTransparentColor(markerColor);
  const caretAfterPaddingHasGeometry =
    caretAfterPaddingRect !== null &&
    Number.isFinite(caretAfterPaddingRect.left) &&
    Number.isFinite(caretAfterPaddingRect.top);
  const caretAfterPaddingStaysOnMarkerLine =
    caretAfterPaddingRect !== null &&
    lineAfterPaddingRect !== null &&
    caretAfterPaddingRect.top >= lineAfterPaddingRect.top - 2 &&
    caretAfterPaddingRect.bottom <= lineAfterPaddingRect.bottom + 2;
  const domSelectionAfterPaddingHasGeometry =
    typeof domSelectionAfterPadding.rectHeight === "number" &&
    domSelectionAfterPadding.rectHeight > 0;
  const domSelectionAfterPaddingStaysOnMarkerLine =
    typeof domSelectionAfterPadding.rectTop === "number" &&
    typeof domSelectionAfterPadding.rectBottom === "number" &&
    lineAfterPaddingRect !== null &&
    domSelectionAfterPadding.rectTop >= lineAfterPaddingRect.top - 2 &&
    domSelectionAfterPadding.rectBottom <= lineAfterPaddingRect.bottom + 2;
  const previewStaysOnMarkerLine =
    previewRect !== null &&
    finalLineRect !== null &&
    previewRect.top >= finalLineRect.top - 2 &&
    previewRect.bottom <= finalLineRect.bottom + 2;
  const previewStartsAfterMarker =
    previewRect !== null &&
    markerAfterPreviewRect !== null &&
    previewRect.left >= markerAfterPreviewRect.right - 2;
  const previewStartsAfterHiddenPrefixAnchor =
    previewRect !== null &&
    sourcePrefixAfterPreviewRect !== null &&
    previewRect.left >= sourcePrefixAfterPreviewRect.right - 2;
  const markerPaddingUsesEditableImeAnchor =
    sourcePrefix === null &&
    sourcePrefixAfterPreview === null &&
    paddingAnchor?.textContent === " " &&
    paddingAnchorWidth !== null &&
    paddingAnchorWidth > 0 &&
    paddingAnchorOverflow === "visible" &&
    !isTransparentColor(paddingAnchorCaretColor) &&
    !isTransparentColor(paddingAnchorTextColor) &&
    imePreeditVisibilityProbe.width !== null &&
    imePreeditVisibilityProbe.width > 0 &&
    imePreeditVisibilityProbe.height !== null &&
    imePreeditVisibilityProbe.height > 0 &&
    !isTransparentColor(imePreeditVisibilityProbe.color ?? "") &&
    domSelectionAfterPadding.anchorParentClass === "cm-active-list-padding-anchor" &&
    domSelectionAfterPreview.anchorParentClass === finalLineClasses;
  const caretStaysAfterPreview =
    caretAfterPreviewRect !== null &&
    previewRect !== null &&
    caretAfterPreviewRect.left >= previewRect.right - 2 &&
    Math.abs(caretAfterPreviewRect.top - previewRect.top) <= 2;
  const pass =
    markerInsertAccepted &&
    paddingInsertAccepted &&
    compositionStartAccepted &&
    compositionUpdateAccepted &&
    previewInsertAccepted &&
    contentAfterMarker === "-" &&
    selectionAfterMarker.anchor === 1 &&
    selectionAfterMarker.head === 1 &&
    lineAfterMarker !== null &&
    /\bcm-active-paragraph\b/u.test(lineAfterMarkerClasses) &&
    !/\bcm-active-list\b/u.test(lineAfterMarkerClasses) &&
    markerBeforePadding === null &&
    contentAfterPadding === committedMarker &&
    selectionAfterPadding.anchor === committedMarker.length &&
    selectionAfterPadding.head === committedMarker.length &&
    lineAfterPadding !== null &&
    /\bcm-active-list\b/u.test(lineAfterPaddingClasses) &&
    activeMarker?.textContent === "-" &&
    markerPaddingUsesEditableImeAnchor &&
    caretAfterPaddingHasGeometry &&
    caretAfterPaddingStaysOnMarkerLine &&
    domSelectionAfterPaddingHasGeometry &&
    domSelectionAfterPaddingStaysOnMarkerLine &&
    harness.controller.getContent() === expectedContent &&
    harness.view.state.doc.lines === 1 &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-active-list\b/u.test(finalLineClasses) &&
    activeMarkerAfterPreview?.textContent === "-" &&
    markerVisible &&
    previewStaysOnMarkerLine &&
    previewStartsAfterMarker &&
    caretStaysAfterPreview &&
    visibleLines.length === 1;

  dispatchCompositionEvent(editorRoot, "compositionend", compositionText);
  await settle();

  const result = resultFor({
    details: {
      activeMarkerText: activeMarker?.textContent ?? null,
      caretAfterPaddingHasGeometry,
      caretAfterPaddingLeft: caretAfterPaddingRect?.left ?? null,
      caretAfterPaddingStaysOnMarkerLine,
      caretAfterPaddingTop: caretAfterPaddingRect?.top ?? null,
      caretAfterPreviewLeft: caretAfterPreviewRect?.left ?? null,
      caretAfterPreviewTop: caretAfterPreviewRect?.top ?? null,
      caretStaysAfterPreview,
      compositionStartAccepted,
      compositionUpdateAccepted,
      contentAfterMarker,
      contentAfterPadding,
      domSelectionAfterPadding,
      domSelectionAfterPaddingHasGeometry,
      domSelectionAfterPaddingStaysOnMarkerLine,
      domSelectionAfterPreview,
      finalLineClasses,
      lineAfterMarkerClasses,
      lineAfterPaddingBottom: lineAfterPaddingRect?.bottom ?? null,
      lineAfterPaddingClasses,
      lineAfterPaddingTop: lineAfterPaddingRect?.top ?? null,
      markerAfterPreviewLeft: markerAfterPreviewRect?.left ?? null,
      markerAfterPreviewRight: markerAfterPreviewRect?.right ?? null,
      markerInsertAccepted,
      markerColor,
      markerVisible,
      markerRight: markerRect?.right ?? null,
      markerPaddingAnchorCaretColor: paddingAnchorCaretColor,
      markerPaddingAnchorOverflow: paddingAnchorOverflow,
      markerPaddingAnchorText: paddingAnchor?.textContent ?? null,
      markerPaddingAnchorTextColor: paddingAnchorTextColor,
      markerPaddingAnchorWidth: paddingAnchorWidth,
      markerPaddingUsesEditableImeAnchor,
      simulatedImePreeditColor: imePreeditVisibilityProbe.color,
      simulatedImePreeditHeight: imePreeditVisibilityProbe.height,
      simulatedImePreeditWidth: imePreeditVisibilityProbe.width,
      paddingInsertAccepted,
      previewInsertAccepted,
      previewLeft: previewRect?.left ?? null,
      previewRight: previewRect?.right ?? null,
      previewStartsAfterHiddenPrefixAnchor,
      previewStartsAfterMarker,
      previewStaysOnMarkerLine,
      previewTop: previewRect?.top ?? null,
      selectionAfterMarker,
      selectionAfterPadding,
      sourcePrefixAfterPreviewRight: sourcePrefixAfterPreviewRect?.right ?? null,
      sourcePrefixText: sourcePrefix?.textContent ?? null,
      sourcePrefixWidth: sourcePrefixRect?.width ?? null,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "list",
    harness,
    name: "IME composition preview after dash-space list marker stays after the active marker",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runListDoubleEnterExitInsertCase(): Promise<CaseResult> {
  const initialContent = ["- 11111", "- 22222"].join("\n");
  const expectedContent = ["- 11111", "- 22222", "", "正文一", "", "正文二"].join("\n");
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

async function runHeadingEnterSpaceCaretCase(): Promise<CaseResult> {
  const initialContent = "# Title";
  const expectedContent = `${initialContent}\n\n `;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();

  const enterEventAccepted = dispatchEnter(harness.view);
  await settle();

  const contentAfterEnter = harness.controller.getContent();
  const selectionAfterEnter = harness.controller.getSelection();
  const caretAfterEnterRect = harness.view.coordsAtPos(selectionAfterEnter.anchor);
  const cursorAfterEnterRect =
    harness.root.querySelector<HTMLElement>(".cm-cursor")?.getBoundingClientRect() ?? null;
  const domSelectionAfterEnter = describeDomSelectionGeometry();

  const spaceInsertAccepted = nativeInsertText(harness.view, " ");
  await settle();

  const selectionAfterSpace = harness.controller.getSelection();
  const caretAfterSpaceRect = harness.view.coordsAtPos(selectionAfterSpace.anchor);
  const cursorAfterSpaceRect =
    harness.root.querySelector<HTMLElement>(".cm-cursor")?.getBoundingClientRect() ?? null;
  const domSelectionAfterSpace = describeDomSelectionGeometry();
  const linesAfterSpace = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    whiteSpace: window.getComputedStyle(line).whiteSpace
  }));
  const activeWhitespaceLine = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).find(
    (line) => (line.textContent ?? "") === " " && !line.classList.contains("cm-inactive-blank-line")
  ) ?? null;
  const activeWhitespaceLineStyle = activeWhitespaceLine
    ? window.getComputedStyle(activeWhitespaceLine)
    : null;
  const activeWhitespaceLineHasPhysicalSurface =
    activeWhitespaceLine?.classList.contains("cm-fm-line") === true &&
    activeWhitespaceLine.classList.contains("cm-fm-line-whitespace") &&
    activeWhitespaceLine.classList.contains("cm-fm-line-active");
  const caretMovedAfterSpace =
    caretAfterEnterRect !== null &&
    caretAfterSpaceRect !== null &&
    caretAfterSpaceRect.left > caretAfterEnterRect.left + 1;
  const pass =
    contentAfterEnter === `${initialContent}\n\n` &&
    selectionAfterEnter.anchor === `${initialContent}\n\n`.length &&
    selectionAfterEnter.head === `${initialContent}\n\n`.length &&
    spaceInsertAccepted &&
    harness.controller.getContent() === expectedContent &&
    selectionAfterSpace.anchor === expectedContent.length &&
    selectionAfterSpace.head === expectedContent.length &&
    caretMovedAfterSpace &&
    activeWhitespaceLine !== null &&
    activeWhitespaceLineHasPhysicalSurface &&
    activeWhitespaceLineStyle?.whiteSpace === "pre-wrap";

  const result = resultFor({
    caseId: "heading-empty-paragraph-space",
    details: {
      activeWhitespaceLineClassName: activeWhitespaceLine?.className ?? null,
      activeWhitespaceLineHasPhysicalSurface,
      activeWhitespaceLineText: activeWhitespaceLine?.textContent ?? null,
      activeWhitespaceLineWhiteSpace: activeWhitespaceLineStyle?.whiteSpace ?? null,
      caretAfterEnter: describeRect(caretAfterEnterRect),
      caretAfterSpace: describeRect(caretAfterSpaceRect),
      caretLeftDelta:
        caretAfterEnterRect !== null && caretAfterSpaceRect !== null
          ? caretAfterSpaceRect.left - caretAfterEnterRect.left
          : null,
      caretMovedAfterSpace,
      contentAfterEnter,
      cursorAfterEnter: describeRect(cursorAfterEnterRect),
      cursorAfterSpace: describeRect(cursorAfterSpaceRect),
      cursorLeftDelta:
        cursorAfterEnterRect !== null && cursorAfterSpaceRect !== null
          ? cursorAfterSpaceRect.left - cursorAfterEnterRect.left
          : null,
      domSelectionAfterEnter,
      domSelectionAfterSpace,
      enterEventAccepted,
      linesAfterSpace,
      selectionAfterEnter,
      selectionAfterSpace,
      spaceInsertAccepted
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "heading",
    harness,
    name: "space after Enter at heading end advances the caret visually",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runEmptyDocumentSpaceCaretCase(): Promise<CaseResult> {
  const initialContent = "";
  const expectedContent = " ";
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(0);
  await settle();

  const selectionBeforeSpace = harness.controller.getSelection();
  const caretBeforeSpaceRect = harness.view.coordsAtPos(selectionBeforeSpace.anchor);
  const domSelectionBeforeSpace = describeDomSelectionGeometry();
  const linesBeforeSpace = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    whiteSpace: window.getComputedStyle(line).whiteSpace
  }));

  const spaceInsertAccepted = nativeInsertText(harness.view, " ");
  await settle();

  const selectionAfterSpace = harness.controller.getSelection();
  const caretAfterSpaceRect = harness.view.coordsAtPos(selectionAfterSpace.anchor);
  const domSelectionAfterSpace = describeDomSelectionGeometry();
  const linesAfterSpace = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    whiteSpace: window.getComputedStyle(line).whiteSpace
  }));
  const activeWhitespaceLine = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).find(
    (line) => (line.textContent ?? "") === " "
  ) ?? null;
  const activeWhitespaceLineStyle = activeWhitespaceLine
    ? window.getComputedStyle(activeWhitespaceLine)
    : null;
  const activeWhitespaceLineHasPhysicalSurface =
    activeWhitespaceLine?.classList.contains("cm-fm-line") === true &&
    activeWhitespaceLine.classList.contains("cm-fm-line-whitespace") &&
    activeWhitespaceLine.classList.contains("cm-fm-line-active");
  const caretMovedAfterSpace =
    caretBeforeSpaceRect !== null &&
    caretAfterSpaceRect !== null &&
    caretAfterSpaceRect.left > caretBeforeSpaceRect.left + 1;
  const pass =
    selectionBeforeSpace.anchor === 0 &&
    selectionBeforeSpace.head === 0 &&
    spaceInsertAccepted &&
    harness.controller.getContent() === expectedContent &&
    selectionAfterSpace.anchor === expectedContent.length &&
    selectionAfterSpace.head === expectedContent.length &&
    caretMovedAfterSpace &&
    activeWhitespaceLine !== null &&
    activeWhitespaceLineHasPhysicalSurface &&
    activeWhitespaceLineStyle?.whiteSpace === "pre-wrap";

  const result = resultFor({
    caseId: "empty-type-one-space",
    details: {
      activeWhitespaceLineClassName: activeWhitespaceLine?.className ?? null,
      activeWhitespaceLineHasPhysicalSurface,
      activeWhitespaceLineText: activeWhitespaceLine?.textContent ?? null,
      activeWhitespaceLineWhiteSpace: activeWhitespaceLineStyle?.whiteSpace ?? null,
      caretAfterSpace: describeRect(caretAfterSpaceRect),
      caretBeforeSpace: describeRect(caretBeforeSpaceRect),
      caretLeftDelta:
        caretBeforeSpaceRect !== null && caretAfterSpaceRect !== null
          ? caretAfterSpaceRect.left - caretBeforeSpaceRect.left
          : null,
      caretMovedAfterSpace,
      domSelectionAfterSpace,
      domSelectionBeforeSpace,
      linesAfterSpace,
      linesBeforeSpace,
      selectionAfterSpace,
      selectionBeforeSpace,
      spaceInsertAccepted
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "paragraph",
    harness,
    name: "space at empty document start advances the caret visually",
    pass
  });
  harness.controller.destroy();
  return result;
}

function selectionAtEnd(content: string): { anchor: number; head: number } {
  return { anchor: content.length, head: content.length };
}

async function runOracleActionCase(input: {
  actions: OracleProbeAction[];
  caseId: string;
  expectedContent: string;
  expectedSelection?: { anchor: number; head: number };
  grammar: string;
  group: string;
  initialContent: string;
  initialSelection: number;
  name: string;
  visualAssertions?: OracleVisualAssertionFactory;
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);

  harness.controller.setSelection(input.initialSelection);
  await settle();

  const selectionBeforeActions = harness.controller.getSelection();
  const actionResults: Array<Record<string, unknown>> = [];
  let textInsertAccepted = true;

  for (const [index, action] of input.actions.entries()) {
    if (action.type === "type") {
      const characterResults: boolean[] = [];

      for (const character of Array.from(action.text)) {
        characterResults.push(nativeInsertText(harness.view, character));
        await settle();
      }

      const accepted = characterResults.every(Boolean);
      textInsertAccepted &&= accepted;
      actionResults.push({
        accepted,
        characterResults,
        contentAfterAction: harness.controller.getContent(),
        index,
        selectionAfterAction: harness.controller.getSelection(),
        text: action.text,
        type: action.type
      });
      continue;
    }

    const accepted = dispatchKey(harness.view, action.key);
    await settle();
    actionResults.push({
      accepted,
      contentAfterAction: harness.controller.getContent(),
      index,
      key: action.key,
      selectionAfterAction: harness.controller.getSelection(),
      type: action.type
    });
  }

  const expectedSelection = input.expectedSelection ?? selectionAtEnd(input.expectedContent);
  const actualSelection = harness.controller.getSelection();
  const actualContent = harness.controller.getContent();
  const linesAfterActions: LineSnapshot[] = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    whiteSpace: window.getComputedStyle(line).whiteSpace
  }));
  const caretAfterActionsRect = harness.view.coordsAtPos(actualSelection.anchor);
  const caretAfterActions = describeRect(caretAfterActionsRect);
  const visualAssertions = input.visualAssertions?.({
    actualContent,
    actualSelection,
    caretAfterActions,
    linesAfterActions
  }) ?? [];
  const visualPass = visualAssertions.every((assertion) => assertion.pass);
  const pass =
    textInsertAccepted &&
    actualContent === input.expectedContent &&
    actualSelection.anchor === expectedSelection.anchor &&
    actualSelection.head === expectedSelection.head &&
    visualPass;

  const result = resultFor({
    caseId: input.caseId,
    details: {
      actionResults,
      caretAfterActions,
      domSelectionAfterActions: describeDomSelectionGeometry(),
      group: input.group,
      linesAfterActions,
      selectionBeforeActions,
      visualAssertions,
      visualPass
    },
    expectedContent: input.expectedContent,
    expectedSelection,
    grammar: input.grammar,
    harness,
    name: input.name,
    pass
  });
  harness.controller.destroy();
  return result;
}

function runEmptyTypeHashCase(): Promise<CaseResult> {
  return runOracleActionCase({
    actions: [{ text: "#", type: "type" }],
    caseId: "empty-type-hash",
    expectedContent: "#",
    expectedSelection: { anchor: 1, head: 1 },
    grammar: "heading",
    group: "empty-document",
    initialContent: "",
    initialSelection: 0,
    name: "empty document typing hash keeps raw heading marker",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-active-heading", "cm-active-heading-depth-1"],
        text: "#",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

function runEmptyTypeThreeSpacesCase(): Promise<CaseResult> {
  return runOracleActionCase({
    actions: [{ text: "   ", type: "type" }],
    caseId: "empty-type-three-spaces",
    expectedContent: "   ",
    expectedSelection: { anchor: 3, head: 3 },
    grammar: "paragraph",
    group: "empty-document",
    initialContent: "",
    initialSelection: 0,
    name: "empty document typing three spaces preserves source spaces",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-fm-line", "cm-fm-line-whitespace", "cm-fm-line-active"],
        text: "   ",
        whiteSpace: "pre-wrap"
      }
    ])
  });
}

function runEmptySpacesEnterTextCase(): Promise<CaseResult> {
  const expectedContent = "   \n\nabc";

  return runOracleActionCase({
    actions: [
      { text: "   ", type: "type" },
      { key: "Enter", type: "key" },
      { text: "abc", type: "type" }
    ],
    caseId: "empty-spaces-enter-text",
    expectedContent,
    expectedSelection: selectionAtEnd(expectedContent),
    grammar: "paragraph",
    group: "empty-document",
    initialContent: "",
    initialSelection: 0,
    name: "empty document spaces then Enter then text matches oracle source",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-fm-line-whitespace"],
        text: "   ",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-active-paragraph"],
        text: "abc",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

function runEmptySpacesRepeatedEnterCase(): Promise<CaseResult> {
  const expectedContent = "   \n\n\n\n";

  return runOracleActionCase({
    actions: [
      { text: "   ", type: "type" },
      { key: "Enter", type: "key" },
      { key: "Enter", type: "key" }
    ],
    caseId: "empty-spaces-repeated-enter",
    expectedContent,
    expectedSelection: selectionAtEnd(expectedContent),
    grammar: "paragraph",
    group: "empty-document",
    initialContent: "",
    initialSelection: 0,
    name: "empty document spaces then repeated Enter keeps visible empty paragraphs",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-fm-line-whitespace"],
        text: "   ",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      { text: "", whiteSpace: "break-spaces" },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-fm-line-active", "cm-fm-line-empty"],
        text: "",
        whiteSpace: "pre-wrap"
      }
    ])
  });
}

function runParagraphEndEnterCase(): Promise<CaseResult> {
  const initialContent = "Paragraph";
  const expectedContent = `${initialContent}\n\n`;

  return runOracleActionCase({
    actions: [{ key: "Enter", type: "key" }],
    caseId: "paragraph-end-enter",
    expectedContent,
    expectedSelection: selectionAtEnd(expectedContent),
    grammar: "paragraph",
    group: "paragraph",
    initialContent,
    initialSelection: initialContent.length,
    name: "Enter at paragraph end creates an empty paragraph",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-paragraph"],
        text: "Paragraph",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-fm-line-active", "cm-fm-line-empty"],
        text: "",
        whiteSpace: "pre-wrap"
      }
    ])
  });
}

function runParagraphMiddleEnterCase(): Promise<CaseResult> {
  const expectedContent = "Alpha\n\nBeta";

  return runOracleActionCase({
    actions: [{ key: "Enter", type: "key" }],
    caseId: "paragraph-middle-enter",
    expectedContent,
    expectedSelection: { anchor: "Alpha\n\n".length, head: "Alpha\n\n".length },
    grammar: "paragraph",
    group: "paragraph",
    initialContent: "AlphaBeta",
    initialSelection: "Alpha".length,
    name: "Enter in paragraph middle splits with a blank editing line",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-paragraph"],
        text: "Alpha",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-active-paragraph"],
        text: "Beta",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

function runParagraphStartEnterCase(): Promise<CaseResult> {
  const initialContent = "Paragraph";
  const expectedContent = `\n\n${initialContent}`;

  return runOracleActionCase({
    actions: [{ key: "Enter", type: "key" }],
    caseId: "paragraph-start-enter",
    expectedContent,
    expectedSelection: { anchor: 2, head: 2 },
    grammar: "paragraph",
    group: "paragraph",
    initialContent,
    initialSelection: 0,
    name: "Enter at paragraph start creates an empty paragraph above",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      { text: "", whiteSpace: "break-spaces" },
      {
        classTokens: ["cm-active-paragraph"],
        text: "Paragraph",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

function runHeadingEndEnterCase(): Promise<CaseResult> {
  const initialContent = "# Title";
  const expectedContent = `${initialContent}\n\n`;

  return runOracleActionCase({
    actions: [{ key: "Enter", type: "key" }],
    caseId: "heading-end-enter",
    expectedContent,
    expectedSelection: selectionAtEnd(expectedContent),
    grammar: "heading",
    group: "heading",
    initialContent,
    initialSelection: initialContent.length,
    name: "Enter at heading end creates an empty paragraph",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-heading", "cm-inactive-heading-depth-1"],
        text: "# Title",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-fm-line-active", "cm-fm-line-empty"],
        text: "",
        whiteSpace: "pre-wrap"
      }
    ])
  });
}

function runHeadingEndRepeatedEnterCase(): Promise<CaseResult> {
  const initialContent = "# Title";
  const expectedContent = `${initialContent}\n\n\n\n\n\n`;

  return runOracleActionCase({
    actions: [
      { key: "Enter", type: "key" },
      { key: "Enter", type: "key" },
      { key: "Enter", type: "key" }
    ],
    caseId: "heading-end-repeated-enter",
    expectedContent,
    expectedSelection: selectionAtEnd(expectedContent),
    grammar: "heading",
    group: "heading",
    initialContent,
    initialSelection: initialContent.length,
    name: "repeated Enter at heading end accumulates empty paragraphs",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-heading", "cm-inactive-heading-depth-1"],
        text: "# Title",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      { text: "", whiteSpace: "break-spaces" },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      { text: "", whiteSpace: "break-spaces" },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-fm-line-active", "cm-fm-line-empty"],
        text: "",
        whiteSpace: "pre-wrap"
      }
    ])
  });
}

function runHeadingEmptyParagraphBackspaceCase(): Promise<CaseResult> {
  const initialContent = "# Title";

  return runOracleActionCase({
    actions: [
      { key: "Enter", type: "key" },
      { key: "Backspace", type: "key" }
    ],
    caseId: "heading-empty-paragraph-backspace",
    expectedContent: initialContent,
    expectedSelection: selectionAtEnd(initialContent),
    grammar: "heading",
    group: "heading",
    initialContent,
    initialSelection: initialContent.length,
    name: "Backspace from empty paragraph below heading rejoins heading line",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-active-heading", "cm-active-heading-depth-1"],
        text: "# Title",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

function runStructuralBlankArrowDownCase(): Promise<CaseResult> {
  const initialContent = "Paragraph one\n\nParagraph two";

  return runOracleActionCase({
    actions: [{ key: "ArrowDown", type: "key" }],
    caseId: "structural-blank-arrow-down",
    expectedContent: initialContent,
    expectedSelection: selectionAtEnd(initialContent),
    grammar: "paragraph",
    group: "structural-blank",
    initialContent,
    initialSelection: "Paragraph one".length,
    name: "ArrowDown from paragraph end crosses structural blank to next paragraph end",
    visualAssertions: createOracleVisualAssertions([
      {
        classTokens: ["cm-inactive-paragraph"],
        text: "Paragraph one",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-inactive-blank-line"],
        text: "",
        whiteSpace: "break-spaces"
      },
      {
        classTokens: ["cm-active-paragraph"],
        text: "Paragraph two",
        whiteSpace: "break-spaces"
      }
    ])
  });
}

async function runDeepNestedListExitCaretCase(): Promise<CaseResult> {
  const initialContent = [
    "# Test",
    "- List Content 1",
    "- List Content 2",
    "  - Child List Content",
    "    - CC",
    "- "
  ].join("\n");
  const expectedContent = [
    "# Test",
    "- List Content 1",
    "- List Content 2",
    "  - Child List Content",
    "    - CC",
    "",
    ""
  ].join("\n");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();
  harness.controller.pressEnter();
  await settle();

  const selection = harness.controller.getSelection();
  const caretRect = harness.view.coordsAtPos(selection.anchor);
  const ccLine = findLineByText(harness.root, "CC");
  const finalLineBlock = harness.view.lineBlockAt(selection.anchor);
  const ccLineRect = ccLine?.getBoundingClientRect() ?? null;
  const caretHeight = caretRect === null ? null : caretRect.bottom - caretRect.top;
  const caretHasGeometry =
    caretRect !== null &&
    Number.isFinite(caretRect.left) &&
    Number.isFinite(caretRect.top) &&
    caretHeight !== null &&
    caretHeight > 0;
  const caretStaysBelowNestedItem =
    caretRect !== null &&
    ccLineRect !== null &&
    caretRect.top >= ccLineRect.bottom - 2;
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    top: line.getBoundingClientRect().top
  }));
  const pass =
    harness.controller.getContent() === expectedContent &&
    selection.anchor === expectedContent.length &&
    selection.head === expectedContent.length &&
    caretHasGeometry &&
    caretStaysBelowNestedItem;

  const result = resultFor({
    details: {
      caretBottom: caretRect?.bottom ?? null,
      caretHasGeometry,
      caretHeight,
      caretLeft: caretRect?.left ?? null,
      caretStaysBelowNestedItem,
      caretTop: caretRect?.top ?? null,
      ccLineBottom: ccLineRect?.bottom ?? null,
      ccLineClasses: ccLine?.className ?? null,
      ccLineTop: ccLineRect?.top ?? null,
      finalLineBlockFrom: finalLineBlock.from,
      finalLineBlockTo: finalLineBlock.to,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "list",
    harness,
    name: "Enter on a trailing empty top-level item after nested children keeps the caret below the child item",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runDeepNestedListExitBeforeFollowingContentCaretCase(): Promise<CaseResult> {
  const initialContent = [
    "# Test",
    "- List Content 1",
    "- List Content 2",
    "  - Child List Content",
    "    - CC",
    "- ",
    "",
    "After"
  ].join("\n");
  const expectedContent = [
    "# Test",
    "- List Content 1",
    "- List Content 2",
    "  - Child List Content",
    "    - CC",
    "",
    "After"
  ].join("\n");
  const expectedBlankLineStart = expectedContent.indexOf("\n\nAfter") + 1;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.indexOf("- \n\nAfter") + "- ".length);
  await settle();
  harness.controller.pressEnter();
  await settle();

  const selection = harness.controller.getSelection();
  const caretRect = harness.view.coordsAtPos(selection.anchor);
  const ccLine = findLineByText(harness.root, "CC");
  const afterLine = findLineByText(harness.root, "After");
  const ccLineRect = ccLine?.getBoundingClientRect() ?? null;
  const afterLineRect = afterLine?.getBoundingClientRect() ?? null;
  const caretHeight = caretRect === null ? null : caretRect.bottom - caretRect.top;
  const caretHasGeometry =
    caretRect !== null &&
    Number.isFinite(caretRect.left) &&
    Number.isFinite(caretRect.top) &&
    caretHeight !== null &&
    caretHeight > 0;
  const caretStaysBelowNestedItem =
    caretRect !== null &&
    ccLineRect !== null &&
    caretRect.top >= ccLineRect.bottom - 2;
  const caretStaysAboveFollowingContent =
    caretRect !== null &&
    afterLineRect !== null &&
    caretRect.bottom <= afterLineRect.top + 2;
  const visibleLines = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
    className: line.className,
    text: line.textContent ?? "",
    top: line.getBoundingClientRect().top
  }));
  const pass =
    harness.controller.getContent() === expectedContent &&
    selection.anchor === expectedBlankLineStart &&
    selection.head === expectedBlankLineStart &&
    caretHasGeometry &&
    caretStaysBelowNestedItem &&
    caretStaysAboveFollowingContent;

  const result = resultFor({
    details: {
      afterLineClasses: afterLine?.className ?? null,
      afterLineTop: afterLineRect?.top ?? null,
      caretBottom: caretRect?.bottom ?? null,
      caretHasGeometry,
      caretHeight,
      caretLeft: caretRect?.left ?? null,
      caretStaysAboveFollowingContent,
      caretStaysBelowNestedItem,
      caretTop: caretRect?.top ?? null,
      ccLineBottom: ccLineRect?.bottom ?? null,
      ccLineClasses: ccLine?.className ?? null,
      ccLineTop: ccLineRect?.top ?? null,
      expectedBlankLineStart,
      visibleLines
    },
    expectedContent,
    expectedSelection: { anchor: expectedBlankLineStart, head: expectedBlankLineStart },
    grammar: "list",
    harness,
    name: "Enter on an empty top-level item before following content keeps the caret on the blank block",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runDeepOrderedListRepeatedEnterExitCase(): Promise<CaseResult> {
  const initialContent = ["1. 111", "2. 222", "  1. 2.1", "    1. 2.1.1"].join("\n");
  const expectedContent = ["1. 111", "2. 222", "  1. 2.1", "    1. 2.1.1", "", ""].join("\n");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();
  harness.controller.pressEnter();
  await settle();
  harness.controller.pressEnter();
  await settle();
  harness.controller.pressEnter();
  await settle();
  harness.controller.pressEnter();
  await settle();

  const selection = harness.controller.getSelection();
  const caretRect = harness.view.coordsAtPos(selection.anchor);
  const nestedLine = findLineByText(harness.root, "2.1.1");
  const nestedLineRect = nestedLine?.getBoundingClientRect() ?? null;
  const finalLineBlock = harness.view.lineBlockAt(selection.anchor);
  const caretStaysBelowNestedItem =
    caretRect !== null &&
    nestedLineRect !== null &&
    caretRect.top >= nestedLineRect.bottom - 2;
  const pass =
    harness.controller.getContent() === expectedContent &&
    selection.anchor === expectedContent.length &&
    selection.head === expectedContent.length &&
    caretStaysBelowNestedItem;

  const result = resultFor({
    caseId: "deep-ordered-list-repeated-enter-exit",
    details: {
      caretBottom: caretRect?.bottom ?? null,
      caretStaysBelowNestedItem,
      caretTop: caretRect?.top ?? null,
      finalLineBlockFrom: finalLineBlock.from,
      finalLineBlockTo: finalLineBlock.to,
      nestedLineBottom: nestedLineRect?.bottom ?? null,
      nestedLineClasses: nestedLine?.className ?? null,
      nestedLineTop: nestedLineRect?.top ?? null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "list",
    harness,
    name: "repeated Enter exits a deep ordered list without jumping the caret upward",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runTopLevelListItemEnterBodyUpgradeCase(): Promise<CaseResult> {
  const initialContent = ["1. Previous", "2. Body"].join("\n");
  const expectedContent = ["1. Previous", "", "Body"].join("\n");
  const expectedSelection = expectedContent.indexOf("Body");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.indexOf("Body"));
  await settle();
  harness.controller.pressEnter();
  await settle();

  const selection = harness.controller.getSelection();
  const caretRect = harness.view.coordsAtPos(selection.anchor);
  const previousLine = findLineByText(harness.root, "Previous");
  const bodyLine = findLineByText(harness.root, "Body");
  const previousLineRect = previousLine?.getBoundingClientRect() ?? null;
  const bodyLineRect = bodyLine?.getBoundingClientRect() ?? null;
  const caretStaysOnBodyLine =
    caretRect !== null &&
    bodyLineRect !== null &&
    caretRect.top >= bodyLineRect.top - 2 &&
    caretRect.bottom <= bodyLineRect.bottom + 2;
  const bodyStaysBelowList =
    bodyLineRect !== null &&
    previousLineRect !== null &&
    bodyLineRect.top >= previousLineRect.bottom - 2;
  const pass =
    harness.controller.getContent() === expectedContent &&
    selection.anchor === expectedSelection &&
    selection.head === expectedSelection &&
    caretStaysOnBodyLine &&
    bodyStaysBelowList;

  const result = resultFor({
    caseId: "top-level-list-item-enter-body-upgrade",
    details: {
      bodyLineClasses: bodyLine?.className ?? null,
      bodyLineTop: bodyLineRect?.top ?? null,
      bodyStaysBelowList,
      caretBottom: caretRect?.bottom ?? null,
      caretStaysOnBodyLine,
      caretTop: caretRect?.top ?? null,
      previousLineBottom: previousLineRect?.bottom ?? null,
      previousLineClasses: previousLine?.className ?? null
    },
    expectedContent,
    expectedSelection: { anchor: expectedSelection, head: expectedSelection },
    grammar: "list",
    harness,
    name: "Enter at a top-level list item start upgrades it to body text below the list",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runNestedEmptyListMarkerBackspaceCaretCase(): Promise<CaseResult> {
  const initialContent = ["- parent", "  - child", "    - grandchild"].join("\n");
  const expectedMarkerContent = `${initialContent}\n    - `;
  const expectedContent = `${initialContent}\n    `;
  const expectedSelection = expectedContent.length;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();
  harness.controller.pressEnter();
  await settle();
  const contentAfterEnter = harness.controller.getContent();
  const selectionAfterEnter = harness.controller.getSelection();

  harness.controller.pressBackspace();
  await settle();

  const selectionAfterBackspace = harness.controller.getSelection();
  const blankLine = findLineByExactText(harness.root, "    ");
  const blankLineClasses = blankLine?.className ?? "";
  const blankLineRect = blankLine?.getBoundingClientRect() ?? null;
  const caretRect = harness.view.coordsAtPos(selectionAfterBackspace.anchor);
  const caretHeight = caretRect === null ? null : caretRect.bottom - caretRect.top;
  const domSelection = describeDomSelectionGeometry();
  const blankLineHasVisibleHeight =
    blankLineRect !== null &&
    blankLineRect.height > 0;
  const caretHasGeometry =
    caretRect !== null &&
    Number.isFinite(caretRect.left) &&
    Number.isFinite(caretRect.top) &&
    caretHeight !== null &&
    caretHeight > 0;
  const caretStaysOnBlankLine =
    caretRect !== null &&
    blankLineRect !== null &&
    caretRect.top >= blankLineRect.top - 2 &&
    caretRect.bottom <= blankLineRect.bottom + 2;
  const pass =
    contentAfterEnter === expectedMarkerContent &&
    selectionAfterEnter.anchor === expectedMarkerContent.length &&
    selectionAfterEnter.head === expectedMarkerContent.length &&
    harness.controller.getContent() === expectedContent &&
    selectionAfterBackspace.anchor === expectedSelection &&
    selectionAfterBackspace.head === expectedSelection &&
    blankLine !== null &&
    !/\bcm-inactive-blank-line\b/u.test(blankLineClasses) &&
    blankLineHasVisibleHeight &&
    caretHasGeometry &&
    caretStaysOnBlankLine;

  const result = resultFor({
    details: {
      blankLineClasses,
      blankLineHeight: blankLineRect?.height ?? null,
      blankLineText: blankLine?.textContent ?? null,
      caretBottom: caretRect?.bottom ?? null,
      caretHasGeometry,
      caretHeight,
      caretLeft: caretRect?.left ?? null,
      caretStaysOnBlankLine,
      caretTop: caretRect?.top ?? null,
      contentAfterEnter,
      domSelection,
      selectionAfterBackspace,
      selectionAfterEnter
    },
    expectedContent,
    expectedSelection: { anchor: expectedSelection, head: expectedSelection },
    grammar: "list",
    harness,
    name: "Backspace from an auto-created nested empty list item leaves a visible indented blank-line caret",
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
  const initialContent = "> quote";
  const contentStart = initialContent.indexOf("quote");
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(contentStart);
  await settle();

  const hasActiveMarkerDecoration = harness.root.querySelector(".cm-active-blockquote-marker") !== null;
  const hasHiddenMarkerDecoration = harness.root.querySelector(".cm-inactive-blockquote-marker") !== null;
  const activeMarkerElement = harness.root.querySelector<HTMLElement>(".cm-active-blockquote-marker");
  const paddingAnchorElement = harness.root.querySelector<HTMLElement>(".cm-active-blockquote-padding-anchor");
  const activeMarkerStyle = activeMarkerElement ? window.getComputedStyle(activeMarkerElement) : null;
  const paddingAnchorStyle = paddingAnchorElement ? window.getComputedStyle(paddingAnchorElement) : null;
  const activeMarkerInvisible =
    activeMarkerStyle !== null &&
    isTransparentColor(activeMarkerStyle.color) &&
    activeMarkerStyle.overflow === "hidden";
  const sourcePrefixRect = findTextRect(harness.root, "> ");
  const contentRect = findTextRect(harness.root, "quote");
  const caretRect = harness.view.coordsAtPos(contentStart);
  const caretAlignsWithContent =
    caretRect !== null &&
    contentRect !== null &&
    Math.abs(caretRect.left - contentRect.left) <= 1.5;
  const pass =
    hasActiveMarkerDecoration &&
    !hasHiddenMarkerDecoration &&
    activeMarkerInvisible &&
    paddingAnchorStyle?.overflow === "visible" &&
    contentRect !== null &&
    caretAlignsWithContent &&
    Number.isFinite(caretRect?.top ?? NaN);

  const result = resultFor({
    caseId: "blockquote-raw-prefix-hidden",
    details: {
      caretLeft: caretRect?.left ?? null,
      caretAlignsWithContent,
      contentLeft: contentRect?.left ?? null,
      hasActiveMarkerDecoration,
      hasHiddenMarkerDecoration,
      activeMarkerColor: activeMarkerStyle?.color ?? null,
      activeMarkerOverflow: activeMarkerStyle?.overflow ?? null,
      paddingAnchorOverflow: paddingAnchorStyle?.overflow ?? null,
      sourcePrefixMeasured: sourcePrefixRect !== null,
      sourcePrefixWidth: sourcePrefixRect?.width ?? null
    },
    grammar: "blockquote",
    harness,
    name: "focused blockquote source prefix stays hidden while editing quote body",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteMarkerCommitInputCase(): Promise<CaseResult> {
  const harness = setupHarness("");
  harness.controller.setSelection(0);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, ">");
  await settle();

  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();
  const lineAfterMarker = findLineByExactText(harness.root, ">");
  const lineAfterMarkerClasses = lineAfterMarker?.className ?? "";
  const draftActiveMarker = lineAfterMarker?.querySelector(".cm-active-blockquote-marker") ?? null;
  const draftHiddenMarker = lineAfterMarker?.querySelector(".cm-inactive-blockquote-marker") ?? null;
  const draftMarkerRect = lineAfterMarker ? findTextRect(lineAfterMarker, ">") : null;
  const caretAfterMarkerRect = harness.view.coordsAtPos(selectionAfterMarker.anchor);
  const caretAfterMarkerHasGeometry =
    caretAfterMarkerRect !== null &&
    Number.isFinite(caretAfterMarkerRect.top) &&
    Number.isFinite(caretAfterMarkerRect.bottom) &&
    caretAfterMarkerRect.bottom > caretAfterMarkerRect.top;

  const textInsertAccepted = nativeInsertText(harness.view, "quote");
  await settle();

  const expectedContent = ">quote";
  const contentAfterText = harness.controller.getContent();
  const selectionAfterText = harness.controller.getSelection();
  const lineAfterText = findLineByExactText(harness.root, expectedContent);
  const lineAfterTextClasses = lineAfterText?.className ?? "";
  const hiddenMarkerAfterText = lineAfterText?.querySelector(".cm-inactive-blockquote-marker") ?? null;
  const activeMarkerAfterText = lineAfterText?.querySelector(".cm-active-blockquote-marker") ?? null;
  const paddingAnchorAfterText = lineAfterText?.querySelector(".cm-active-blockquote-padding-anchor") ?? null;
  const activeMarkerAfterTextStyle = activeMarkerAfterText instanceof HTMLElement
    ? window.getComputedStyle(activeMarkerAfterText)
    : null;
  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "quote");
  const finalLineClasses = finalLine?.className ?? "";
  const sourcePrefixRect = findTextRectOutsideClosestClasses(harness.root, ">", ["cm-active-blockquote-marker"]);
  const contentRect = findTextRect(harness.root, "quote");
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const activeMarkerAfterTextInvisible =
    activeMarkerAfterTextStyle !== null &&
    isTransparentColor(activeMarkerAfterTextStyle.color) &&
    activeMarkerAfterTextStyle.overflow === "hidden";
  const pass =
    markerInsertAccepted &&
    textInsertAccepted &&
    contentAfterMarker === ">" &&
    selectionAfterMarker.anchor === 1 &&
    selectionAfterMarker.head === 1 &&
    lineAfterMarker !== null &&
    !/\bcm-inactive-blockquote\b/u.test(lineAfterMarkerClasses) &&
    !/\bcm-inactive-blockquote-separator\b/u.test(lineAfterMarkerClasses) &&
    draftActiveMarker === null &&
    draftHiddenMarker === null &&
    draftMarkerRect !== null &&
    caretAfterMarkerHasGeometry &&
    contentAfterText === expectedContent &&
    selectionAfterText.anchor === expectedContent.length &&
    selectionAfterText.head === expectedContent.length &&
    lineAfterText !== null &&
    /\bcm-inactive-blockquote\b/u.test(lineAfterTextClasses) &&
    hiddenMarkerAfterText === null &&
    activeMarkerAfterText?.textContent === ">" &&
    activeMarkerAfterTextInvisible &&
    paddingAnchorAfterText === null &&
    harness.controller.getContent() === expectedContent &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-inactive-blockquote\b/u.test(finalLineClasses) &&
    contentRect !== null &&
    caretRect !== null &&
    caretRect.left >= contentRect.right - 2;

  const result = resultFor({
    caseId: "blockquote-marker-commits-after-text",
    details: {
      activeMarkerAfterText: activeMarkerAfterText?.textContent ?? null,
      activeMarkerAfterTextColor: activeMarkerAfterTextStyle?.color ?? null,
      activeMarkerAfterTextInvisible,
      activeMarkerAfterTextOverflow: activeMarkerAfterTextStyle?.overflow ?? null,
      caretAfterMarkerBottom: caretAfterMarkerRect?.bottom ?? null,
      caretAfterMarkerHasGeometry,
      caretAfterMarkerLeft: caretAfterMarkerRect?.left ?? null,
      caretAfterMarkerTop: caretAfterMarkerRect?.top ?? null,
      caretLeft: caretRect?.left ?? null,
      contentAfterMarker,
      contentAfterText,
      contentRight: contentRect?.right ?? null,
      draftActiveMarker: draftActiveMarker?.textContent ?? null,
      draftHiddenMarker: draftHiddenMarker?.textContent ?? null,
      draftMarkerMeasured: draftMarkerRect !== null,
      finalLineClasses,
      hiddenMarkerAfterText: hiddenMarkerAfterText?.textContent ?? null,
      lineAfterMarkerClasses,
      lineAfterTextClasses,
      markerInsertAccepted,
      paddingAnchorAfterText: paddingAnchorAfterText?.textContent ?? null,
      selectionAfterMarker,
      selectionAfterText,
      sourcePrefixMeasured: sourcePrefixRect !== null,
      textInsertAccepted
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "blockquote",
    harness,
    name: "typing text after a plain greater-than commits a blockquote without marker padding",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteMarkerCommitOnSelectionMoveCase(): Promise<CaseResult> {
  const initialContent = [">", "", "Paragraph"].join("\n");
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(1);
  await settle();

  const activeLine = findLineByExactText(harness.root, ">");
  const activeLineClasses = activeLine?.className ?? "";
  const activeMarker = activeLine?.querySelector(".cm-active-blockquote-marker") ?? null;
  const activeHiddenMarker = activeLine?.querySelector(".cm-inactive-blockquote-marker") ?? null;
  const activeVisibleMarkerRect = activeLine ? findTextRect(activeLine, ">") : null;
  const activeCaretRect = harness.view.coordsAtPos(1);
  const activeCaretHasGeometry =
    activeCaretRect !== null &&
    Number.isFinite(activeCaretRect.top) &&
    Number.isFinite(activeCaretRect.bottom) &&
    activeCaretRect.bottom > activeCaretRect.top;

  const paragraphStart = initialContent.indexOf("Paragraph");
  harness.controller.setSelection(paragraphStart);
  await settle();

  const inactiveLine = findLineByExactText(harness.root, ">");
  const inactiveLineClasses = inactiveLine?.className ?? "";
  const inactiveHiddenMarker = inactiveLine?.querySelector<HTMLElement>(".cm-inactive-blockquote-marker") ?? null;
  const inactiveActiveMarker = inactiveLine?.querySelector(".cm-active-blockquote-marker") ?? null;
  const inactiveVisibleMarkerRect = inactiveLine ? findTextRect(inactiveLine, ">") : null;
  const inactiveMarkerDisplay = inactiveHiddenMarker ? getComputedStyle(inactiveHiddenMarker).display : null;
  const pass =
    harness.controller.getContent() === initialContent &&
    activeLine !== null &&
    !/\bcm-inactive-blockquote\b/u.test(activeLineClasses) &&
    activeMarker === null &&
    activeHiddenMarker === null &&
    activeVisibleMarkerRect !== null &&
    activeCaretHasGeometry &&
    inactiveLine !== null &&
    /\bcm-inactive-blockquote\b/u.test(inactiveLineClasses) &&
    /\bcm-inactive-blockquote-separator\b/u.test(inactiveLineClasses) &&
    inactiveHiddenMarker?.textContent === ">" &&
    inactiveActiveMarker === null &&
    inactiveMarkerDisplay === "none" &&
    inactiveVisibleMarkerRect === null;

  const result = resultFor({
    caseId: "blockquote-marker-commits-after-selection-move",
    details: {
      activeCaretBottom: activeCaretRect?.bottom ?? null,
      activeCaretHasGeometry,
      activeCaretTop: activeCaretRect?.top ?? null,
      activeHiddenMarker: activeHiddenMarker?.textContent ?? null,
      activeLineClasses,
      activeMarker: activeMarker?.textContent ?? null,
      activeVisibleMarkerMeasured: activeVisibleMarkerRect !== null,
      inactiveActiveMarker: inactiveActiveMarker?.textContent ?? null,
      inactiveHiddenMarker: inactiveHiddenMarker?.textContent ?? null,
      inactiveLineClasses,
      inactiveMarkerDisplay,
      inactiveVisibleMarkerMeasured: inactiveVisibleMarkerRect !== null,
      paragraphStart
    },
    expectedContent: initialContent,
    expectedSelection: { anchor: paragraphStart, head: paragraphStart },
    grammar: "blockquote",
    harness,
    name: "moving the cursor away commits a plain greater-than as an inactive blockquote row",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runNestedBlockquoteMarkerCommitInputCase(): Promise<CaseResult> {
  const harness = setupHarness("> ");
  harness.controller.setSelection(2);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, ">");
  await settle();

  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();
  const lineAfterMarker = findLineByExactText(harness.root, "> >");
  const lineAfterMarkerClasses = lineAfterMarker?.className ?? "";
  const activeMarkerAfterMarker = lineAfterMarker?.querySelector(".cm-active-blockquote-marker") ?? null;
  const activeMarkerAfterMarkerText = activeMarkerAfterMarker?.textContent ?? null;
  const paddingAnchorAfterMarker =
    lineAfterMarker?.querySelector(".cm-active-blockquote-padding-anchor") ?? null;
  const visibleNestedMarkerRect = lineAfterMarker ? findTextRect(lineAfterMarker, ">") : null;
  const caretAfterMarkerRect = harness.view.coordsAtPos(selectionAfterMarker.anchor);
  const caretAfterMarkerHasGeometry =
    caretAfterMarkerRect !== null &&
    Number.isFinite(caretAfterMarkerRect.top) &&
    Number.isFinite(caretAfterMarkerRect.bottom) &&
    caretAfterMarkerRect.bottom > caretAfterMarkerRect.top;

  const textInsertAccepted = nativeInsertText(harness.view, "nested");
  await settle();

  const expectedContent = "> >nested";
  const contentAfterText = harness.controller.getContent();
  const selectionAfterText = harness.controller.getSelection();
  const lineAfterText = findLineByExactText(harness.root, expectedContent);
  const lineAfterTextClasses = lineAfterText?.className ?? "";
  const activeMarkerAfterText = lineAfterText?.querySelector(".cm-active-blockquote-marker") ?? null;
  const paddingAnchorAfterText =
    lineAfterText?.querySelector(".cm-active-blockquote-padding-anchor") ?? null;
  const activeMarkerAfterTextStyle = activeMarkerAfterText instanceof HTMLElement
    ? window.getComputedStyle(activeMarkerAfterText)
    : null;
  const activeMarkerAfterTextInvisible =
    activeMarkerAfterTextStyle !== null &&
    isTransparentColor(activeMarkerAfterTextStyle.color) &&
    activeMarkerAfterTextStyle.overflow === "hidden";
  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "nested");
  const finalLineClasses = finalLine?.className ?? "";
  const contentRect = findTextRect(harness.root, "nested");
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const pass =
    markerInsertAccepted &&
    textInsertAccepted &&
    contentAfterMarker === "> >" &&
    selectionAfterMarker.anchor === 3 &&
    selectionAfterMarker.head === 3 &&
    lineAfterMarker !== null &&
    /\bcm-inactive-blockquote-depth-1\b/u.test(lineAfterMarkerClasses) &&
    !/\bcm-inactive-blockquote-depth-2\b/u.test(lineAfterMarkerClasses) &&
    !/\bcm-inactive-blockquote-separator\b/u.test(lineAfterMarkerClasses) &&
    activeMarkerAfterMarker !== null &&
    activeMarkerAfterMarkerText === "> " &&
    paddingAnchorAfterMarker === null &&
    visibleNestedMarkerRect !== null &&
    caretAfterMarkerHasGeometry &&
    contentAfterText === expectedContent &&
    selectionAfterText.anchor === expectedContent.length &&
    selectionAfterText.head === expectedContent.length &&
    lineAfterText !== null &&
    /\bcm-inactive-blockquote-depth-2\b/u.test(lineAfterTextClasses) &&
    activeMarkerAfterText?.textContent === "> >" &&
    activeMarkerAfterTextInvisible &&
    paddingAnchorAfterText === null &&
    harness.controller.getContent() === expectedContent &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-inactive-blockquote-depth-2\b/u.test(finalLineClasses) &&
    contentRect !== null &&
    caretRect !== null &&
    caretRect.left >= contentRect.right - 2;

  const result = resultFor({
    caseId: "nested-blockquote-marker-commits-after-text",
    details: {
      activeMarkerAfterMarker: activeMarkerAfterMarkerText,
      activeMarkerAfterText: activeMarkerAfterText?.textContent ?? null,
      activeMarkerAfterTextColor: activeMarkerAfterTextStyle?.color ?? null,
      activeMarkerAfterTextInvisible,
      activeMarkerAfterTextOverflow: activeMarkerAfterTextStyle?.overflow ?? null,
      caretAfterMarkerBottom: caretAfterMarkerRect?.bottom ?? null,
      caretAfterMarkerHasGeometry,
      caretAfterMarkerLeft: caretAfterMarkerRect?.left ?? null,
      caretAfterMarkerTop: caretAfterMarkerRect?.top ?? null,
      caretLeft: caretRect?.left ?? null,
      contentAfterMarker,
      contentAfterText,
      contentRight: contentRect?.right ?? null,
      finalLineClasses,
      lineAfterMarkerClasses,
      lineAfterTextClasses,
      markerInsertAccepted,
      paddingAnchorAfterMarker: paddingAnchorAfterMarker?.textContent ?? null,
      paddingAnchorAfterText: paddingAnchorAfterText?.textContent ?? null,
      selectionAfterMarker,
      selectionAfterText,
      textInsertAccepted,
      visibleNestedMarkerMeasured: visibleNestedMarkerRect !== null
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "blockquote",
    harness,
    name: "typing nested text after greater-than commits without marker padding",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteMarkerCommitOnEnterInputCase(): Promise<CaseResult> {
  const harness = setupHarness("");
  harness.controller.setSelection(0);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, ">");
  await settle();
  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();

  const enterAccepted = dispatchEnter(harness.view);
  await settle();
  const contentAfterEnter = harness.controller.getContent();
  const selectionAfterEnter = harness.controller.getSelection();
  const linesAfterEnter = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .filter((line) => line.textContent === "> ");
  const activeLineAfterEnter = linesAfterEnter.at(-1) ?? null;
  const activeMarkerAfterEnter = activeLineAfterEnter?.querySelector(".cm-active-blockquote-marker") ?? null;
  const paddingAnchorAfterEnter =
    activeLineAfterEnter?.querySelector(".cm-active-blockquote-padding-anchor") ?? null;
  const caretAfterEnterRect = harness.view.coordsAtPos(selectionAfterEnter.anchor);
  const caretAfterEnterHasGeometry =
    caretAfterEnterRect !== null &&
    Number.isFinite(caretAfterEnterRect.top) &&
    Number.isFinite(caretAfterEnterRect.bottom) &&
    caretAfterEnterRect.bottom > caretAfterEnterRect.top;

  const textInsertAccepted = nativeInsertText(harness.view, "quote");
  await settle();

  const expectedContentAfterEnter = "> \n> ";
  const expectedContent = "> \n> quote";
  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "quote");
  const finalLineClasses = finalLine?.className ?? "";
  const contentRect = findTextRect(harness.root, "quote");
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const pass =
    markerInsertAccepted &&
    textInsertAccepted &&
    contentAfterMarker === ">" &&
    selectionAfterMarker.anchor === 1 &&
    selectionAfterMarker.head === 1 &&
    contentAfterEnter === expectedContentAfterEnter &&
    selectionAfterEnter.anchor === expectedContentAfterEnter.length &&
    selectionAfterEnter.head === expectedContentAfterEnter.length &&
    linesAfterEnter.length === 2 &&
    activeLineAfterEnter !== null &&
    /\bcm-inactive-blockquote\b/u.test(activeLineAfterEnter.className) &&
    activeMarkerAfterEnter?.textContent === ">" &&
    paddingAnchorAfterEnter?.textContent === " " &&
    caretAfterEnterHasGeometry &&
    harness.controller.getContent() === expectedContent &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-inactive-blockquote\b/u.test(finalLineClasses) &&
    contentRect !== null &&
    caretRect !== null &&
    caretRect.left >= contentRect.right - 2;

  const result = resultFor({
    caseId: "blockquote-marker-commits-after-enter",
    details: {
      activeLineAfterEnterClass: activeLineAfterEnter?.className ?? null,
      activeMarkerAfterEnter: activeMarkerAfterEnter?.textContent ?? null,
      caretAfterEnterBottom: caretAfterEnterRect?.bottom ?? null,
      caretAfterEnterHasGeometry,
      caretAfterEnterLeft: caretAfterEnterRect?.left ?? null,
      caretAfterEnterTop: caretAfterEnterRect?.top ?? null,
      caretLeft: caretRect?.left ?? null,
      contentAfterEnter,
      contentAfterMarker,
      contentRight: contentRect?.right ?? null,
      enterAccepted,
      finalLineClasses,
      linesAfterEnter: linesAfterEnter.length,
      markerInsertAccepted,
      paddingAnchorAfterEnter: paddingAnchorAfterEnter?.textContent ?? null,
      selectionAfterEnter,
      selectionAfterMarker,
      textInsertAccepted
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "blockquote",
    harness,
    name: "typing greater-than commits a blockquote when Enter is pressed after the marker",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runNestedBlockquoteMarkerCommitOnEnterInputCase(): Promise<CaseResult> {
  const harness = setupHarness("> ");
  harness.controller.setSelection(2);
  await settle();

  const markerInsertAccepted = nativeInsertText(harness.view, ">");
  await settle();
  const contentAfterMarker = harness.controller.getContent();
  const selectionAfterMarker = harness.controller.getSelection();

  const enterAccepted = dispatchEnter(harness.view);
  await settle();
  const contentAfterEnter = harness.controller.getContent();
  const selectionAfterEnter = harness.controller.getSelection();
  const linesAfterEnter = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"))
    .filter((line) => line.textContent === "> > ");
  const activeLineAfterEnter = linesAfterEnter.at(-1) ?? null;
  const activeMarkerAfterEnter = activeLineAfterEnter?.querySelector(".cm-active-blockquote-marker") ?? null;
  const paddingAnchorAfterEnter =
    activeLineAfterEnter?.querySelector(".cm-active-blockquote-padding-anchor") ?? null;
  const caretAfterEnterRect = harness.view.coordsAtPos(selectionAfterEnter.anchor);
  const caretAfterEnterHasGeometry =
    caretAfterEnterRect !== null &&
    Number.isFinite(caretAfterEnterRect.top) &&
    Number.isFinite(caretAfterEnterRect.bottom) &&
    caretAfterEnterRect.bottom > caretAfterEnterRect.top;

  const textInsertAccepted = nativeInsertText(harness.view, "nested");
  await settle();

  const expectedContentAfterEnter = "> > \n> > ";
  const expectedContent = "> > \n> > nested";
  const finalSelection = harness.controller.getSelection();
  const finalLine = findLineByText(harness.root, "nested");
  const finalLineClasses = finalLine?.className ?? "";
  const contentRect = findTextRect(harness.root, "nested");
  const caretRect = harness.view.coordsAtPos(finalSelection.anchor);
  const pass =
    markerInsertAccepted &&
    textInsertAccepted &&
    contentAfterMarker === "> >" &&
    selectionAfterMarker.anchor === 3 &&
    selectionAfterMarker.head === 3 &&
    contentAfterEnter === expectedContentAfterEnter &&
    selectionAfterEnter.anchor === expectedContentAfterEnter.length &&
    selectionAfterEnter.head === expectedContentAfterEnter.length &&
    linesAfterEnter.length === 2 &&
    activeLineAfterEnter !== null &&
    /\bcm-inactive-blockquote-depth-2\b/u.test(activeLineAfterEnter.className) &&
    activeMarkerAfterEnter?.textContent === "> >" &&
    paddingAnchorAfterEnter?.textContent === " " &&
    caretAfterEnterHasGeometry &&
    harness.controller.getContent() === expectedContent &&
    finalSelection.anchor === expectedContent.length &&
    finalSelection.head === expectedContent.length &&
    finalLine !== null &&
    /\bcm-inactive-blockquote-depth-2\b/u.test(finalLineClasses) &&
    contentRect !== null &&
    caretRect !== null &&
    caretRect.left >= contentRect.right - 2;

  const result = resultFor({
    caseId: "nested-blockquote-marker-commits-after-enter",
    details: {
      activeLineAfterEnterClass: activeLineAfterEnter?.className ?? null,
      activeMarkerAfterEnter: activeMarkerAfterEnter?.textContent ?? null,
      caretAfterEnterBottom: caretAfterEnterRect?.bottom ?? null,
      caretAfterEnterHasGeometry,
      caretAfterEnterLeft: caretAfterEnterRect?.left ?? null,
      caretAfterEnterTop: caretAfterEnterRect?.top ?? null,
      caretLeft: caretRect?.left ?? null,
      contentAfterEnter,
      contentAfterMarker,
      contentRight: contentRect?.right ?? null,
      enterAccepted,
      finalLineClasses,
      linesAfterEnter: linesAfterEnter.length,
      markerInsertAccepted,
      paddingAnchorAfterEnter: paddingAnchorAfterEnter?.textContent ?? null,
      selectionAfterEnter,
      selectionAfterMarker,
      textInsertAccepted
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "blockquote",
    harness,
    name: "typing a nested greater-than commits a nested blockquote when Enter is pressed after the marker",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteBareSeparatorRenderingCase(): Promise<CaseResult> {
  const initialContent = [
    "> 1",
    ">",
    "> 222",
    "",
    "Plain paragraph"
  ].join("\n");
  const harness = setupHarness(initialContent);
  harness.controller.setSelection(initialContent.indexOf("Plain paragraph"));
  await settle();

  const firstLine = findLineByText(harness.root, "1");
  const separatorLine = findLineByExactText(harness.root, ">");
  const finalLine = findLineByText(harness.root, "222");
  const separatorMarker = separatorLine?.querySelector<HTMLElement>(".cm-inactive-blockquote-marker") ?? null;
  const visibleSeparatorMarkerRect = separatorLine ? findTextRect(separatorLine, ">") : null;
  const markerTexts = Array.from(
    harness.root.querySelectorAll<HTMLElement>(".cm-inactive-blockquote-marker"),
    (marker) => marker.textContent ?? ""
  );
  const firstContentRect = findTextRect(harness.root, "1");
  const finalContentRect = findTextRect(harness.root, "222");
  const firstLineIsStart = firstLine?.classList.contains("cm-inactive-blockquote-start") === true;
  const separatorLineIsBlockquote = separatorLine?.classList.contains("cm-inactive-blockquote") === true;
  const separatorLineIsSeparator =
    separatorLine?.classList.contains("cm-inactive-blockquote-separator") === true;
  const separatorLineIsStructural =
    separatorLine?.classList.contains("cm-fm-line-structural-separator") === true;
  const separatorLineIsStart = separatorLine?.classList.contains("cm-inactive-blockquote-start") === true;
  const separatorLineIsEnd = separatorLine?.classList.contains("cm-inactive-blockquote-end") === true;
  const finalLineIsEnd = finalLine?.classList.contains("cm-inactive-blockquote-end") === true;
  const separatorMarkerDisplay = separatorMarker ? getComputedStyle(separatorMarker).display : null;
  const pass =
    firstLineIsStart &&
    separatorLineIsBlockquote &&
    separatorLineIsSeparator &&
    !separatorLineIsStart &&
    !separatorLineIsEnd &&
    finalLineIsEnd &&
    separatorMarkerDisplay === "none" &&
    visibleSeparatorMarkerRect === null &&
    markerTexts.join("|") === "> |>|> " &&
    firstContentRect !== null &&
    finalContentRect !== null;

  const result = resultFor({
    caseId: "blockquote-bare-separator-rendering",
    details: {
      finalLineClass: finalLine?.className ?? null,
      firstContentLeft: firstContentRect?.left ?? null,
      firstLineClass: firstLine?.className ?? null,
      finalContentLeft: finalContentRect?.left ?? null,
      markerTexts,
      separatorLineClass: separatorLine?.className ?? null,
      separatorLineIsSeparator,
      separatorLineIsStructural,
      separatorMarkerDisplay,
      visibleSeparatorMarkerRect: visibleSeparatorMarkerRect
        ? {
            height: visibleSeparatorMarkerRect.height,
            left: visibleSeparatorMarkerRect.left,
            top: visibleSeparatorMarkerRect.top,
            width: visibleSeparatorMarkerRect.width
          }
        : null
    },
    grammar: "blockquote",
    harness,
    name: "bare quote separator line remains hidden inside rendered blockquote",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteStructuralSeparatorNavigationCase(): Promise<CaseResult> {
  const initialContent = ["> 1", ">", "> 222"].join("\n");
  const separatorAnchor = initialContent.indexOf("\n>\n") + 2;
  const separatorPreviousAnchor = initialContent.indexOf("\n>\n");
  const previousQuoteLineEndAnchor = initialContent.indexOf("1") + "1".length;
  const nextContentAnchor = initialContent.indexOf("222");
  const expectedContentAfterBackspace = "> 1222";
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(separatorAnchor);
  await settle();

  const selectionAfterSeparatorAttempt = harness.controller.getSelection();
  const separatorLineBeforeNavigation = findLineByExactText(harness.root, ">");
  const separatorLineBeforeNavigationClasses = separatorLineBeforeNavigation?.className ?? "";
  const separatorLineIsActive =
    separatorLineBeforeNavigation?.classList.contains("cm-fm-line-active") === true;
  const separatorMarker = separatorLineBeforeNavigation?.querySelector<HTMLElement>(".cm-inactive-blockquote-marker") ?? null;
  const separatorMarkerDisplay = separatorMarker ? getComputedStyle(separatorMarker).display : null;

  harness.controller.setSelection(nextContentAnchor);
  await settle();
  const arrowUpAccepted = dispatchKey(harness.view, "ArrowUp");
  await settle();
  const selectionAfterArrowUp = harness.controller.getSelection();

  harness.controller.setSelection(nextContentAnchor);
  await settle();
  const selectionBeforeBackspace = harness.controller.getSelection();
  const backspaceAccepted = dispatchBackspace(harness.view);
  await settle();

  const contentAfterBackspace = harness.controller.getContent();
  const selectionAfterBackspace = harness.controller.getSelection();
  const separatorLineAfterBackspace = findLineByExactText(harness.root, ">");
  const pass =
    selectionAfterSeparatorAttempt.anchor === separatorPreviousAnchor &&
    selectionAfterSeparatorAttempt.head === separatorPreviousAnchor &&
    separatorLineBeforeNavigation !== null &&
    !separatorLineIsActive &&
    separatorMarkerDisplay === "none" &&
    selectionAfterArrowUp.anchor === previousQuoteLineEndAnchor &&
    selectionAfterArrowUp.head === previousQuoteLineEndAnchor &&
    selectionAfterArrowUp.anchor !== separatorAnchor &&
    selectionBeforeBackspace.anchor === nextContentAnchor &&
    selectionBeforeBackspace.head === nextContentAnchor &&
    contentAfterBackspace === expectedContentAfterBackspace &&
    selectionAfterBackspace.anchor === previousQuoteLineEndAnchor &&
    selectionAfterBackspace.head === previousQuoteLineEndAnchor &&
    separatorLineAfterBackspace === null;

  const result = resultFor({
    caseId: "blockquote-structural-separator-navigation",
    details: {
      arrowUpAccepted,
      backspaceAccepted,
      contentAfterBackspace,
      expectedContentAfterBackspace,
      previousQuoteLineEndAnchor,
      selectionAfterArrowUp,
      selectionAfterBackspace,
      selectionAfterSeparatorAttempt,
      selectionBeforeBackspace,
      separatorAnchor,
      separatorLineAfterBackspaceClass: separatorLineAfterBackspace?.className ?? null,
      separatorLineBeforeNavigationClasses,
      separatorLineIsActive,
      separatorMarkerDisplay,
      separatorPreviousAnchor
    },
    expectedContent: expectedContentAfterBackspace,
    expectedSelection: { anchor: previousQuoteLineEndAnchor, head: previousQuoteLineEndAnchor },
    grammar: "blockquote",
    harness,
    name: "quote-internal structural separator cannot receive caret and Backspace joins same-depth text",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteTrailingEmptySeparatorBackspaceCase(): Promise<CaseResult> {
  const initialContent = ["> 1111", ">", "> "].join("\n");
  const expectedContent = "> 1111";
  const expectedSelection = expectedContent.length;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();

  const selectionBeforeBackspace = harness.controller.getSelection();
  const backspaceAccepted = dispatchBackspace(harness.view);
  await settle();

  const contentAfterBackspace = harness.controller.getContent();
  const selectionAfterBackspace = harness.controller.getSelection();
  const separatorLineAfterBackspace = findLineByExactText(harness.root, ">");
  const pass =
    selectionBeforeBackspace.anchor === initialContent.length &&
    selectionBeforeBackspace.head === initialContent.length &&
    contentAfterBackspace === expectedContent &&
    selectionAfterBackspace.anchor === expectedSelection &&
    selectionAfterBackspace.head === expectedSelection &&
    separatorLineAfterBackspace === null;

  const result = resultFor({
    caseId: "blockquote-trailing-empty-separator-backspace",
    details: {
      backspaceAccepted,
      contentAfterBackspace,
      selectionAfterBackspace,
      selectionBeforeBackspace,
      separatorLineAfterBackspaceClass: separatorLineAfterBackspace?.className ?? null
    },
    expectedContent,
    expectedSelection: { anchor: expectedSelection, head: expectedSelection },
    grammar: "blockquote",
    harness,
    name: "Backspace from an empty quoted line removes its structural separator without leaving a quote row",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteListTrailingEmptyBackspaceCase(): Promise<CaseResult> {
  const initialContent = [
    "> 111",
    ">",
    "> - list1",
    "> - list2",
    ">   - child list",
    ">",
    "> "
  ].join("\n");
  const expectedContent = [
    "> 111",
    ">",
    "> - list1",
    "> - list2",
    ">   - child list"
  ].join("\n");
  const expectedSelection = expectedContent.length;
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();

  const selectionBeforeBackspace = harness.controller.getSelection();
  const backspaceAccepted = dispatchBackspace(harness.view);
  await settle();

  const contentAfterBackspace = harness.controller.getContent();
  const selectionAfterBackspace = harness.controller.getSelection();
  const linesAfterBackspace = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line"));
  const exactQuoteLineCountAfterBackspace = linesAfterBackspace.filter(
    (line) => (line.textContent || "") === ">"
  ).length;
  const lastLineAfterBackspace = linesAfterBackspace.at(-1) || null;
  const pass =
    selectionBeforeBackspace.anchor === initialContent.length &&
    selectionBeforeBackspace.head === initialContent.length &&
    contentAfterBackspace === expectedContent &&
    selectionAfterBackspace.anchor === expectedSelection &&
    selectionAfterBackspace.head === expectedSelection &&
    exactQuoteLineCountAfterBackspace === 1 &&
    (lastLineAfterBackspace?.textContent || "").includes("child list");

  const result = resultFor({
    caseId: "blockquote-list-trailing-empty-backspace",
    details: {
      backspaceAccepted,
      contentAfterBackspace,
      exactQuoteLineCountAfterBackspace,
      lastLineAfterBackspaceText: lastLineAfterBackspace?.textContent || null,
      selectionAfterBackspace,
      selectionBeforeBackspace
    },
    expectedContent,
    expectedSelection: { anchor: expectedSelection, head: expectedSelection },
    grammar: "blockquote",
    harness,
    name: "Backspace from a trailing empty quoted line after a quoted list removes the empty quote rows",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runNestedQuoteListRepeatedEnterExitCase(): Promise<CaseResult> {
  const initialContent = [
    "> 引用块",
    ">",
    "> > 二级引用块",
    "> > - List 1",
    "> > - List 2",
    "> >   - List 2.1",
    "> >   -"
  ].join("\n");
  const expectedAfterFirstEnter = [
    "> 引用块",
    ">",
    "> > 二级引用块",
    "> > - List 1",
    "> > - List 2",
    "> >   - List 2.1",
    "> > -"
  ].join("\n");
  const expectedContent = [
    "> 引用块",
    ">",
    "> > 二级引用块",
    "> > - List 1",
    "> > - List 2",
    "> >   - List 2.1",
    "> > ",
    "> > "
  ].join("\n");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.length);
  await settle();

  const firstEnterAccepted = dispatchEnter(harness.view);
  await settle();
  const contentAfterFirstEnter = harness.controller.getContent();
  const selectionAfterFirstEnter = harness.controller.getSelection();

  const secondEnterAccepted = dispatchEnter(harness.view);
  await settle();
  const actualContent = harness.controller.getContent();
  const actualSelection = harness.controller.getSelection();
  const finalLine = Array.from(harness.root.querySelectorAll<HTMLElement>(".cm-line")).at(-1) ?? null;
  const pass =
    contentAfterFirstEnter === expectedAfterFirstEnter &&
    selectionAfterFirstEnter.anchor === expectedAfterFirstEnter.length &&
    selectionAfterFirstEnter.head === expectedAfterFirstEnter.length &&
    actualContent === expectedContent &&
    actualSelection.anchor === expectedContent.length &&
    actualSelection.head === expectedContent.length &&
    finalLine?.classList.contains("cm-inactive-blockquote-depth-2") === true &&
    finalLine.classList.contains("cm-inactive-blockquote-depth-3") === false;

  const result = resultFor({
    caseId: "nested-quote-list-repeated-enter-exit",
    details: {
      actualContent,
      actualSelection,
      contentAfterFirstEnter,
      finalLineClass: finalLine?.className ?? null,
      firstEnterAccepted,
      secondEnterAccepted,
      selectionAfterFirstEnter
    },
    expectedContent,
    expectedSelection: { anchor: expectedContent.length, head: expectedContent.length },
    grammar: "blockquote",
    harness,
    name: "repeated Enter exits a nested empty list into its existing quote depth",
    pass
  });
  harness.controller.destroy();
  return result;
}

async function runBlockquoteInnerBlocksRenderingAndEnterCase(): Promise<CaseResult> {
  const renderingContent = [
    "> - item",
    ">   - child",
    "> - item 2",
    ">",
    "> > nested quote",
    "> > - nested item",
    "> >   - nested child",
    ">",
    "> > > deep quote",
    ">",
    "> ```ts",
    "> const value = 1;",
    "> ```",
    ">",
    "> $$",
    "> x^2",
    "> $$",
    "",
    "Plain paragraph"
  ].join("\n");
  const renderingHarness = setupHarness(renderingContent);
  renderingHarness.controller.setSelection(renderingContent.indexOf("Plain paragraph"));
  await settle();

  const listLines = Array.from(renderingHarness.root.querySelectorAll<HTMLElement>(".cm-inactive-blockquote.cm-inactive-list"));
  const childListLine = findLineByText(renderingHarness.root, "child");
  const nestedQuoteLine = findLineByText(renderingHarness.root, "nested quote");
  const nestedListLine = findLineByText(renderingHarness.root, "nested item");
  const nestedChildListLine = findLineByText(renderingHarness.root, "nested child");
  const deepQuoteLine = findLineByText(renderingHarness.root, "deep quote");
  const codeLine = findLineByText(renderingHarness.root, "const value = 1;");
  const mathWidget = renderingHarness.root.querySelector<HTMLElement>(".cm-math-preview-block");
  const quoteMarkers = Array.from(
    renderingHarness.root.querySelectorAll<HTMLElement>(".cm-inactive-blockquote-marker"),
    (marker) => marker.textContent ?? ""
  );
  const renderingPass =
    listLines.length === 5 &&
    childListLine?.classList.contains("cm-inactive-list-depth-1") === true &&
    nestedQuoteLine?.classList.contains("cm-inactive-blockquote-depth-2") === true &&
    nestedQuoteLine.classList.contains("cm-inactive-code-block") === false &&
    nestedListLine?.classList.contains("cm-inactive-blockquote-depth-2") === true &&
    nestedListLine.classList.contains("cm-inactive-list-depth-0") &&
    nestedChildListLine?.classList.contains("cm-inactive-blockquote-depth-2") === true &&
    nestedChildListLine.classList.contains("cm-inactive-list-depth-1") &&
    deepQuoteLine?.classList.contains("cm-inactive-blockquote-depth-3") === true &&
    deepQuoteLine.classList.contains("cm-inactive-code-block") === false &&
    codeLine?.classList.contains("cm-inactive-blockquote") === true &&
    codeLine.classList.contains("cm-inactive-code-block") &&
    mathWidget !== null &&
    quoteMarkers.includes("> ");
  const renderingDetails = {
    codeLineClass: codeLine?.className ?? null,
    childListLineClass: childListLine?.className ?? null,
    deepQuoteLineClass: deepQuoteLine?.className ?? null,
    listLineClasses: listLines.map((line) => line.className),
    mathWidgetText: mathWidget?.textContent ?? null,
    nestedChildListLineClass: nestedChildListLine?.className ?? null,
    nestedListLineClass: nestedListLine?.className ?? null,
    nestedQuoteLineClass: nestedQuoteLine?.className ?? null,
    quoteMarkers
  };
  renderingHarness.controller.destroy();

  const enterInitialContent = "> alpha";
  const enterExpectedContent = ["> alpha", ">", "> "].join("\n");
  const enterHarness = setupHarness(enterInitialContent);
  enterHarness.controller.setSelection(enterInitialContent.length);
  await settle();

  const enterAccepted = dispatchEnter(enterHarness.view);
  await settle();

  const actualContent = enterHarness.controller.getContent();
  const actualSelection = enterHarness.controller.getSelection();
  const enterPass =
    actualContent === enterExpectedContent &&
    actualSelection.anchor === enterExpectedContent.length &&
    actualSelection.head === enterExpectedContent.length;
  enterHarness.controller.destroy();

  const nestedEnterInitialContent = "> > alpha";
  const nestedEnterExpectedContent = ["> > alpha", "> > ", "> > "].join("\n");
  const nestedEnterHarness = setupHarness(nestedEnterInitialContent);
  nestedEnterHarness.controller.setSelection(nestedEnterInitialContent.length);
  await settle();
  const nestedEnterAccepted = dispatchEnter(nestedEnterHarness.view);
  await settle();
  const nestedEnterActualContent = nestedEnterHarness.controller.getContent();
  const nestedEnterActualSelection = nestedEnterHarness.controller.getSelection();
  const nestedEnterLines = Array.from(nestedEnterHarness.root.querySelectorAll<HTMLElement>(".cm-line"));
  const nestedEnterLineClasses = nestedEnterLines.map((line) => line.className);
  const visibleRawNestedEnterMarker = findTextRectOutsideClosestClasses(nestedEnterHarness.root, ">", [
    "cm-active-blockquote-marker",
    "cm-inactive-blockquote-marker"
  ]);
  const nestedEnterPass =
    nestedEnterActualContent === nestedEnterExpectedContent &&
    nestedEnterActualSelection.anchor === nestedEnterExpectedContent.length &&
    nestedEnterActualSelection.head === nestedEnterExpectedContent.length &&
    nestedEnterLineClasses.length === 3 &&
    nestedEnterLineClasses.every((className) => /\bcm-inactive-blockquote-depth-2\b/u.test(className)) &&
    visibleRawNestedEnterMarker === null;
  nestedEnterHarness.controller.destroy();

  const emptyNestedEnterInitialContent = ["> 11", "> > 222", "> > > "].join("\n");
  const emptyNestedEnterExpectedContent = ["> 11", "> > 222", "> > "].join("\n");
  const emptyNestedEnterHarness = setupHarness(emptyNestedEnterInitialContent);
  emptyNestedEnterHarness.controller.setSelection(emptyNestedEnterInitialContent.length);
  await settle();
  const emptyNestedEnterAccepted = dispatchEnter(emptyNestedEnterHarness.view);
  await settle();
  const emptyNestedEnterActualContent = emptyNestedEnterHarness.controller.getContent();
  const emptyNestedEnterActualSelection = emptyNestedEnterHarness.controller.getSelection();
  const emptyNestedActiveLine = Array.from(
    emptyNestedEnterHarness.root.querySelectorAll<HTMLElement>(".cm-line")
  ).at(-1) ?? null;
  const emptyNestedCaretRect = emptyNestedEnterHarness.view.coordsAtPos(emptyNestedEnterActualSelection.anchor);
  const emptyNestedCaretHasGeometry =
    emptyNestedCaretRect !== null &&
    Number.isFinite(emptyNestedCaretRect.top) &&
    Number.isFinite(emptyNestedCaretRect.bottom) &&
    emptyNestedCaretRect.bottom > emptyNestedCaretRect.top;
  const emptyNestedEnterPass =
    emptyNestedEnterActualContent === emptyNestedEnterExpectedContent &&
    emptyNestedEnterActualSelection.anchor === emptyNestedEnterExpectedContent.length &&
    emptyNestedEnterActualSelection.head === emptyNestedEnterExpectedContent.length &&
    emptyNestedActiveLine?.classList.contains("cm-inactive-blockquote-depth-2") === true &&
    emptyNestedActiveLine.classList.contains("cm-inactive-blockquote-depth-3") === false &&
    emptyNestedCaretHasGeometry;
  emptyNestedEnterHarness.controller.destroy();

  const quoteListInitialContent = "> - item";
  const quoteListExpectedContent = ["> - item", "> - "].join("\n");
  const quoteListHarness = setupHarness(quoteListInitialContent);
  quoteListHarness.controller.setSelection(quoteListInitialContent.length);
  await settle();
  const quoteListEnterAccepted = dispatchEnter(quoteListHarness.view);
  await settle();
  const quoteListActualContent = quoteListHarness.controller.getContent();
  const quoteListActualSelection = quoteListHarness.controller.getSelection();
  const quoteListEnterPass =
    quoteListActualContent === quoteListExpectedContent &&
    quoteListActualSelection.anchor === quoteListExpectedContent.length &&
    quoteListActualSelection.head === quoteListExpectedContent.length;
  quoteListHarness.controller.destroy();

  const quoteChildListInitialContent = ["> - parent", ">   - "].join("\n");
  const quoteChildListExpectedContent = ["> - parent", "> - "].join("\n");
  const quoteChildListHarness = setupHarness(quoteChildListInitialContent);
  quoteChildListHarness.controller.setSelection(quoteChildListInitialContent.length);
  await settle();
  const quoteChildListEnterAccepted = dispatchEnter(quoteChildListHarness.view);
  await settle();
  const quoteChildListActualContent = quoteChildListHarness.controller.getContent();
  const quoteChildListActualSelection = quoteChildListHarness.controller.getSelection();
  const quoteChildListEnterPass =
    quoteChildListActualContent === quoteChildListExpectedContent &&
    quoteChildListActualSelection.anchor === quoteChildListExpectedContent.length &&
    quoteChildListActualSelection.head === quoteChildListExpectedContent.length;
  quoteChildListHarness.controller.destroy();

  const quoteNestedOrderedListInitialContent = [
    "> 1. 111",
    "> 2. 333",
    ">    1. 222",
    ">       1. 1.1",
    ">       2."
  ].join("\n");
  const quoteNestedOrderedListExpectedContent = [
    "> 1. 111",
    "> 2. 333",
    ">    1. 222",
    ">       1. 1.1",
    ">    2."
  ].join("\n");
  const quoteNestedOrderedListHarness = setupHarness(quoteNestedOrderedListInitialContent);
  quoteNestedOrderedListHarness.controller.setSelection(quoteNestedOrderedListInitialContent.length);
  await settle();
  const quoteNestedOrderedListEnterAccepted = dispatchEnter(quoteNestedOrderedListHarness.view);
  await settle();
  const quoteNestedOrderedListActualContent = quoteNestedOrderedListHarness.controller.getContent();
  const quoteNestedOrderedListActualSelection = quoteNestedOrderedListHarness.controller.getSelection();
  const quoteNestedOrderedListEnterPass =
    quoteNestedOrderedListActualContent === quoteNestedOrderedListExpectedContent &&
    quoteNestedOrderedListActualSelection.anchor === quoteNestedOrderedListExpectedContent.length &&
    quoteNestedOrderedListActualSelection.head === quoteNestedOrderedListExpectedContent.length;
  quoteNestedOrderedListHarness.controller.destroy();

  const quoteTopListInitialContent = ["> - parent", "> - "].join("\n");
  const quoteTopListExpectedContent = ["> - parent", ">", "> "].join("\n");
  const quoteTopListHarness = setupHarness(quoteTopListInitialContent);
  quoteTopListHarness.controller.setSelection(quoteTopListInitialContent.length);
  await settle();
  const quoteTopListEnterAccepted = dispatchEnter(quoteTopListHarness.view);
  await settle();
  const quoteTopListActualContent = quoteTopListHarness.controller.getContent();
  const quoteTopListActualSelection = quoteTopListHarness.controller.getSelection();
  const quoteTopListEnterPass =
    quoteTopListActualContent === quoteTopListExpectedContent &&
    quoteTopListActualSelection.anchor === quoteTopListExpectedContent.length &&
    quoteTopListActualSelection.head === quoteTopListExpectedContent.length;
  quoteTopListHarness.controller.destroy();

  const quoteActiveListInitialContent = ["> - parent", "> - child", "> - sibling"].join("\n");
  const quoteActiveListHarness = setupHarness(quoteActiveListInitialContent);
  quoteActiveListHarness.controller.setSelection(quoteActiveListInitialContent.indexOf("child"));
  await settle();
  const quoteActiveParentLine = findLineByText(quoteActiveListHarness.root, "parent");
  const quoteActiveChildLine = findLineByText(quoteActiveListHarness.root, "child");
  const quoteActiveSiblingLine = findLineByText(quoteActiveListHarness.root, "sibling");
  const quoteActiveListPass =
    quoteActiveParentLine?.classList.contains("cm-inactive-list") === true &&
    quoteActiveParentLine.querySelector(".cm-inactive-list-marker")?.textContent === "-" &&
    quoteActiveChildLine?.classList.contains("cm-active-list") === true &&
    quoteActiveChildLine.querySelector(".cm-active-list-marker")?.textContent === "-" &&
    quoteActiveSiblingLine?.classList.contains("cm-inactive-list") === true &&
    quoteActiveSiblingLine.querySelector(".cm-inactive-list-marker")?.textContent === "-";
  const quoteActiveListDetails = {
    childClass: quoteActiveChildLine?.className ?? null,
    childMarker: quoteActiveChildLine?.querySelector(".cm-active-list-marker")?.textContent ?? null,
    parentClass: quoteActiveParentLine?.className ?? null,
    parentMarker: quoteActiveParentLine?.querySelector(".cm-inactive-list-marker")?.textContent ?? null,
    siblingClass: quoteActiveSiblingLine?.className ?? null,
    siblingMarker: quoteActiveSiblingLine?.querySelector(".cm-inactive-list-marker")?.textContent ?? null
  };
  quoteActiveListHarness.controller.destroy();

  const quoteListBackspaceInitialContent = ["> - parent", ">   - "].join("\n");
  const quoteListBackspaceExpectedContent = ["> - parent", "> "].join("\n");
  const quoteListBackspaceHarness = setupHarness(quoteListBackspaceInitialContent);
  quoteListBackspaceHarness.controller.setSelection(quoteListBackspaceInitialContent.length);
  await settle();
  const quoteListBackspaceAccepted = [
    dispatchBackspace(quoteListBackspaceHarness.view),
    dispatchBackspace(quoteListBackspaceHarness.view),
    dispatchBackspace(quoteListBackspaceHarness.view)
  ];
  await settle();
  const quoteListBackspaceActualContent = quoteListBackspaceHarness.controller.getContent();
  const quoteListBackspaceActualSelection = quoteListBackspaceHarness.controller.getSelection();
  const quoteListBackspacePass =
    quoteListBackspaceActualContent === quoteListBackspaceExpectedContent &&
    quoteListBackspaceActualSelection.anchor === quoteListBackspaceExpectedContent.length &&
    quoteListBackspaceActualSelection.head === quoteListBackspaceExpectedContent.length;
  quoteListBackspaceHarness.controller.destroy();

  const quoteListTabInitialContent = ["> - parent", "> - child"].join("\n");
  const quoteListTabIndentedContent = ["> - parent", ">   - child"].join("\n");
  const quoteListTabHarness = setupHarness(quoteListTabInitialContent);
  quoteListTabHarness.controller.setSelection(quoteListTabInitialContent.indexOf("child"));
  await settle();
  const quoteListTabAccepted = dispatchTab(quoteListTabHarness.view);
  await settle();
  const quoteListTabActualIndentedContent = quoteListTabHarness.controller.getContent();
  const quoteListTabIndentedSelection = quoteListTabHarness.controller.getSelection();
  const quoteListShiftTabAccepted = dispatchTab(quoteListTabHarness.view, true);
  await settle();
  const quoteListTabActualOutdentedContent = quoteListTabHarness.controller.getContent();
  const quoteListTabOutdentedSelection = quoteListTabHarness.controller.getSelection();
  const quoteListTabPass =
    quoteListTabActualIndentedContent === quoteListTabIndentedContent &&
    quoteListTabIndentedSelection.anchor === quoteListTabIndentedContent.indexOf("child") &&
    quoteListTabIndentedSelection.head === quoteListTabIndentedContent.indexOf("child") &&
    quoteListTabActualOutdentedContent === quoteListTabInitialContent &&
    quoteListTabOutdentedSelection.anchor === quoteListTabInitialContent.indexOf("child") &&
    quoteListTabOutdentedSelection.head === quoteListTabInitialContent.indexOf("child");
  quoteListTabHarness.controller.destroy();

  return {
    actualContent,
    actualSelection,
    caseId: "blockquote-inner-blocks-rendering-enter",
    details: {
      enterAccepted,
      nestedQuoteEnter: {
        accepted: nestedEnterAccepted,
        actualContent: nestedEnterActualContent,
        actualSelection: nestedEnterActualSelection,
        expectedContent: nestedEnterExpectedContent,
        lineClasses: nestedEnterLineClasses,
        visibleRawMarkerMeasured: visibleRawNestedEnterMarker !== null
      },
      emptyNestedQuoteEnter: {
        accepted: emptyNestedEnterAccepted,
        actualContent: emptyNestedEnterActualContent,
        actualSelection: emptyNestedEnterActualSelection,
        caretBottom: emptyNestedCaretRect?.bottom ?? null,
        caretHasGeometry: emptyNestedCaretHasGeometry,
        caretLeft: emptyNestedCaretRect?.left ?? null,
        caretTop: emptyNestedCaretRect?.top ?? null,
        expectedContent: emptyNestedEnterExpectedContent,
        lineClass: emptyNestedActiveLine?.className ?? null
      },
      quoteChildListEnter: {
        accepted: quoteChildListEnterAccepted,
        actualContent: quoteChildListActualContent,
        actualSelection: quoteChildListActualSelection,
        expectedContent: quoteChildListExpectedContent
      },
      quoteNestedOrderedListEnter: {
        accepted: quoteNestedOrderedListEnterAccepted,
        actualContent: quoteNestedOrderedListActualContent,
        actualSelection: quoteNestedOrderedListActualSelection,
        expectedContent: quoteNestedOrderedListExpectedContent
      },
      quoteListBackspace: {
        accepted: quoteListBackspaceAccepted,
        actualContent: quoteListBackspaceActualContent,
        actualSelection: quoteListBackspaceActualSelection,
        expectedContent: quoteListBackspaceExpectedContent
      },
      quoteActiveList: quoteActiveListDetails,
      quoteListEnter: {
        accepted: quoteListEnterAccepted,
        actualContent: quoteListActualContent,
        actualSelection: quoteListActualSelection,
        expectedContent: quoteListExpectedContent
      },
      quoteListTab: {
        indentedContent: quoteListTabActualIndentedContent,
        indentedSelection: quoteListTabIndentedSelection,
        outdentedContent: quoteListTabActualOutdentedContent,
        outdentedSelection: quoteListTabOutdentedSelection,
        tabAccepted: quoteListTabAccepted,
        shiftTabAccepted: quoteListShiftTabAccepted
      },
      quoteTopListEnter: {
        accepted: quoteTopListEnterAccepted,
        actualContent: quoteTopListActualContent,
        actualSelection: quoteTopListActualSelection,
        expectedContent: quoteTopListExpectedContent
      },
      rendering: renderingDetails
    },
    expectedContent: enterExpectedContent,
    expectedSelection: {
      anchor: enterExpectedContent.length,
      head: enterExpectedContent.length
    },
    grammar: "blockquote",
    name: "blockquote inner blocks render with block styles and Enter creates a quoted separator",
    pass:
      renderingPass &&
      enterPass &&
      nestedEnterPass &&
      emptyNestedEnterPass &&
      quoteListEnterPass &&
      quoteChildListEnterPass &&
      quoteNestedOrderedListEnterPass &&
      quoteTopListEnterPass &&
      quoteActiveListPass &&
      quoteListBackspacePass &&
      quoteListTabPass
  };
}

async function runListDragSelectionCase(input: {
  initialContent: string;
  name: string;
  selectionAnchor: number;
  visibleText: string;
}): Promise<CaseResult> {
  const harness = setupHarness(input.initialContent);
  harness.controller.setSelection(input.selectionAnchor);
  await settle();

  const rect = findTextRect(harness.root, input.visibleText);
  const line = findLineByText(harness.root, input.visibleText);
  if (!rect || !line) {
    const result = resultFor({
      details: {
        lineFound: line !== null,
        reason: "content rect or line missing",
        rectFound: rect !== null
      },
      grammar: "list",
      harness,
      name: input.name,
      pass: false
    });
    harness.controller.destroy();
    return result;
  }

  const y = rect.top + rect.height / 2;
  const fromX = rect.left + 1;
  const toX = rect.right - 1;

  dispatchMouse(line, "mousedown", { clientX: fromX, clientY: y });
  dispatchMouse(document, "mousemove", { clientX: toX, clientY: y });
  dispatchMouse(document, "mouseup", { clientX: toX, clientY: y });
  await settle();

  const selection = harness.controller.getSelection();
  const selectedFrom = Math.min(selection.anchor, selection.head);
  const selectedTo = Math.max(selection.anchor, selection.head);
  const expectedFrom = input.initialContent.indexOf(input.visibleText);
  const expectedTo = expectedFrom + input.visibleText.length;
  const pass = expectedFrom >= 0 && selectedFrom <= expectedFrom && selectedTo >= expectedTo;

  const result = resultFor({
    details: {
      dragFromX: fromX,
      dragTarget: describeElement(line),
      dragToX: toX,
      expectedFrom,
      expectedTo,
      lineClasses: line.className,
      selectedFrom,
      selectedText: input.initialContent.slice(selectedFrom, selectedTo),
      selectedTo
    },
    expectedSelection: { anchor: expectedFrom, head: expectedTo },
    grammar: "list",
    harness,
    name: input.name,
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

const namedProbeCases: NamedProbeCase[] = [
  { caseId: "empty-type-hash", group: "empty-document", run: runEmptyTypeHashCase },
  { caseId: "empty-type-one-space", group: "empty-document", run: runEmptyDocumentSpaceCaretCase },
  { caseId: "empty-type-three-spaces", group: "empty-document", run: runEmptyTypeThreeSpacesCase },
  { caseId: "empty-spaces-enter-text", group: "empty-document", run: runEmptySpacesEnterTextCase },
  { caseId: "empty-spaces-repeated-enter", group: "empty-document", run: runEmptySpacesRepeatedEnterCase },
  { caseId: "paragraph-end-enter", group: "paragraph", run: runParagraphEndEnterCase },
  { caseId: "paragraph-middle-enter", group: "paragraph", run: runParagraphMiddleEnterCase },
  { caseId: "paragraph-start-enter", group: "paragraph", run: runParagraphStartEnterCase },
  { caseId: "heading-end-enter", group: "heading", run: runHeadingEndEnterCase },
  { caseId: "heading-end-repeated-enter", group: "heading", run: runHeadingEndRepeatedEnterCase },
  { caseId: "heading-empty-paragraph-space", group: "heading", run: runHeadingEnterSpaceCaretCase },
  { caseId: "heading-empty-paragraph-backspace", group: "heading", run: runHeadingEmptyParagraphBackspaceCase },
  { caseId: "structural-blank-arrow-down", group: "structural-blank", run: runStructuralBlankArrowDownCase },
  { caseId: "blockquote-raw-prefix-hidden", group: "blockquote", run: runBlockquoteRawPrefixCase },
  { caseId: "blockquote-marker-commits-after-text", group: "blockquote", run: runBlockquoteMarkerCommitInputCase },
  { caseId: "blockquote-marker-commits-after-selection-move", group: "blockquote", run: runBlockquoteMarkerCommitOnSelectionMoveCase },
  { caseId: "nested-blockquote-marker-commits-after-text", group: "blockquote", run: runNestedBlockquoteMarkerCommitInputCase },
  { caseId: "blockquote-marker-commits-after-enter", group: "blockquote", run: runBlockquoteMarkerCommitOnEnterInputCase },
  { caseId: "nested-blockquote-marker-commits-after-enter", group: "blockquote", run: runNestedBlockquoteMarkerCommitOnEnterInputCase },
  { caseId: "blockquote-bare-separator-rendering", group: "blockquote", run: runBlockquoteBareSeparatorRenderingCase },
  { caseId: "blockquote-structural-separator-navigation", group: "blockquote", run: runBlockquoteStructuralSeparatorNavigationCase },
  { caseId: "blockquote-trailing-empty-separator-backspace", group: "blockquote", run: runBlockquoteTrailingEmptySeparatorBackspaceCase },
  { caseId: "blockquote-list-trailing-empty-backspace", group: "blockquote", run: runBlockquoteListTrailingEmptyBackspaceCase },
  { caseId: "nested-quote-list-repeated-enter-exit", group: "blockquote", run: runNestedQuoteListRepeatedEnterExitCase },
  { caseId: "blockquote-inner-blocks-rendering-enter", group: "blockquote", run: runBlockquoteInnerBlocksRenderingAndEnterCase },
  { caseId: "deep-ordered-list-repeated-enter-exit", group: "list", run: runDeepOrderedListRepeatedEnterExitCase },
  { caseId: "top-level-list-item-enter-body-upgrade", group: "list", run: runTopLevelListItemEnterBodyUpgradeCase }
];

const namedProbeAliases = new Map<string, string>([
  ["empty-document-space-caret", "empty-type-one-space"],
  ["heading-enter-space-caret", "heading-empty-paragraph-space"]
]);

function buildProbeResult(cases: CaseResult[]): ProbeResult {
  const failures = cases
    .filter((entry) => !entry.pass)
    .map((entry) => `${entry.caseId}:${entry.grammar}/${entry.name}`);

  return {
    cases,
    failures,
    pass: failures.length === 0
  };
}

async function runRequestedNamedProbeCase(
  requestedCase: string | null,
  requestedGroup: string | null
): Promise<ProbeResult | null> {
  if (requestedCase && requestedCase.length > 0) {
    const caseId = namedProbeAliases.get(requestedCase) ?? requestedCase;
    const entry = namedProbeCases.find((candidate) => candidate.caseId === caseId);

    if (!entry) {
      return {
        cases: [],
        failures: [`Unknown markdown editing experience probe case: ${requestedCase}`],
        pass: false
      };
    }

    return buildProbeResult([await entry.run()]);
  }

  if (requestedGroup && requestedGroup.length > 0) {
    const entries = requestedGroup === "oracle-captured"
      ? namedProbeCases
      : namedProbeCases.filter((entry) => entry.group === requestedGroup);

    if (entries.length === 0) {
      return {
        cases: [],
        failures: [`Unknown markdown editing experience probe group: ${requestedGroup}`],
        pass: false
      };
    }

    const cases: CaseResult[] = [];
    for (const entry of entries) {
      cases.push(await entry.run());
    }

    return buildProbeResult(cases);
  }

  return null;
}

export async function runMarkdownEditingExperienceProbe(): Promise<ProbeResult> {
  document.body.style.margin = "0";
  document.body.style.background = "#fff";
  document.body.style.color = "#1f2937";
  document.body.style.fontFamily = "Georgia, 'Times New Roman', serif";
  document.body.style.fontSize = "16px";

  const requestedCase = new URLSearchParams(window.location.search).get("case");
  const requestedGroup = new URLSearchParams(window.location.search).get("group");
  const requestedProbeResult = await runRequestedNamedProbeCase(requestedCase, requestedGroup);
  if (requestedProbeResult) {
    return requestedProbeResult;
  }

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

  cases.push(...await runListStyleNativeInputCases());
  cases.push(await runSingleDashDraftInputCase());
  cases.push(await runSingleOrderedMarkerDraftInputCase());
  cases.push(await runSingleDashDirectChineseInputCase());
  cases.push(await runSingleOrderedMarkerDirectChineseInputCase());
  cases.push(await runBareDashCompositionPreviewCase());
  cases.push(await runCommittedDashListCompositionPreviewCase());
  cases.push(...await runSequentialListTypingCases());
  cases.push(...await runStrictHumanListInputCases());

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

  cases.push(await runHeadingEnterSpaceCaretCase());
  cases.push(await runListDoubleEnterExitInsertCase());
  cases.push(await runListDoubleEnterBackspaceCase());
  cases.push(await runDeepNestedListExitCaretCase());
  cases.push(await runDeepNestedListExitBeforeFollowingContentCaretCase());
  cases.push(await runDeepOrderedListRepeatedEnterExitCase());
  cases.push(await runTopLevelListItemEnterBodyUpgradeCase());
  cases.push(await runNestedEmptyListMarkerBackspaceCaretCase());

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
  cases.push(await runBlockquoteMarkerCommitInputCase());
  cases.push(await runNestedBlockquoteMarkerCommitInputCase());
  cases.push(await runBlockquoteBareSeparatorRenderingCase());
  cases.push(await runBlockquoteStructuralSeparatorNavigationCase());
  cases.push(await runBlockquoteTrailingEmptySeparatorBackspaceCase());
  cases.push(await runNestedQuoteListRepeatedEnterExitCase());
  cases.push(await runBlockquoteInnerBlocksRenderingAndEnterCase());

  cases.push(
    await runListDragSelectionCase({
      initialContent: ["段落", "- 选择这一整行"].join("\n"),
      name: "mouse drag can select rendered unordered list item content",
      selectionAnchor: 0,
      visibleText: "选择这一整行"
    })
  );

  cases.push(
    await runListDragSelectionCase({
      initialContent: ["段落", "1. 选择有序这一行"].join("\n"),
      name: "mouse drag can select rendered ordered list item content",
      selectionAnchor: 0,
      visibleText: "选择有序这一行"
    })
  );

  cases.push(
    await runListDragSelectionCase({
      initialContent: ["段落", "- [ ] 选择任务这一行"].join("\n"),
      name: "mouse drag can select rendered task list item content",
      selectionAnchor: 0,
      visibleText: "选择任务这一行"
    })
  );

  cases.push(
    await runListDragSelectionCase({
      initialContent: ["段落", "- 父项", "  - 选择子列表这一行"].join("\n"),
      name: "mouse drag can select rendered nested list item content",
      selectionAnchor: 0,
      visibleText: "选择子列表这一行"
    })
  );

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

  return buildProbeResult(cases);
}

Object.assign(window, {
  __runFishmarkMarkdownEditingExperienceProbe: runMarkdownEditingExperienceProbe
});

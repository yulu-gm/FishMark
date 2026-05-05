import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { createCodeEditorController } from "./code-editor";

type SerializableRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type RowGeometry = {
  content: SerializableRect;
  line: SerializableRect;
  marker: SerializableRect;
};

type ProbeResult = {
  active: RowGeometry;
  activeTask: {
    checkbox: SerializableRect;
    dash: SerializableRect;
    marker: SerializableRect;
  };
  blockAnchors: {
    heading: SerializableRect;
    paragraph: SerializableRect;
  };
  deltas: Record<string, number>;
  failures: string[];
  inactive: RowGeometry;
  inactiveTopLevel: {
    ordered: RowGeometry;
    task: RowGeometry;
    unordered: RowGeometry;
  };
  inactiveSiblings: {
    ordered: RowGeometry;
    unordered: RowGeometry;
  };
  pass: boolean;
};

const CONTENT = [
  "# Heading",
  "Paragraph text",
  "- root",
  "1. root numbered",
  "- [x] root task",
  "  - bullet child",
  "  1. numbered child",
  "  2. 11111",
  "  3. 333333",
  "    1. 1111",
  "    2. 1111",
  "",
  "after"
].join("\n");

const TOLERANCE_PX = 1;

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

function findLineByText(root: ParentNode, text: string): HTMLElement {
  const line = Array.from(root.querySelectorAll<HTMLElement>(".cm-line")).find((entry) =>
    entry.textContent?.includes(text)
  );

  if (!line) {
    throw new Error(`Could not find CodeMirror line containing ${JSON.stringify(text)}.`);
  }

  return line;
}

function createRangeForText(root: Node, text: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const value = current.nodeValue ?? "";
    const index = value.indexOf(text);

    if (index >= 0) {
      const range = document.createRange();
      range.setStart(current, index);
      range.setEnd(current, index + text.length);
      return range;
    }

    current = walker.nextNode();
  }

  throw new Error(`Could not find rendered text ${JSON.stringify(text)}.`);
}

function firstRangeRect(root: Node, text: string): SerializableRect {
  const rect = Array.from(createRangeForText(root, text).getClientRects()).find(
    (entry) => entry.width > 0 && entry.height > 0
  );

  if (!rect) {
    throw new Error(`Could not measure rendered text ${JSON.stringify(text)}.`);
  }

  return toSerializableRect(rect);
}

function measureRow(root: ParentNode, targetText: string, markerText: string): RowGeometry {
  const line = findLineByText(root, targetText);

  return {
    line: toSerializableRect(line.getBoundingClientRect()),
    marker: firstRangeRect(line, markerText),
    content: firstRangeRect(line, targetText)
  };
}

function measureRowWithMarkerElement(root: ParentNode, targetText: string): RowGeometry {
  const line = findLineByText(root, targetText);
  const marker =
    line.querySelector<HTMLElement>(".cm-inactive-task-marker") ??
    line.querySelector<HTMLElement>(".cm-inactive-list-marker, .cm-active-list-marker");

  if (!marker) {
    throw new Error(`Could not find list marker element for ${JSON.stringify(targetText)}.`);
  }

  return {
    line: toSerializableRect(line.getBoundingClientRect()),
    marker: toSerializableRect(marker.getBoundingClientRect()),
    content: firstRangeRect(line, targetText)
  };
}

function assertNear(failures: string[], name: string, actual: number, expected = 0): void {
  if (Math.abs(actual - expected) > TOLERANCE_PX) {
    failures.push(`${name}: expected ${expected}px +/- ${TOLERANCE_PX}px, got ${actual.toFixed(3)}px`);
  }
}

export async function runListGeometryProbe(): Promise<ProbeResult> {
  document.body.style.margin = "0";
  document.body.style.background = "#fff";
  document.body.style.color = "#1f2937";
  document.body.style.fontFamily = "Georgia, 'Times New Roman', serif";
  document.body.style.fontSize = "16px";

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
      "width: 340px",
      "padding: 0",
      "--fishmark-document-font-family: Georgia, 'Times New Roman', serif",
      "--fishmark-document-font-size: 16px"
    ].join(";")
  );

  const controller = createCodeEditorController({
    parent: root,
    initialContent: CONTENT,
    onChange: () => undefined
  });

  const editorRoot = root.querySelector<HTMLElement>(".cm-editor");
  if (!editorRoot) {
    throw new Error("Missing CodeMirror editor root.");
  }

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  controller.setSelection(CONTENT.indexOf("after"));
  await nextFrame();
  const inactive = measureRow(root, "333333", "3.");
  const blockAnchors = {
    heading: firstRangeRect(root, "Heading"),
    paragraph: firstRangeRect(root, "Paragraph text")
  };
  const inactiveTopLevel = {
    unordered: measureRowWithMarkerElement(root, "root"),
    ordered: measureRowWithMarkerElement(root, "root numbered"),
    task: measureRowWithMarkerElement(root, "root task")
  };
  const inactiveSiblings = {
    unordered: measureRowWithMarkerElement(root, "bullet child"),
    ordered: measureRowWithMarkerElement(root, "numbered child")
  };

  controller.setSelection(CONTENT.indexOf("333333") + "333333".length);
  await nextFrame();
  const active = measureRow(root, "333333", "3.");
  controller.setSelection(CONTENT.indexOf("root task") + "root task".length);
  await nextFrame();
  const activeTaskLine = findLineByText(root, "root task");
  const activeTaskMarker = activeTaskLine.querySelector<HTMLElement>(".cm-active-list-marker");

  if (!activeTaskMarker) {
    throw new Error("Could not find active task list marker.");
  }

  const activeTask = {
    marker: toSerializableRect(activeTaskMarker.getBoundingClientRect()),
    dash: firstRangeRect(activeTaskMarker, "-"),
    checkbox: firstRangeRect(activeTaskMarker, "[x]")
  };

  controller.destroy();

  const deltas = {
    contentLeft: active.content.left - inactive.content.left,
    contentTop: active.content.top - inactive.content.top,
    markerRight: active.marker.right - inactive.marker.right,
    markerTop: active.marker.top - inactive.marker.top,
    activeMarkerContentTop: active.marker.top - active.content.top,
    activeMarkerContentBaseline: active.marker.bottom - active.content.bottom,
    activeTaskCheckboxTopMinusDashTop: activeTask.checkbox.top - activeTask.dash.top,
    activeTaskCheckboxLeftMinusDashRight: activeTask.checkbox.left - activeTask.dash.right,
    inactiveHeadingMinusParagraphLeft: blockAnchors.heading.left - blockAnchors.paragraph.left,
    inactiveTopUnorderedMarkerLeftMinusParagraphLeft:
      inactiveTopLevel.unordered.marker.left - blockAnchors.paragraph.left,
    inactiveTopOrderedMarkerLeftMinusParagraphLeft:
      inactiveTopLevel.ordered.marker.left - blockAnchors.paragraph.left,
    inactiveTopTaskMarkerLeftMinusParagraphLeft:
      inactiveTopLevel.task.marker.left - blockAnchors.paragraph.left,
    inactiveOrderedMinusUnorderedContentLeft:
      inactiveSiblings.ordered.content.left - inactiveSiblings.unordered.content.left,
    inactiveOrderedMinusUnorderedMarkerLeft:
      inactiveSiblings.ordered.marker.left - inactiveSiblings.unordered.marker.left
  };
  const failures: string[] = [];

  assertNear(failures, "active content left minus inactive content left", deltas.contentLeft);
  assertNear(failures, "active content top minus inactive content top", deltas.contentTop);
  assertNear(failures, "active marker right minus inactive marker right", deltas.markerRight);
  assertNear(failures, "active marker top minus inactive marker top", deltas.markerTop);
  assertNear(failures, "active marker top minus active content top", deltas.activeMarkerContentTop);
  assertNear(
    failures,
    "active marker bottom minus active content bottom",
    deltas.activeMarkerContentBaseline
  );
  assertNear(
    failures,
    "active task checkbox top minus dash top",
    deltas.activeTaskCheckboxTopMinusDashTop
  );
  if (deltas.activeTaskCheckboxLeftMinusDashRight < -TOLERANCE_PX) {
    failures.push(
      `active task checkbox must stay after dash on the same visual row, got left-right delta ${deltas.activeTaskCheckboxLeftMinusDashRight.toFixed(
        3
      )}px`
    );
  }
  assertNear(
    failures,
    "inactive ordered content left minus unordered content left",
    deltas.inactiveOrderedMinusUnorderedContentLeft
  );
  assertNear(
    failures,
    "inactive heading left minus paragraph left",
    deltas.inactiveHeadingMinusParagraphLeft
  );
  assertNear(
    failures,
    "inactive top unordered marker left minus paragraph left",
    deltas.inactiveTopUnorderedMarkerLeftMinusParagraphLeft
  );
  assertNear(
    failures,
    "inactive top ordered marker left minus paragraph left",
    deltas.inactiveTopOrderedMarkerLeftMinusParagraphLeft
  );
  assertNear(
    failures,
    "inactive top task marker left minus paragraph left",
    deltas.inactiveTopTaskMarkerLeftMinusParagraphLeft
  );
  assertNear(
    failures,
    "inactive ordered marker left minus unordered marker left",
    deltas.inactiveOrderedMinusUnorderedMarkerLeft
  );

  return {
    active,
    activeTask,
    blockAnchors,
    deltas,
    failures,
    inactive,
    inactiveTopLevel,
    inactiveSiblings,
    pass: failures.length === 0
  };
}

Object.assign(window, {
  __runFishmarkListGeometryProbe: runListGeometryProbe
});

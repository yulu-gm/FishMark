import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/app-ui.css";
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

type DocumentMeasureSample = {
  canvasLeftFromWorkspace: number;
  canvasRightFromWorkspace: number;
  contentClientWidth: number;
  contentLeftFromCanvas: number;
  contentRightFromCanvas: number;
  contentScrollWidth: number;
  documentHeight: number;
  documentStageWidth: number;
  innerPaddingDelta: number;
  measure: string;
  measurePx: number;
  paddingEnd: number;
  paddingStart: number;
  renderedLineCount: number;
  scrollerClientHeight: number;
  scrollerScrollHeight: number;
  textColumnLeft: number;
  textColumnWidth: number;
  textColumnWidthVsMeasure: number;
  textFirstLineHeight: number;
  textFirstLineLeft: number;
  textFirstLineWidth: number;
  /* Full rendered text height from the scroll surface, independent of the visible slice. */
  totalTextHeight: number;
};

type DocumentMeasureSampleKey =
  | "editing-outline-closed"
  | "editing-outline-open"
  | "reading-outline-closed"
  | "reading-outline-open";

type SidePanelDragSampleKey = "stored-200" | "stored-360" | "stored-default";

type SidePanelDragSample = {
  contentClientWidth: number;
  contentScrollWidth: number;
  documentHeight: number;
  documentStageWidth: number;
  measure: string;
  renderedLineCount: number;
  scrollerClientHeight: number;
  scrollerScrollHeight: number;
  sidePanelWidth: number;
  storedWidth: string;
  textColumnLeft: number;
  textColumnWidth: number;
  textColumnWidthVsMeasure: number;
  textFirstLineLeft: number;
  textFirstLineWidth: number;
  totalTextHeight: number;
};

/*
 * Absolute position per panel state. Contract A is "switching shell mode must
 * not move the document", so only the editing/reading difference inside the
 * same panel state is asserted. The closed -> open difference is the accepted
 * panel translation and is reported, never asserted.
 */
type PanelStateAbsolutePosition = {
  firstLineLeft: number;
  textColumnLeft: number;
};

type EmptyDocumentLayoutProbeResult = {
  deltas: {
    canvasTopFromWorkspace: number;
    editingTextEndFromCanvasMinusReading: number;
    editingTextStartFromCanvasMinusReading: number;
    lineTopFromWorkspace: number;
    statusBarBottomFromViewport: number;
    welcomeStatusBarTopFromWorkspace: number;
  };
  documentMeasure: {
    absolutePosition: {
      closed: PanelStateAbsolutePosition;
      /* First-line X difference between reading and editing inside each panel state. */
      firstLineLeftModeTranslation: number;
      open: PanelStateAbsolutePosition;
      /*
       * Closed -> open translation. ACCEPTED BY OWNER DECISION: the side panel
       * occupies real layout width, so the centred document column shifts by
       * half the panel footprint when the panel opens. This is reported so a
       * regression that changes it is visible; it is never asserted as
       * invariance.
       */
      panelStateTranslation: number;
      /* Text-column X difference between reading and editing inside each panel state. */
      textColumnLeftModeTranslation: number;
    };
    failures: string[];
    /*
     * Rendered side panel widths per state. These prove the "open" samples
     * really do reserve a panel column through the shell CSS variables, so the
     * invariance result is not vacuous.
     */
    panelWidths: Record<DocumentMeasureSampleKey, number>;
    samples: Record<DocumentMeasureSampleKey, DocumentMeasureSample>;
    sidePanelDrag: {
      failures: string[];
      samples: Record<SidePanelDragSampleKey, SidePanelDragSample>;
      spread: {
        documentHeight: number;
        renderedLineCount: number;
        sidePanelWidth: number;
        textColumnLeft: number;
        textColumnWidth: number;
        totalTextHeight: number;
      };
    };
    spread: {
      documentHeight: number;
      documentStageWidth: number;
      renderedLineCount: number;
      sidePanelWidth: number;
      textColumnWidth: number;
      totalTextHeight: number;
    };
    windowInnerWidth: number;
  };
  failures: string[];
  pass: boolean;
  rects: {
    editing: ShellModeMeasurement["rects"];
    reading: ShellModeMeasurement["rects"];
    welcome: StatusBarMeasurement["rects"];
  };
  styles: {
    editing: ShellModeMeasurement["styles"];
    reading: ShellModeMeasurement["styles"];
    welcome: StatusBarMeasurement["styles"];
  };
};

type ShellMode = "editing" | "reading";

type ShellModeMeasurement = {
  margins: {
    textEndFromCanvasContent: number;
    textStartFromCanvasContent: number;
  };
  rects: {
    canvas: SerializableRect;
    content: SerializableRect;
    line: SerializableRect;
    statusBar: SerializableRect;
    workspace: SerializableRect;
  };
  styles: {
    statusBarBottom: string;
    statusBarLeft: string;
    statusBarPosition: string;
    statusBarRight: string;
  };
};

type StatusBarMeasurement = {
  rects: {
    statusBar: SerializableRect;
    workspace: SerializableRect;
  };
  styles: ShellModeMeasurement["styles"];
};

const MAX_CANVAS_TOP_FROM_WORKSPACE = 150;
const MAX_MODE_TEXT_MARGIN_DELTA = 2;
const MAX_LINE_TOP_FROM_WORKSPACE = 240;
const MAX_MODE_TEXT_COLUMN_WIDTH_DELTA = 1;
const MAX_CONTENT_HORIZONTAL_OVERFLOW = 0.5;
const MIN_OPEN_SIDE_PANEL_WIDTH = 200;
/* Minimum gutter contract; the revealed heading prefix also needs 6rem. */
const MIN_DOCUMENT_GUTTER = 24;
/* Exercise persisted side-panel widths through the real resize variable. */
const SIDE_PANEL_DRAG_STORED_WIDTHS: ReadonlyArray<{
  key: SidePanelDragSampleKey;
  storedWidth: string;
}> = [
  { key: "stored-200", storedWidth: "200px" },
  { key: "stored-360", storedWidth: "360px" }
];
/* Every stored width participates in the adaptive resize contract. */
const ADAPTIVE_DRAG_KEYS: ReadonlyArray<SidePanelDragSampleKey> = [
  "stored-default",
  "stored-200",
  "stored-360"
];
const MAX_DOCUMENT_STAGE_WIDTH_DELTA = 1;
const MIN_CANVAS_HEIGHT = 420;
const MIN_STATUS_BAR_BOTTOM_FROM_VIEWPORT = -20;
const MAX_STATUS_BAR_BOTTOM_FROM_VIEWPORT = 80;
const MIN_WELCOME_STATUS_BAR_TOP_RATIO = 0.5;

const MEASURE_PROBE_LINE = "aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt";
const MEASURE_PROBE_PARAGRAPH = `${MEASURE_PROBE_LINE} ${MEASURE_PROBE_LINE} ${MEASURE_PROBE_LINE}`;

function createMeasureProbeContent(paragraphCount: number): string {
  return Array.from({ length: paragraphCount }, () => MEASURE_PROBE_PARAGRAPH).join("\n\n");
}

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

function installLegacyWorkspaceThemeOverride(): void {
  const style = document.createElement("style");
  style.dataset.fishmarkProbe = "legacy-workspace-theme";
  style.textContent = `
    [data-fishmark-layout="workspace"].app-workspace {
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    [data-fishmark-layout="workspace"] .app-status-bar {
      position: static;
      left: auto;
      right: auto;
      bottom: auto;
      z-index: auto;
      min-height: auto;
      padding: var(--fishmark-space-2) 0 0;
    }
  `;
  document.head.append(style);
}

function createProbeShell(root: HTMLElement, shellMode: ShellMode, outlineOpen = false): HTMLElement {
  const isReadingMode = shellMode === "reading";
  const visibility = isReadingMode ? "collapsed" : "visible";

  root.innerHTML = `
    <main class="app-shell" data-fishmark-shell-mode="${shellMode}" style="--fishmark-titlebar-height: 0px;">
      <div class="app-layout" data-fishmark-shell-mode="${shellMode}" data-fishmark-has-document="true">
        <aside class="app-rail" data-fishmark-layout="rail" data-visibility="${visibility}"></aside>
        <div
          class="app-workspace"
          data-fishmark-layout="workspace"
          data-fishmark-shell-mode="${shellMode}"
          data-fishmark-has-document="true"
        >
          <nav class="workspace-tab-strip" data-fishmark-region="workspace-tab-strip" data-visibility="${visibility}">
            <div class="workspace-tab-strip-scroll">
              <div class="workspace-tab-shell is-active" data-active="true">
                <button type="button" class="workspace-tab" data-active="true">
                  <span class="workspace-tab-label">empty.md</span>
                </button>
              </div>
            </div>
          </nav>
          <section
            class="workspace-canvas is-editor-open"
            data-fishmark-region="workspace-canvas"
            data-fishmark-shell-mode="${shellMode}"
            data-fishmark-has-document="true"
          >
            <div
              data-fishmark-region="shortcut-hint-overlay-shell"
              class="shortcut-hint-overlay-shell"
              data-shortcut-hint-state="hidden"
            ></div>
            <section class="workspace-shell ${outlineOpen ? "is-side-panel-open" : ""}">
              <div class="document-canvas">
                <div id="probe-editor" class="document-editor"></div>
              </div>
              ${
                outlineOpen
                  ? `<aside
                class="side-panel"
                data-fishmark-region="side-panel"
                data-view-container="outline"
                data-state="open"
                aria-label="Document outline"
              >
                <div class="side-panel-header" data-fishmark-region="side-panel-header">
                  <p class="side-panel-title">Outline</p>
                  <button type="button" class="side-panel-close" aria-label="Collapse outline"></button>
                </div>
                <div class="side-panel-body" data-fishmark-region="side-panel-body">
                  <div class="outline-panel" data-fishmark-region="outline-panel">
                    <ol class="outline-panel-list">
                      <li>
                        <button type="button" class="outline-panel-item">
                          <span class="outline-panel-item-label">Probe heading</span>
                        </button>
                      </li>
                    </ol>
                  </div>
                </div>
              </aside>`
                  : ""
              }
            </section>
          </section>
          <footer class="app-status-bar" data-fishmark-region="app-status-bar" data-visibility="${visibility}">
            <div data-fishmark-region="status-strip">
              <p class="save-status is-clean">All changes saved</p>
              <p class="document-word-count">字数 0</p>
            </div>
          </footer>
        </div>
      </div>
    </main>
  `;

  const editorHost = root.querySelector<HTMLElement>("#probe-editor");
  if (!editorHost) {
    throw new Error("Missing empty document editor host.");
  }

  return editorHost;
}

function createWelcomeProbeShell(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell" data-fishmark-shell-mode="reading" style="--fishmark-titlebar-height: 0px;">
      <div class="app-layout" data-fishmark-shell-mode="reading" data-fishmark-has-document="false">
        <aside class="app-rail" data-fishmark-layout="rail" data-visibility="visible"></aside>
        <div
          class="app-workspace"
          data-fishmark-layout="workspace"
          data-fishmark-shell-mode="reading"
          data-fishmark-has-document="false"
        >
          <section
            class="workspace-canvas"
            data-fishmark-region="workspace-canvas"
            data-fishmark-shell-mode="reading"
            data-fishmark-has-document="false"
          >
            <section class="empty-workspace" data-fishmark-region="empty-state">
              <div class="empty-inner">
                <span class="empty-mark" aria-hidden="true"></span>
                <p class="empty-kicker">FishMark</p>
                <p class="empty-copy">Tip: Ctrl+1 · Heading 1</p>
                <p class="empty-meta">⌘ O · Ctrl O</p>
              </div>
            </section>
          </section>
          <footer class="app-status-bar" data-fishmark-region="app-status-bar" data-visibility="visible">
            <div data-fishmark-region="status-strip">
              <p class="app-version-label">FishMark v0.0.0-probe</p>
            </div>
          </footer>
        </div>
      </div>
    </main>
  `;
}

async function measureWelcomeStatusBar(root: HTMLElement): Promise<StatusBarMeasurement> {
  createWelcomeProbeShell(root);
  await nextFrame();

  const workspace = root.querySelector<HTMLElement>(".app-workspace");
  const statusBar = root.querySelector<HTMLElement>(".app-status-bar");
  if (!workspace || !statusBar) {
    throw new Error("Missing welcome status bar nodes.");
  }

  const statusBarStyle = window.getComputedStyle(statusBar);

  return {
    rects: {
      statusBar: toSerializableRect(statusBar.getBoundingClientRect()),
      workspace: toSerializableRect(workspace.getBoundingClientRect())
    },
    styles: {
      statusBarBottom: statusBarStyle.bottom,
      statusBarLeft: statusBarStyle.left,
      statusBarPosition: statusBarStyle.position,
      statusBarRight: statusBarStyle.right
    }
  };
}

type ProbeEditor = {
  content: HTMLElement;
  controller: ReturnType<typeof createCodeEditorController>;
  editorRoot: HTMLElement;
  host: HTMLElement;
};

function mountProbeEditor(
  root: HTMLElement,
  shellMode: ShellMode,
  initialContent: string,
  outlineOpen = false
): ProbeEditor {
  const host = createProbeShell(root, shellMode, outlineOpen);
  const controller = createCodeEditorController({
    parent: host,
    initialContent,
    onChange: () => undefined
  });

  const editorRoot = host.querySelector<HTMLElement>(".cm-editor");
  const content = host.querySelector<HTMLElement>(".cm-content");
  if (!editorRoot || !content) {
    throw new Error("Missing CodeMirror document nodes.");
  }

  return { content, controller, editorRoot, host };
}

/* Await actual finite transitions, independent of monitor refresh rate. */
async function settleTransitions(): Promise<void> {
  await nextFrame();
  await Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => {})));
  await nextFrame();
}

async function measureShellMode(root: HTMLElement, shellMode: ShellMode): Promise<ShellModeMeasurement> {
  const editor = mountProbeEditor(root, shellMode, "");
  const { content, controller, editorRoot } = editor;

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  controller.focus();
  await nextFrame();

  const workspace = root.querySelector<HTMLElement>(".app-workspace");
  const canvas = root.querySelector<HTMLElement>(".workspace-canvas");
  const statusBar = root.querySelector<HTMLElement>(".app-status-bar");
  if (!workspace || !canvas || !statusBar) {
    throw new Error("Missing measured shell nodes.");
  }

  const line = root.querySelector<HTMLElement>(".cm-line");
  if (!line) {
    throw new Error("Missing CodeMirror empty document line.");
  }

  const workspaceRect = workspace.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  const statusBarRect = statusBar.getBoundingClientRect();
  const contentStyle = window.getComputedStyle(content);
  const statusBarStyle = window.getComputedStyle(statusBar);
  const contentPaddingStart = Number.parseFloat(contentStyle.paddingLeft);
  const contentPaddingEnd = Number.parseFloat(contentStyle.paddingRight);
  const canvasContentLeft = canvasRect.left + canvas.clientLeft;
  const canvasContentRight = canvasContentLeft + canvas.clientWidth;

  controller.destroy();

  return {
    margins: {
      textEndFromCanvasContent: canvasContentRight - (contentRect.right - contentPaddingEnd),
      textStartFromCanvasContent: contentRect.left + contentPaddingStart - canvasContentLeft
    },
    rects: {
      canvas: toSerializableRect(canvasRect),
      content: toSerializableRect(contentRect),
      line: toSerializableRect(lineRect),
      statusBar: toSerializableRect(statusBarRect),
      workspace: toSerializableRect(workspaceRect)
    },
    styles: {
      statusBarBottom: statusBarStyle.bottom,
      statusBarLeft: statusBarStyle.left,
      statusBarPosition: statusBarStyle.position,
      statusBarRight: statusBarStyle.right
    }
  };
}

/* Compare modes at each panel state; panel resizing naturally reflows prose. */
async function measureDocumentMeasureMatrix(root: HTMLElement): Promise<EmptyDocumentLayoutProbeResult["documentMeasure"]> {
  const editor = mountProbeEditor(root, "editing", createMeasureProbeContent(24));
  const { content, controller, editorRoot } = editor;

  const workspace = root.querySelector<HTMLElement>(".app-workspace");
  const canvas = root.querySelector<HTMLElement>(".workspace-canvas");
  const workspaceShell = root.querySelector<HTMLElement>(".workspace-shell");
  const documentCanvas = root.querySelector<HTMLElement>(".document-canvas");
  const scroller = root.querySelector<HTMLElement>(".cm-scroller");
  if (!workspace || !canvas || !workspaceShell || !documentCanvas || !scroller) {
    throw new Error("Missing document measure shell nodes.");
  }

  editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  controller.focus();
  await nextFrame();

  /*
   * The side panel is the shared view-container column of the new shell. The
   * document stage always owns the trailing grid column; opening the panel
   * reserves the leading one through `.is-side-panel-open`.
   */
  const applyShellState = async (shellMode: ShellMode, sidePanelOpen: boolean): Promise<void> => {
    for (const element of root.querySelectorAll<HTMLElement>("[data-fishmark-shell-mode]")) {
      element.dataset.fishmarkShellMode = shellMode;
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-visibility]")) {
      element.dataset.visibility = shellMode === "reading" ? "collapsed" : "visible";
    }

    workspaceShell.classList.toggle("is-side-panel-open", sidePanelOpen);
    const existingSidePanel = workspaceShell.querySelector<HTMLElement>(".side-panel");

    if (sidePanelOpen && !existingSidePanel) {
      const sidePanel = document.createElement("aside");
      sidePanel.className = "side-panel";
      sidePanel.dataset.fishmarkRegion = "side-panel";
      sidePanel.dataset.viewContainer = "outline";
      sidePanel.dataset.state = "open";
      sidePanel.setAttribute("aria-label", "Document outline");
      sidePanel.innerHTML =
        '<div class="side-panel-header" data-fishmark-region="side-panel-header">' +
        '<p class="side-panel-title">Outline</p>' +
        '<button type="button" class="side-panel-close" aria-label="Collapse outline"></button>' +
        "</div>" +
        '<div class="side-panel-body" data-fishmark-region="side-panel-body">' +
        '<div class="outline-panel" data-fishmark-region="outline-panel">' +
        '<ol class="outline-panel-list"><li><button type="button" class="outline-panel-item">' +
        '<span class="outline-panel-item-label">Probe heading</span></button></li></ol>' +
        "</div></div>";
      workspaceShell.append(sidePanel);
    }

    if (!sidePanelOpen && existingSidePanel) {
      existingSidePanel.remove();
    }

    await settleTransitions();
  };

  const measure = (): DocumentMeasureSample => {
    const lines = Array.from(content.querySelectorAll<HTMLElement>(".cm-line"));
    const firstLine = lines[0];
    if (!firstLine) {
      throw new Error("Missing rendered document lines.");
    }

    const workspaceRect = workspace.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const firstLineRect = firstLine.getBoundingClientRect();
    const contentStyle = window.getComputedStyle(content);
    const paddingStart = Number.parseFloat(contentStyle.paddingLeft);
    const paddingEnd = Number.parseFloat(contentStyle.paddingRight);
    const lineHeight = firstLineRect.height;
    /* The adaptive column fills the stage minus the permanent marker gutters. */
    const measuredColumnWidth = content.clientWidth - paddingStart - paddingEnd;
    const expectedColumnWidth = content.clientWidth - 2 * Math.max(
      MIN_DOCUMENT_GUTTER, 6 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    );

    return {
      canvasLeftFromWorkspace: canvasRect.left - workspaceRect.left,
      canvasRightFromWorkspace: workspaceRect.right - canvasRect.right,
      contentClientWidth: content.clientWidth,
      contentLeftFromCanvas: contentRect.left - canvasRect.left,
      contentRightFromCanvas: canvasRect.right - contentRect.right,
      contentScrollWidth: content.scrollWidth,
      documentHeight: contentRect.height,
      documentStageWidth: documentCanvas.clientWidth,
      innerPaddingDelta: Math.abs(paddingStart - paddingEnd),
      measure: "adaptive",
      measurePx: 0,
      paddingEnd,
      paddingStart,
      renderedLineCount: lines.length,
      scrollerClientHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
      textColumnLeft: contentRect.left + paddingStart,
      textColumnWidth: measuredColumnWidth,
      textColumnWidthVsMeasure: Math.abs(measuredColumnWidth - expectedColumnWidth),
      textFirstLineHeight: lineHeight,
      textFirstLineLeft: firstLineRect.left,
      textFirstLineWidth: firstLineRect.width,
      totalTextHeight:
        scroller.scrollHeight -
        Number.parseFloat(contentStyle.paddingTop) -
        Number.parseFloat(contentStyle.paddingBottom)
    };
  };

  const samples = {} as Record<DocumentMeasureSampleKey, DocumentMeasureSample>;
  const panelWidths = {} as Record<DocumentMeasureSampleKey, number>;
  const shellModes: ShellMode[] = ["editing", "reading"];
  const sidePanelStates = [false, true];

  for (const shellMode of shellModes) {
    for (const sidePanelOpen of sidePanelStates) {
      await applyShellState(shellMode, sidePanelOpen);
      const key: DocumentMeasureSampleKey = `${shellMode}-outline-${sidePanelOpen ? "open" : "closed"}`;
      const sidePanel = workspaceShell.querySelector<HTMLElement>(".side-panel");
      panelWidths[key] = sidePanel ? sidePanel.getBoundingClientRect().width : 0;
      samples[key] = measure();
    }
  }

  /*
   * Drag contract. The React resizer writes `--fishmark-side-panel-stored-width`
   * inline on both `section.workspace-canvas` and `section.workspace-shell`
   * (WorkspaceShell.tsx), and the stylesheet resolves it to
   * `min(stored, 60vw)`. Writing the same inline variable on the same two
   * elements therefore exercises the real chain; only the pointer maths of the
   * resizer component itself is out of reach here.
   */
  const dragSamples = {} as Record<SidePanelDragSampleKey, SidePanelDragSample>;

  const applyStoredPanelWidth = async (storedWidth: string | null): Promise<void> => {
    for (const element of [canvas, workspaceShell]) {
      if (storedWidth === null) {
        element.style.removeProperty("--fishmark-side-panel-stored-width");
      } else {
        element.style.setProperty("--fishmark-side-panel-stored-width", storedWidth);
      }
    }

    await settleTransitions();
  };

  const measureDragSample = (storedWidth: string): SidePanelDragSample => {
    const sample = measure();
    const sidePanel = workspaceShell.querySelector<HTMLElement>(".side-panel");

    return {
      contentClientWidth: sample.contentClientWidth,
      contentScrollWidth: sample.contentScrollWidth,
      documentHeight: sample.documentHeight,
      documentStageWidth: sample.documentStageWidth,
      measure: sample.measure,
      renderedLineCount: sample.renderedLineCount,
      scrollerClientHeight: sample.scrollerClientHeight,
      scrollerScrollHeight: sample.scrollerScrollHeight,
      sidePanelWidth: sidePanel ? sidePanel.getBoundingClientRect().width : 0,
      storedWidth,
      textColumnLeft: sample.textColumnLeft,
      textColumnWidth: sample.textColumnWidth,
      textColumnWidthVsMeasure: sample.textColumnWidthVsMeasure,
      textFirstLineLeft: sample.textFirstLineLeft,
      textFirstLineWidth: sample.textFirstLineWidth,
      totalTextHeight: sample.totalTextHeight
    };
  };

  await applyShellState("editing", true);
  dragSamples["stored-default"] = measureDragSample("default");

  for (const { key, storedWidth } of SIDE_PANEL_DRAG_STORED_WIDTHS) {
    await applyStoredPanelWidth(storedWidth);
    dragSamples[key] = measureDragSample(storedWidth);
  }

  await applyStoredPanelWidth(null);

  controller.destroy();

  const sampleEntries = Object.entries(samples) as [DocumentMeasureSampleKey, DocumentMeasureSample][];
  const textColumnWidths = sampleEntries.map(([, sample]) => sample.textColumnWidth);
  const renderedLineCounts = sampleEntries.map(([, sample]) => sample.renderedLineCount);
  const documentHeights = sampleEntries.map(([, sample]) => sample.documentHeight);
  const totalTextHeights = sampleEntries.map(([, sample]) => sample.totalTextHeight);
  const documentStageWidths = sampleEntries.map(([, sample]) => sample.documentStageWidth);
  const panelWidthValues = Object.values(panelWidths);
  const spread = {
    documentHeight: Math.max(...documentHeights) - Math.min(...documentHeights),
    documentStageWidth: Math.max(...documentStageWidths) - Math.min(...documentStageWidths),
    renderedLineCount: Math.max(...renderedLineCounts) - Math.min(...renderedLineCounts),
    sidePanelWidth: Math.max(...panelWidthValues) - Math.min(...panelWidthValues),
    textColumnWidth: Math.max(...textColumnWidths) - Math.min(...textColumnWidths),
    totalTextHeight: Math.max(...totalTextHeights) - Math.min(...totalTextHeights)
  };

  /*
   * Contract A: switching shell mode must not move the document. Asserted
   * per panel state (editing vs reading at the same panel state); the accepted
   * closed -> open translation is reported separately.
   */
  const closedEditing = samples["editing-outline-closed"];
  const closedReading = samples["reading-outline-closed"];
  const openEditing = samples["editing-outline-open"];
  const openReading = samples["reading-outline-open"];
  const textColumnLeftModeTranslation = Math.max(
    Math.abs(closedEditing.textColumnLeft - closedReading.textColumnLeft),
    Math.abs(openEditing.textColumnLeft - openReading.textColumnLeft)
  );
  const firstLineLeftModeTranslation = Math.max(
    Math.abs(closedEditing.textFirstLineLeft - closedReading.textFirstLineLeft),
    Math.abs(openEditing.textFirstLineLeft - openReading.textFirstLineLeft)
  );
  const absolutePosition = {
    closed: {
      firstLineLeft: closedEditing.textFirstLineLeft,
      textColumnLeft: closedEditing.textColumnLeft
    },
    firstLineLeftModeTranslation,
    open: {
      firstLineLeft: openEditing.textFirstLineLeft,
      textColumnLeft: openEditing.textColumnLeft
    },
    panelStateTranslation: openEditing.textColumnLeft - closedEditing.textColumnLeft,
    textColumnLeftModeTranslation
  };
  const failures: string[] = [];

  if (textColumnLeftModeTranslation > MAX_MODE_TEXT_MARGIN_DELTA) {
    failures.push(
      `text column left edge differs between editing and reading by ${textColumnLeftModeTranslation.toFixed(
        2
      )}px within a panel state`
    );
  }

  if (firstLineLeftModeTranslation > MAX_MODE_TEXT_MARGIN_DELTA) {
    failures.push(
      `first line left edge differs between editing and reading by ${firstLineLeftModeTranslation.toFixed(
        2
      )}px within a panel state`
    );
  }

  // Side-panel changes reflow adaptive prose; mode changes at the same panel
  // width must preserve its width, wrapping and height.
  for (const key of ["textColumnWidth", "renderedLineCount", "totalTextHeight", "documentHeight"] as const) {
    const delta = Math.max(Math.abs(closedEditing[key] - closedReading[key]), Math.abs(openEditing[key] - openReading[key]));
    if (delta > (key === "renderedLineCount" ? 0 : MAX_MODE_TEXT_COLUMN_WIDTH_DELTA)) {
      failures.push(`${key} differs between reading and editing by ${delta}px within a panel state`);
    }
  }

  /*
   * Non-vacuity guard: the "open" samples must actually reserve a side panel
   * column, otherwise an invariance pass would mean nothing.
   */
  if (spread.sidePanelWidth < MIN_OPEN_SIDE_PANEL_WIDTH) {
    failures.push(
      `opening the side panel did not reserve a panel column: rendered panel width spread is ${spread.sidePanelWidth.toFixed(
        2
      )}px`
    );
  }

  /* Opening the side panel shrinks the document stage and its adaptive column. */

  for (const [key, panelWidth] of Object.entries(panelWidths)) {
    if (key.endsWith("-outline-open") && panelWidth < MIN_OPEN_SIDE_PANEL_WIDTH) {
      failures.push(`${key} rendered no side panel column: ${panelWidth.toFixed(2)}px`);
    }

    if (key.endsWith("-outline-closed") && panelWidth > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
      failures.push(`${key} rendered an unexpected side panel column: ${panelWidth.toFixed(2)}px`);
    }
  }

  for (const [key, sample] of sampleEntries) {
    if (sample.contentScrollWidth - sample.contentClientWidth > MAX_CONTENT_HORIZONTAL_OVERFLOW) {
      failures.push(
        `${key} overflows horizontally: scrollWidth ${sample.contentScrollWidth}px vs clientWidth ${sample.contentClientWidth}px`
      );
    }

    if (sample.paddingStart < 0 || sample.paddingEnd < 0) {
      failures.push(
        `${key} has negative document padding: ${sample.paddingStart.toFixed(2)}px / ${sample.paddingEnd.toFixed(2)}px`
      );
    }

    /* Equal inner gutters centre the adaptive text column inside its stage. */
    if (sample.innerPaddingDelta > MAX_MODE_TEXT_MARGIN_DELTA) {
      failures.push(
        `${key} does not centre the text column inside the document stage: padding ${sample.paddingStart.toFixed(
          2
        )}px / ${sample.paddingEnd.toFixed(2)}px`
      );
    }

    if (sample.textColumnWidthVsMeasure > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
      failures.push(
        `${key} text column ${sample.textColumnWidth.toFixed(2)}px does not match the adaptive width ${
          sample.measure
        } (stage content width ${sample.contentClientWidth}px)`
      );
    }

    if (sample.textColumnWidth + 2 * MIN_DOCUMENT_GUTTER > sample.documentStageWidth + MAX_DOCUMENT_STAGE_WIDTH_DELTA) {
      failures.push(
        `${key} document stage ${sample.documentStageWidth.toFixed(
          2
        )}px is narrower than the text column plus its gutter floor`
      );
    }

    if (Math.abs(sample.textColumnWidth - sample.textFirstLineWidth) > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
      failures.push(
        `${key} first line width ${sample.textFirstLineWidth.toFixed(2)}px does not match text column ${sample.textColumnWidth.toFixed(2)}px`
      );
    }

    if (Math.abs(sample.textColumnLeft - sample.textFirstLineLeft) > MAX_MODE_TEXT_MARGIN_DELTA) {
      failures.push(
        `${key} first line left ${sample.textFirstLineLeft.toFixed(
          2
        )}px does not match text column left ${sample.textColumnLeft.toFixed(2)}px`
      );
    }
  }

  /* Every panel resize must change the text column by the opposite width delta. */
  const dragFailures: string[] = [];
  const dragEntries = Object.entries(dragSamples) as [SidePanelDragSampleKey, SidePanelDragSample][];
  const adaptiveDragSamples = ADAPTIVE_DRAG_KEYS.map((key) => dragSamples[key]);
  const dragPanelWidths = dragEntries.map(([, sample]) => sample.sidePanelWidth);
  const dragSpread = {
    documentHeight:
      Math.max(...adaptiveDragSamples.map((sample) => sample.documentHeight)) -
      Math.min(...adaptiveDragSamples.map((sample) => sample.documentHeight)),
    renderedLineCount:
      Math.max(...adaptiveDragSamples.map((sample) => sample.renderedLineCount)) -
      Math.min(...adaptiveDragSamples.map((sample) => sample.renderedLineCount)),
    sidePanelWidth: Math.max(...dragPanelWidths) - Math.min(...dragPanelWidths),
    textColumnLeft:
      Math.max(...adaptiveDragSamples.map((sample) => sample.textColumnLeft)) -
      Math.min(...adaptiveDragSamples.map((sample) => sample.textColumnLeft)),
    textColumnWidth:
      Math.max(...adaptiveDragSamples.map((sample) => sample.textColumnWidth)) -
      Math.min(...adaptiveDragSamples.map((sample) => sample.textColumnWidth)),
    totalTextHeight:
      Math.max(...adaptiveDragSamples.map((sample) => sample.totalTextHeight)) -
      Math.min(...adaptiveDragSamples.map((sample) => sample.totalTextHeight))
  };

  /*
   * Non-vacuity: the inline stored width must actually have driven the panel
   * column, so each drag sample is checked against its own stored value.
   */
  const distinctDragPanelWidths = new Set(dragPanelWidths.map((width) => width.toFixed(2)));

  if (distinctDragPanelWidths.size !== dragEntries.length) {
    dragFailures.push(
      `stored panel widths did not render as distinct columns: measured ${dragPanelWidths
        .map((width) => width.toFixed(2))
        .join(", ")}`
    );
  }

  /* Check all stored widths, including the narrowest stage. */
  for (const key of ADAPTIVE_DRAG_KEYS) {
    const sample = dragSamples[key];

    if (key !== "stored-default") {
      const storedPx = Number.parseFloat(sample.storedWidth);

      if (Math.abs(sample.sidePanelWidth - storedPx) > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
        dragFailures.push(
          `${key} rendered a ${sample.sidePanelWidth.toFixed(2)}px panel column for a stored ${sample.storedWidth}`
        );
      }
    }

    if (sample.textColumnWidthVsMeasure > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
      dragFailures.push(
        `${key} text column ${sample.textColumnWidth.toFixed(2)}px does not match the adaptive width ${
          sample.measure
        } during a panel resize`
      );
    }

    if (sample.contentScrollWidth - sample.contentClientWidth > MAX_CONTENT_HORIZONTAL_OVERFLOW) {
      dragFailures.push(
        `${key} overflows horizontally during a panel resize: scrollWidth ${sample.contentScrollWidth}px vs clientWidth ${sample.contentClientWidth}px`
      );
    }
    const baseline = dragSamples["stored-default"];
    if (Math.abs(sample.textColumnWidth - baseline.textColumnWidth + sample.sidePanelWidth - baseline.sidePanelWidth) > MAX_MODE_TEXT_COLUMN_WIDTH_DELTA) {
      dragFailures.push(`${key} text column did not track the signed side-panel width change`);
    }
  }


  /* Panel translation and natural text reflow are reported separately. */
  failures.push(...dragFailures);

  return {
    absolutePosition,
    failures,
    panelWidths,
    samples,
    sidePanelDrag: {
      failures: dragFailures,
      samples: dragSamples,
      spread: dragSpread
    },
    spread,
    windowInnerWidth: window.innerWidth
  };
}

export async function runEmptyDocumentLayoutProbe(): Promise<EmptyDocumentLayoutProbeResult> {
  document.body.style.margin = "0";
  document.body.style.width = "100vw";
  document.body.style.height = "100vh";
  document.body.style.overflow = "hidden";

  installLegacyWorkspaceThemeOverride();

  const root = document.getElementById("probe-root");
  if (!root) {
    throw new Error("Missing probe root.");
  }

  const editing = await measureShellMode(root, "editing");
  const reading = await measureShellMode(root, "reading");
  const welcome = await measureWelcomeStatusBar(root);

  const deltas = {
    canvasTopFromWorkspace: editing.rects.canvas.top - editing.rects.workspace.top,
    editingTextEndFromCanvasMinusReading:
      editing.margins.textEndFromCanvasContent - reading.margins.textEndFromCanvasContent,
    editingTextStartFromCanvasMinusReading:
      editing.margins.textStartFromCanvasContent - reading.margins.textStartFromCanvasContent,
    lineTopFromWorkspace: editing.rects.line.top - editing.rects.workspace.top,
    statusBarBottomFromViewport: window.innerHeight - editing.rects.statusBar.bottom,
    welcomeStatusBarTopFromWorkspace: welcome.rects.statusBar.top - welcome.rects.workspace.top
  };
  const failures: string[] = [];

  if (deltas.canvasTopFromWorkspace > MAX_CANVAS_TOP_FROM_WORKSPACE) {
    failures.push(
      `workspace canvas starts too low: ${deltas.canvasTopFromWorkspace.toFixed(2)}px`
    );
  }

  if (deltas.lineTopFromWorkspace > MAX_LINE_TOP_FROM_WORKSPACE) {
    failures.push(
      `empty document line starts too low: ${deltas.lineTopFromWorkspace.toFixed(2)}px`
    );
  }

  /*
   * The empty-document margins are measured from the document canvas, which is
   * the one reference frame both shell modes share. Measuring them from the
   * workspace made the rail offset look like a text shift, because reading mode
   * collapses the rail column to zero and moves the workspace origin.
   */
  if (Math.abs(deltas.editingTextStartFromCanvasMinusReading) > MAX_MODE_TEXT_MARGIN_DELTA) {
    failures.push(
      `editing text start margin differs from reading by ${deltas.editingTextStartFromCanvasMinusReading.toFixed(
        2
      )}px`
    );
  }

  if (Math.abs(deltas.editingTextEndFromCanvasMinusReading) > MAX_MODE_TEXT_MARGIN_DELTA) {
    failures.push(
      `editing text end margin differs from reading by ${deltas.editingTextEndFromCanvasMinusReading.toFixed(
        2
      )}px`
    );
  }

  if (editing.rects.canvas.height < MIN_CANVAS_HEIGHT) {
    failures.push(`workspace canvas is too short: ${editing.rects.canvas.height.toFixed(2)}px`);
  }

  if (editing.styles.statusBarPosition !== "fixed") {
    failures.push(`status bar is not fixed: ${editing.styles.statusBarPosition}`);
  }

  if (welcome.styles.statusBarPosition !== "fixed") {
    failures.push(`welcome status bar is not fixed: ${welcome.styles.statusBarPosition}`);
  }

  if (
    deltas.statusBarBottomFromViewport < MIN_STATUS_BAR_BOTTOM_FROM_VIEWPORT ||
    deltas.statusBarBottomFromViewport > MAX_STATUS_BAR_BOTTOM_FROM_VIEWPORT
  ) {
    failures.push(
      `status bar is not anchored near the viewport bottom: ${deltas.statusBarBottomFromViewport.toFixed(
        2
      )}px`
    );
  }

  if (
    deltas.welcomeStatusBarTopFromWorkspace <
    welcome.rects.workspace.height * MIN_WELCOME_STATUS_BAR_TOP_RATIO
  ) {
    failures.push(
      `welcome status bar is too high in the workspace: ${deltas.welcomeStatusBarTopFromWorkspace.toFixed(
        2
      )}px`
    );
  }

  const documentMeasure = await measureDocumentMeasureMatrix(root);
  failures.push(...documentMeasure.failures);

  return {
    deltas,
    documentMeasure,
    failures,
    pass: failures.length === 0,
    rects: {
      editing: editing.rects,
      reading: reading.rects,
      welcome: welcome.rects
    },
    styles: {
      editing: editing.styles,
      reading: reading.styles,
      welcome: welcome.styles
    }
  };
}

Object.assign(window, {
  __runFishmarkEmptyDocumentLayoutProbe: runEmptyDocumentLayoutProbe
});

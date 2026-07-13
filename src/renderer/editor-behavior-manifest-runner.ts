import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

import type { EditorBehaviorCase } from "../../fixtures/editor-behavior/model";
import type {
  EditorBehaviorExecutionCase,
  EditorBehaviorExecutionCheckpoint
} from "../../fixtures/editor-behavior/execution-plan";
import type {
  EditorBehaviorActionTrace,
  EditorBehaviorCheckpointObservation,
  EditorBehaviorRunReport
} from "../../fixtures/editor-behavior/runner-protocol";
import { compareEditorBehaviorObservations } from "../../fixtures/editor-behavior/runner-protocol";
import { createExecutionPlan } from "../../fixtures/editor-behavior/execution-plan";
import { editorBehaviorKnownDefectObservations } from "../../fixtures/editor-behavior/current-observations";
import { rawEditorBehaviorCases } from "../../fixtures/editor-behavior/raw-cases";
import { formatContainerPath } from "../../fixtures/editor-behavior/model";
import { getMarkdownEditorViewMode } from "@fishmark/editor-core";
import { createCodeEditorController } from "./code-editor";
import { observeEditorBehaviorCheckpoint } from "./editor-behavior-observer";

export type EditorBehaviorRuntime = {
  readonly hardReset: (initial: EditorBehaviorExecutionCase["initial"]) => Promise<void>;
  readonly performAction: (
    action: EditorBehaviorExecutionCheckpoint["actions"][number],
    phase: EditorBehaviorActionTrace["phase"]
  ) => Promise<EditorBehaviorActionTrace>;
  readonly observe: (
    identity: Pick<
      EditorBehaviorCheckpointObservation,
      "runId" | "manifestHash" | "contractHash" | "caseId" | "checkpoint" | "commandPlan" | "trace"
    >
  ) => EditorBehaviorCheckpointObservation;
};

export async function executeBehaviorCase(
  behaviorCase: EditorBehaviorExecutionCase,
  runtime: EditorBehaviorRuntime,
  identity: {
    readonly manifestHash: string;
    readonly contractHash: string;
    readonly runId: string;
  }
): Promise<readonly EditorBehaviorCheckpointObservation[]> {
  const [primary, repeat, undo] = behaviorCase.checkpoints;
  if (!primary || !repeat || !undo) {
    throw new Error(`Execution case ${behaviorCase.id} must contain three checkpoints.`);
  }

  await runtime.hardReset(behaviorCase.initial);
  const primaryTrace = await executeActions(primary, runtime, "checkpoint");
  const primaryObservation = runtime.observe({
    ...identity,
    caseId: behaviorCase.id,
    checkpoint: "primary",
    commandPlan: primary.actions,
    trace: primaryTrace
  });

  const repeatTrace = await executeActions(repeat, runtime, "checkpoint");
  const repeatObservation = runtime.observe({
    ...identity,
    caseId: behaviorCase.id,
    checkpoint: "repeat",
    commandPlan: repeat.actions,
    trace: repeatTrace
  });

  await runtime.hardReset(behaviorCase.initial);
  const replayTrace: EditorBehaviorActionTrace[] = [];
  replayTrace.push(...await executeActions(primary, runtime, "replay"));
  if (undo.from === "repeat") {
    replayTrace.push(...await executeActions(repeat, runtime, "replay"));
  }
  const undoTrace = await executeActions(undo, runtime, "checkpoint");
  const undoObservation = runtime.observe({
    ...identity,
    caseId: behaviorCase.id,
    checkpoint: "undo",
    commandPlan: undo.actions,
    trace: [...replayTrace, ...undoTrace]
  });

  return [primaryObservation, repeatObservation, undoObservation];
}

async function executeActions(
  checkpoint: EditorBehaviorExecutionCheckpoint,
  runtime: EditorBehaviorRuntime,
  phase: EditorBehaviorActionTrace["phase"]
): Promise<EditorBehaviorActionTrace[]> {
  const trace: EditorBehaviorActionTrace[] = [];
  for (const action of checkpoint.actions) {
    trace.push(await runtime.performAction(action, phase));
  }
  return trace;
}

export function selectEditorBehaviorCases(
  search: URLSearchParams
): readonly EditorBehaviorCase[] {
  const requestedCase = search.get("case");
  const requestedCommand = search.get("command");
  const requestedPath = search.get("containerPath");
  const commandValues = new Set(rawEditorBehaviorCases.map(({ command }) => command));

  if (requestedCommand && !commandValues.has(requestedCommand as EditorBehaviorCase["command"])) {
    throw new Error(`Unknown command ${requestedCommand}.`);
  }

  let selected = rawEditorBehaviorCases.filter(
    ({ command }) => !requestedCommand || command === requestedCommand
  );
  if (requestedPath) {
    selected = selected.filter(
      ({ containerPath }) => formatContainerPath(containerPath) === requestedPath
    );
  }
  if (requestedCase) {
    if (!rawEditorBehaviorCases.some(({ id }) => id === requestedCase)) {
      throw new Error(`Unknown editor behavior case ${requestedCase}.`);
    }
    selected = selected.filter(({ id }) => id === requestedCase);
  }
  if (selected.length === 0) {
    throw new Error("Editor behavior filters selected no cases.");
  }
  return selected;
}

export function createBrowserEditorBehaviorRuntime(root: HTMLElement): {
  readonly runtime: EditorBehaviorRuntime;
  readonly viewCount: 1;
  readonly destroy: () => void;
} {
  root.innerHTML = "";
  root.className = "document-editor";
  root.style.width = "760px";
  root.style.height = "520px";
  const controller = createCodeEditorController({
    parent: root,
    initialContent: "",
    onChange: () => undefined
  });
  const editorRoot = root.querySelector<HTMLElement>(".cm-editor");
  const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
  if (!view) {
    controller.destroy();
    throw new Error("Could not resolve the manifest runner EditorView.");
  }

  const stateTrace = () => ({
    sourceHash: hashSource(view.state.doc.toString()),
    selection: {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    },
    undoDepth: undoDepth(view.state)
  });

  const runtime: EditorBehaviorRuntime = {
    async hardReset(initial) {
      controller.setViewMode(initial.viewMode);
      controller.replaceDocument(initial.source);
      controller.focus();
      controller.setSelection(initial.selection.anchor, initial.selection.head);
      await settleEditor(view);

      const actualSource = view.state.doc.toString();
      const actualSelection = view.state.selection.main;
      const actualMode = getMarkdownEditorViewMode(view.state);
      if (
        actualSource !== initial.source ||
        actualSelection.anchor !== initial.selection.anchor ||
        actualSelection.head !== initial.selection.head ||
        actualMode !== initial.viewMode ||
        undoDepth(view.state) !== 0
      ) {
        throw new Error(
          [
            "Editor behavior hard reset did not reproduce a clean initial state.",
            `source=${JSON.stringify(actualSource)} expected=${JSON.stringify(initial.source)}`,
            `selection=${actualSelection.anchor}:${actualSelection.head} expected=${initial.selection.anchor}:${initial.selection.head}`,
            `viewMode=${actualMode} expected=${initial.viewMode}`,
            `undoDepth=${undoDepth(view.state)}`
          ].join(" ")
        );
      }
    },
    async performAction(action, phase) {
      const before = stateTrace();
      let defaultPrevented = false;
      let dispatchAccepted = true;

      if (action.kind === "insert-text") {
        controller.insertText(action.text);
      } else if (action.kind === "set-selection") {
        controller.setSelection(action.target.anchor, action.target.head);
      } else {
        const event = createActionKeyboardEvent(action);
        dispatchAccepted = view.contentDOM.dispatchEvent(event);
        defaultPrevented = event.defaultPrevented;
      }

      await settleEditor(view);
      const after = stateTrace();
      const changed =
        before.sourceHash !== after.sourceHash ||
        before.selection.anchor !== after.selection.anchor ||
        before.selection.head !== after.selection.head ||
        before.undoDepth !== after.undoDepth;

      return {
        action,
        phase,
        handled: defaultPrevented || !dispatchAccepted || changed,
        defaultPrevented,
        before,
        after
      };
    },
    observe(identity) {
      return observeEditorBehaviorCheckpoint(view, identity);
    }
  };

  return {
    runtime,
    viewCount: 1,
    destroy: () => controller.destroy()
  };
}

function createActionKeyboardEvent(
  action: Extract<EditorBehaviorExecutionCheckpoint["actions"][number], { kind: "press-key" | "undo" }>
): KeyboardEvent {
  if (action.kind === "undo") {
    const isMac = /Mac|iPhone|iPad/u.test(navigator.platform);
    return new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      metaKey: isMac
    });
  }
  return new KeyboardEvent("keydown", {
    key: action.key,
    code: action.key,
    bubbles: true,
    cancelable: true,
    shiftKey: action.shift === true
  });
}

async function settleEditor(view: EditorView, timeoutMs = 2_000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  let previous = "";
  let stableFrames = 0;
  await Promise.resolve();

  while (performance.now() <= deadline) {
    await nextAnimationFrame();
    const selection = view.state.selection.main;
    const signature = [
      hashSource(view.state.doc.toString()),
      selection.anchor,
      selection.head,
      undoDepth(view.state),
      view.dom.querySelectorAll(".cm-line").length,
      view.dom.querySelectorAll(".cm-table-widget, .cm-math-preview-block, .cm-mermaid-preview").length
    ].join(":");
    stableFrames = signature === previous ? stableFrames + 1 : 0;
    previous = signature;
    if (stableFrames >= 1) {
      return;
    }
  }
  throw new Error(`Editor behavior action did not settle within ${timeoutMs}ms.`);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function runEditorBehaviorManifest(): Promise<EditorBehaviorRunReport> {
  const search = new URLSearchParams(window.location.search);
  const selectedCases = selectEditorBehaviorCases(search);
  const plan = createExecutionPlan(selectedCases);
  const runId = createRunId();
  const root = document.getElementById("probe-root");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Missing editor behavior probe root.");
  }

  const session = createBrowserEditorBehaviorRuntime(root);
  const observations: EditorBehaviorCheckpointObservation[] = [];
  const caseTimings: { caseId: string; durationMs: number }[] = [];
  const startedAtMs = Date.now();

  try {
    for (const executionCase of plan.cases) {
      const caseStartedAt = performance.now();
      observations.push(
        ...await executeBehaviorCase(executionCase, session.runtime, {
          manifestHash: plan.manifestHash,
          contractHash: plan.contractHash,
          runId
        })
      );
      caseTimings.push({
        caseId: executionCase.id,
        durationMs: Math.round((performance.now() - caseStartedAt) * 100) / 100
      });
    }

    const comparison = compareEditorBehaviorObservations(
      selectedCases,
      observations,
      editorBehaviorKnownDefectObservations.filter((defect) =>
        selectedCases.some(({ id }) => id === defect.caseId)
      )
    );
    const finishedAtMs = Date.now();
    return {
      protocolVersion: 1,
      runId,
      manifestHash: plan.manifestHash,
      contractHash: plan.contractHash,
      filters: {
        caseId: search.get("case"),
        command: search.get("command"),
        containerPath: search.get("containerPath")
      },
      environment: {
        appVersion:
          typeof __FISHMARK_APP_VERSION__ === "string"
            ? __FISHMARK_APP_VERSION__
            : "unknown",
        platform: navigator.platform,
        userAgent: navigator.userAgent
      },
      timing: {
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAtMs,
        cases: caseTimings
      },
      execution: {
        selectedCases: selectedCases.length,
        completedCases: caseTimings.length,
        observations: observations.length,
        windowCount: 1,
        viewCount: session.viewCount
      },
      observations,
      comparison,
      pass: comparison.pass && caseTimings.length === selectedCases.length
    };
  } finally {
    session.destroy();
  }
}

function createRunId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `editor-behavior-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    __runFishmarkEditorBehaviorManifest: runEditorBehaviorManifest
  });
}

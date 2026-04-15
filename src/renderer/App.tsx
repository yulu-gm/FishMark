import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { ActiveBlockState } from "../../packages/editor-core/src";
import {
  VISUAL_SMOKE_HEIGHT,
  VISUAL_SMOKE_WIDTH,
  createMemoryVisualApi,
  defaultScenarioRegistry,
  renderSmokeGradient,
  runScenario,
  type RunErrorInfo,
  type RunnerEvent,
  type ScenarioResult,
  type ScenarioStatus,
  type StepHandlerMap,
  type StepResult,
  type StepStatus,
  type TestScenario,
  type VisualApi,
  type VisualObservation
} from "../../packages/test-harness/src";
import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";
import { ScenarioCatalog } from "./scenario-catalog";
import {
  type AppState,
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  createInitialAppState,
  startOpeningMarkdownFile,
  startAutosavingDocument,
  startManualSavingDocument
} from "./document-state";

const AUTOSAVE_IDLE_MS = 1000;
const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const DEBUG_EVENT_LIMIT = 8;
const DEBUG_STEP_DELAY_MS = 40;

export default function App() {
  const runtimeMode = resolveRuntimeModeFromLocation();
  const yulora = window.yulora;

  if (!yulora) {
    return runtimeMode === "test-workbench" ? <TestWorkbenchApp hasBridge={false} /> : <BridgeUnavailableApp />;
  }

  return runtimeMode === "test-workbench" ? <TestWorkbenchApp hasBridge /> : <EditorApp yulora={yulora} />;
}

function EditorApp({ yulora }: { yulora: Window["yulora"] }) {
  const [state, setState] = useState(createInitialAppState);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const editorContentRef = useRef("");
  const activeBlockStateRef = useRef<ActiveBlockState | null>(null);
  const stateRef = useRef(state);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveReplayRef = useRef(false);
  const inFlightSaveOriginRef = useRef<"manual" | "autosave" | null>(null);

  function applyState(updater: (current: AppState) => AppState): void {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }

  function getEditorContent(): string {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }

  function resetAutosaveRuntime(): void {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }

  async function runAutosave(): Promise<void> {
    clearAutosaveTimer();

    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || !snapshot.isDirty || inFlightSaveOriginRef.current) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startAutosavingDocument(current));

    const result = await yulora.saveMarkdownFile({
      path: snapshot.currentDocument.path,
      content: getEditorContent()
    });

    const effectiveResult =
      result.status === "error"
        ? {
            ...result,
            error: {
              ...result.error,
              message: AUTOSAVE_FAILED_MESSAGE
            }
          }
        : result;

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, effectiveResult);

      return effectiveResult.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      void runAutosave();
    }
  }

  function scheduleAutosave(nextState: AppState): void {
    clearAutosaveTimer();

    if (!nextState.currentDocument || !nextState.isDirty) {
      pendingAutosaveReplayRef.current = false;
      return;
    }

    if (inFlightSaveOriginRef.current) {
      pendingAutosaveReplayRef.current = true;
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, AUTOSAVE_IDLE_MS);
  }

  async function runManualSave(
    request: () => ReturnType<typeof window.yulora.saveMarkdownFile>
  ): Promise<void> {
    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || inFlightSaveOriginRef.current) {
      return;
    }

    clearAutosaveTimer();
    inFlightSaveOriginRef.current = "manual";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startManualSavingDocument(current));

    const result = await request();

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, result);

      return result.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      scheduleAutosave(stateRef.current);
    }
  }

  const handleOpenMarkdown = useEffectEvent(async (): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFile();

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleSaveMarkdown = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFile({
        path: currentDocument.path,
        content: getEditorContent()
      })
    );
  });

  const handleSaveMarkdownAs = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFileAs({
        currentPath: currentDocument.path,
        content: getEditorContent()
      })
    );
  });

  useEffect(() => {
    return yulora.onMenuCommand((command) => {
      if (command === "open-markdown-file") {
        void handleOpenMarkdown();
        return;
      }

      if (command === "save-markdown-file") {
        void handleSaveMarkdown();
        return;
      }

      void handleSaveMarkdownAs();
    });
  }, [yulora]);

  useEffect(() => () => clearAutosaveTimer(), []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <p className="app-name">Yulora</p>
          <p className="app-subtitle">Local-first Markdown writing workspace</p>
        </div>
        <p className="app-hint">
          {state.openState === "opening"
            ? "Opening document..."
            : state.currentDocument
              ? "Use File to open, save, or save as."
              : "Use File > Open... to load a Markdown document."}
        </p>
      </header>

      {state.errorMessage ? (
        <p
          className="error-banner"
          role="alert"
        >
          {state.errorMessage}
        </p>
      ) : null}

      {state.currentDocument ? (
        <section className="workspace-shell">
          <div className="document-bar">
            <div className="document-meta">
              <h1>{state.currentDocument.name}</h1>
              <p className="document-path">{state.currentDocument.path}</p>
            </div>
            <div className="document-status-row">
              <p className={`save-status ${state.isDirty ? "is-dirty" : "is-clean"}`}>
                {state.saveState === "manual-saving"
                  ? "Saving changes..."
                  : state.saveState === "autosaving"
                    ? "Autosaving..."
                  : state.isDirty
                    ? "Unsaved changes"
                    : "All changes saved"}
              </p>
              <p className="document-platform">Bridge: {yulora.platform}</p>
            </div>
          </div>
          <CodeEditorView
            ref={editorRef}
            initialContent={state.currentDocument.content}
            loadRevision={state.editorLoadRevision}
            onActiveBlockChange={(nextActiveBlockState) => {
              activeBlockStateRef.current = nextActiveBlockState;
            }}
            onChange={(nextContent) => {
              editorContentRef.current = nextContent;
              let nextState: AppState = stateRef.current;

              applyState((current) => {
                nextState = applyEditorContentChanged(current, nextContent);
                return nextState;
              });

              scheduleAutosave(nextState);
            }}
            onBlur={() => {
              void runAutosave();
            }}
          />
        </section>
      ) : (
        <section className="empty-workspace">
          <div className="empty-inner">
            <p className="empty-kicker">Ready</p>
            <h1>Open a Markdown document from the File menu.</h1>
            <p className="empty-copy">
              Yulora keeps Markdown text as the source of truth and writes it back without
              reformatting the whole document.
            </p>
            <p className="empty-meta">Shortcut: Ctrl/Cmd+O</p>
          </div>
        </section>
      )}
    </main>
  );
}

function TestWorkbenchApp({ hasBridge }: { hasBridge: boolean }) {
  const scenarios = defaultScenarioRegistry.list();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(scenarios[0]?.id ?? null);
  const selectedScenario = selectedScenarioId
    ? defaultScenarioRegistry.get(selectedScenarioId)
    : scenarios[0] ?? null;
  const [runState, setRunState] = useState<DebugRunState>(() => createIdleDebugRunState(selectedScenario));
  const [forceVisualDrift, setForceVisualDrift] = useState(false);
  const [visualObservations, setVisualObservations] = useState<readonly VisualObservation[]>([]);
  const activeRunControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeRunControllerRef.current) {
      setRunState(createIdleDebugRunState(selectedScenario));
      setVisualObservations([]);
    }
  }, [selectedScenario]);

  async function handleRunSelectedScenario(): Promise<void> {
    if (!selectedScenario || activeRunControllerRef.current) {
      return;
    }

    const controller = new AbortController();
    activeRunControllerRef.current = controller;
    setRunState(createIdleDebugRunState(selectedScenario));
    setVisualObservations([]);

    const collectedObservations: VisualObservation[] = [];
    const visualApi = createWorkbenchVisualApi((observation) => {
      collectedObservations.push(observation);
      setVisualObservations((current) => [...current, observation]);
    });

    try {
      const result = await runScenario(selectedScenario, {
        handlers: createWorkbenchStepHandlers(selectedScenario, {
          visualApi,
          forceVisualDrift
        }),
        signal: controller.signal,
        stepTimeoutMs: 2_000,
        onEvent: (event) => {
          setRunState((current) => applyRunnerEventToDebugState(current, selectedScenario, event));
        }
      });

      setRunState((current) => applyScenarioResultToDebugState(current, selectedScenario, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunState((current) =>
        applyScenarioResultToDebugState(current, selectedScenario, {
          scenarioId: selectedScenario.id,
          status: "failed",
          startedAt: current.startedAt ?? Date.now(),
          finishedAt: Date.now(),
          durationMs: 0,
          steps: current.steps.map((step) => ({ id: step.id, status: step.status })),
          error: { message, kind: "step" }
        })
      );
    } finally {
      activeRunControllerRef.current = null;
    }
  }

  function handleInterruptRun(): void {
    activeRunControllerRef.current?.abort(new Error("Interrupted from workbench control."));
  }

  return (
    <main className="test-workbench-shell">
      <header className="test-workbench-hero">
        <div>
          <p className="test-workbench-kicker">Agent Testing</p>
          <h1>Yulora Test Workbench</h1>
          <p className="test-workbench-copy">
            Keep debug state and test process orchestration in this control window, then open
            dedicated editor windows for the concrete test flow.
          </p>
        </div>
        <button
          className="test-workbench-launch"
          disabled={!hasBridge}
          onClick={() => {
            void window.yulora.openEditorTestWindow();
          }}
          type="button"
        >
          Open Editor Test Window
        </button>
      </header>

      {!hasBridge ? (
        <p
          className="error-banner"
          role="alert"
        >
          Test workbench bridge unavailable. The window is running, but preload did not expose the
          control API.
        </p>
      ) : null}

      <section className="test-workbench-grid">
        <article className="workbench-panel workbench-panel-wide">
          <p className="workbench-panel-label">Scenario Catalog</p>
          <h2>
            {defaultScenarioRegistry.size()} registered scenario
            {defaultScenarioRegistry.size() === 1 ? "" : "s"}
          </h2>
          <p className="workbench-panel-hint">
            Sourced from <code>packages/test-harness</code>. Select a scenario to inspect its steps.
          </p>
          <ScenarioCatalog
            onSelect={setSelectedScenarioId}
            registry={defaultScenarioRegistry}
            selectedId={selectedScenario?.id ?? null}
          />
        </article>

        <article className="workbench-panel">
          <p className="workbench-panel-label">Debug Stream</p>
          <h2>{formatRunStatus(runState.status)}</h2>
          <p>
            Runtime events, abort reasons, and error summaries stay in this window so the editor
            test surface can remain focused on the scenario under test.
          </p>
          <div className="workbench-action-row">
            <button
              className="test-workbench-run"
              disabled={!selectedScenario || Boolean(activeRunControllerRef.current)}
              onClick={() => {
                void handleRunSelectedScenario();
              }}
              type="button"
            >
              Run Selected Scenario
            </button>
            <button
              className="test-workbench-secondary"
              disabled={!activeRunControllerRef.current}
              onClick={handleInterruptRun}
              type="button"
            >
              Interrupt Active Run
            </button>
            <label className="test-workbench-toggle">
              <input
                checked={forceVisualDrift}
                disabled={Boolean(activeRunControllerRef.current)}
                onChange={(event) => setForceVisualDrift(event.target.checked)}
                type="checkbox"
              />
              Force visual drift
            </label>
          </div>
          <dl className="debug-run-meta">
            <div>
              <dt>Scenario</dt>
              <dd>{selectedScenario?.id ?? "No scenario selected"}</dd>
            </div>
            <div>
              <dt>Current step</dt>
              <dd>{runState.currentStepId ?? "Waiting to start"}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>
                {runState.completedSteps} / {runState.totalSteps}
              </dd>
            </div>
          </dl>
          {runState.terminalError ? (
            <div
              className="debug-run-error"
              role="status"
            >
              <p className="debug-run-error-label">Terminal reason</p>
              <p className="debug-run-error-message">
                <strong>{runState.terminalError.kind ?? "step"}</strong>
                {" · "}
                {runState.terminalError.stepId ?? "scenario"}
                {" · "}
                {runState.terminalError.message}
              </p>
            </div>
          ) : null}
          <div className="debug-event-feed">
            <p className="debug-event-feed-label">Recent events</p>
            {runState.events.length === 0 ? (
              <p className="workbench-empty">No events yet.</p>
            ) : (
              <ol className="debug-event-list">
                {runState.events.map((event) => (
                  <li key={event.key}>
                    <p className="debug-event-title">{event.type}</p>
                    <p className="debug-event-copy">{event.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </article>

        <article className="workbench-panel workbench-panel-wide">
          <p className="workbench-panel-label">Test Process</p>
          <h2>{runState.totalSteps} step trace</h2>
          <p>
            Seeded handlers stay intentionally small in this task. The goal here is to prove the
            workbench can render progress, timing, and terminal diagnostics from the shared runner.
          </p>
          <ul className="debug-step-list">
            {runState.steps.map((step) => (
              <li
                key={step.id}
                className={`debug-step-item status-${step.status}`}
              >
                <div>
                  <p className="debug-step-title">{step.id}</p>
                  <p className="debug-step-copy">
                    {step.title}
                    {" · "}
                    {step.kind}
                  </p>
                  {step.error ? <p className="debug-step-error">{step.error.message}</p> : null}
                </div>
                <div className="debug-step-meta">
                  <span>{formatRunStatus(step.status)}</span>
                  <span>{step.durationMs !== undefined ? `${step.durationMs} ms` : "Pending"}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        {visualObservations.length > 0 ? (
          <article className="workbench-panel workbench-panel-wide visual-results-panel">
            <p className="workbench-panel-label">Visual Results</p>
            <h2>
              {visualObservations.length} visual step
              {visualObservations.length === 1 ? "" : "s"}
            </h2>
            <p>
              actual / expected / diff frames painted straight from the in-memory RGBA buffers
              produced by the visual api. A mismatch marks the step red in the Test Process panel.
            </p>
            <ul className="visual-result-list">
              {visualObservations.map((observation) => (
                <VisualResultCard
                  key={`${observation.scenarioId}-${observation.stepId}`}
                  observation={observation}
                />
              ))}
            </ul>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function VisualResultCard({ observation }: { observation: VisualObservation }) {
  return (
    <li className={`visual-result-card verdict-${observation.verdict}`}>
      <header className="visual-result-header">
        <div>
          <p className="visual-result-step">{observation.stepId}</p>
          <p className="visual-result-meta">
            {observation.width} × {observation.height}
            {" · "}
            {observation.mismatchedPixels} px ({(observation.mismatchRatio * 100).toFixed(2)}%)
          </p>
        </div>
        <span className={`visual-result-verdict verdict-${observation.verdict}`}>
          {observation.verdict}
        </span>
      </header>
      {observation.message ? (
        <p className="visual-result-message">{observation.message}</p>
      ) : null}
      <div className="visual-result-frames">
        {observation.actualRgba ? (
          <VisualFrame
            label="actual"
            rgba={observation.actualRgba}
            width={observation.width}
            height={observation.height}
          />
        ) : null}
        {observation.expectedRgba ? (
          <VisualFrame
            label="expected"
            rgba={observation.expectedRgba}
            width={observation.width}
            height={observation.height}
          />
        ) : null}
        {observation.diffRgba ? (
          <VisualFrame
            label="diff"
            rgba={observation.diffRgba}
            width={observation.width}
            height={observation.height}
          />
        ) : null}
      </div>
    </li>
  );
}

function VisualFrame({
  label,
  rgba,
  width,
  height
}: {
  label: string;
  rgba: Uint8Array;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    image.data.set(rgba);
    ctx.putImageData(image, 0, 0);
  }, [rgba, width, height]);

  return (
    <figure className="visual-frame">
      <canvas
        aria-label={`${label} frame`}
        className="visual-frame-canvas"
        ref={canvasRef}
      />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function BridgeUnavailableApp() {
  return (
    <main className="app-shell">
      <p
        className="error-banner"
        role="alert"
      >
        Yulora bridge unavailable. Reload the window or restart the dev shell.
      </p>
    </main>
  );
}

function resolveRuntimeModeFromLocation(): "editor" | "test-workbench" {
  return new URLSearchParams(window.location.search).get("mode") === "test-workbench"
    ? "test-workbench"
    : "editor";
}

type DebugRunStep = {
  readonly id: string;
  readonly title: string;
  readonly kind: TestScenario["steps"][number]["kind"];
  readonly status: StepStatus;
  readonly durationMs?: number;
  readonly error?: RunErrorInfo;
};

type DebugEventEntry = {
  readonly key: string;
  readonly type: RunnerEvent["type"];
  readonly detail: string;
};

type DebugRunState = {
  readonly scenarioId: string | null;
  readonly status: "idle" | ScenarioStatus;
  readonly currentStepId: string | null;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly steps: readonly DebugRunStep[];
  readonly events: readonly DebugEventEntry[];
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly terminalError?: RunErrorInfo & { readonly stepId?: string };
};

function createIdleDebugRunState(scenario: TestScenario | null): DebugRunState {
  return {
    scenarioId: scenario?.id ?? null,
    status: "idle",
    currentStepId: null,
    totalSteps: scenario?.steps.length ?? 0,
    completedSteps: 0,
    steps: createDebugStepsFromScenario(scenario),
    events: []
  };
}

function createDebugStepsFromScenario(scenario: TestScenario | null): readonly DebugRunStep[] {
  return (
    scenario?.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      status: "pending"
    })) ?? []
  );
}

function applyRunnerEventToDebugState(
  current: DebugRunState,
  scenario: TestScenario,
  event: RunnerEvent
): DebugRunState {
  const base =
    current.scenarioId === scenario.id ? current : createIdleDebugRunState(scenario);
  const next: DebugRunState = {
    ...base,
    events: [createDebugEventEntry(event), ...base.events].slice(0, DEBUG_EVENT_LIMIT)
  };

  if (event.type === "scenario-start") {
    return {
      ...next,
      status: "running",
      startedAt: event.at,
      finishedAt: undefined,
      durationMs: undefined,
      currentStepId: null,
      completedSteps: 0,
      steps: createDebugStepsFromScenario(scenario),
      terminalError: undefined
    };
  }

  if (event.type === "step-start") {
    return {
      ...next,
      currentStepId: event.stepId,
      steps: next.steps.map((step) =>
        step.id === event.stepId ? { ...step, status: "running", error: undefined } : step
      )
    };
  }

  if (event.type === "step-end") {
    const steps = next.steps.map((step) =>
      step.id === event.stepId
        ? {
            ...step,
            status: event.status,
            durationMs: event.durationMs,
            error: event.error
          }
        : step
    );

    return {
      ...next,
      completedSteps: countCompletedSteps(steps),
      steps
    };
  }

  return {
    ...next,
    status: event.status,
    currentStepId: event.error?.stepId ?? next.currentStepId,
    finishedAt: event.at,
    terminalError: event.error
  };
}

function applyScenarioResultToDebugState(
  current: DebugRunState,
  scenario: TestScenario,
  result: ScenarioResult
): DebugRunState {
  const steps = mergeScenarioStepsWithResult(scenario, result.steps);

  return {
    ...current,
    scenarioId: scenario.id,
    status: result.status,
    currentStepId: result.error?.stepId ?? current.currentStepId,
    totalSteps: scenario.steps.length,
    completedSteps: countCompletedSteps(steps),
    steps,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    terminalError: result.error
  };
}

function mergeScenarioStepsWithResult(
  scenario: TestScenario,
  stepResults: readonly StepResult[]
): readonly DebugRunStep[] {
  return scenario.steps.map((step) => {
    const result = stepResults.find((item) => item.id === step.id);

    return {
      id: step.id,
      title: step.title,
      kind: step.kind,
      status: result?.status ?? "pending",
      durationMs: result?.durationMs,
      error: result?.error
    };
  });
}

function countCompletedSteps(steps: readonly DebugRunStep[]): number {
  return steps.filter((step) => step.status !== "pending" && step.status !== "running").length;
}

function createDebugEventEntry(event: RunnerEvent): DebugEventEntry {
  if (event.type === "scenario-start") {
    return {
      key: `${event.type}-${event.at}`,
      type: event.type,
      detail: `${event.scenarioId} started at ${event.at}`
    };
  }

  if (event.type === "step-start") {
    return {
      key: `${event.type}-${event.stepId}-${event.at}`,
      type: event.type,
      detail: `${event.stepId} started at ${event.at}`
    };
  }

  if (event.type === "step-end") {
    return {
      key: `${event.type}-${event.stepId}-${event.at}`,
      type: event.type,
      detail: `${event.stepId} finished as ${event.status} in ${event.durationMs} ms`
    };
  }

  return {
    key: `${event.type}-${event.at}`,
    type: event.type,
    detail: `${event.status}${event.error?.stepId ? ` at ${event.error.stepId}` : ""}${
      event.error ? `: ${event.error.message}` : ""
    }`
  };
}

function createWorkbenchStepHandlers(
  scenario: TestScenario,
  deps: { readonly visualApi: VisualApi; readonly forceVisualDrift: boolean }
): StepHandlerMap {
  let capturedGradient: Uint8Array | null = null;
  return Object.fromEntries(
    scenario.steps.map((step) => [
      step.id,
      async ({ signal }) => {
        await waitForDebugDelay(DEBUG_STEP_DELAY_MS, signal);

        if (scenario.id === "open-markdown-file-basic" && step.id === "select-fixture") {
          throw new Error("Fixture picker automation is not implemented in TASK-028.");
        }

        if (scenario.id === "visual-smoke-gradient") {
          if (step.id === "render-gradient") {
            capturedGradient = renderSmokeGradient({ drift: deps.forceVisualDrift });
            return;
          }
          if (step.id === "compare-gradient") {
            if (!capturedGradient) {
              throw new Error(
                "render-gradient did not capture a gradient; cannot run compare-gradient."
              );
            }
            const observation = deps.visualApi.check({
              scenarioId: scenario.id,
              stepId: step.id,
              width: VISUAL_SMOKE_WIDTH,
              height: VISUAL_SMOKE_HEIGHT,
              actualRgba: capturedGradient
            });
            if (observation.verdict === "mismatch") {
              throw new Error(
                observation.message ?? `Visual mismatch in step ${step.id}.`
              );
            }
          }
        }
      }
    ])
  ) as StepHandlerMap;
}

/**
 * Workbench visual api: resolves the baseline by re-rendering the same
 * deterministic fixture. That keeps the flow self-contained (no filesystem
 * access from the renderer) and lets the drift toggle produce a guaranteed
 * mismatch on demand.
 */
function createWorkbenchVisualApi(
  onObservation: (observation: VisualObservation) => void
): VisualApi {
  return createMemoryVisualApi({
    resolveBaseline: ({ scenarioId }) =>
      scenarioId === "visual-smoke-gradient" ? renderSmokeGradient({ drift: false }) : null,
    onObservation
  });
}

function waitForDebugDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Run aborted before the step started."));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      reject(signal.reason ?? new Error("Run interrupted."));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function formatRunStatus(status: DebugRunState["status"] | StepStatus): string {
  if (status === "timed-out") {
    return "Timed Out";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

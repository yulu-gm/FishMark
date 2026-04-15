import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { ActiveBlockState } from "../../packages/editor-core/src";
import {
  defaultScenarioRegistry,
  type RunErrorInfo,
  type RunnerEvent,
  type ScenarioStatus,
  type StepStatus,
  type TestScenario
} from "../../packages/test-harness/src";
import type { ScenarioRunTerminal } from "../shared/test-run-session";
import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";
import { createEditorTestDriver } from "./editor-test-driver";
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
  const startupOpenPathRef = useRef(yulora.startupOpenPath);
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

  const handleOpenMarkdownFromPath = useEffectEvent(async (targetPath: string): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFileFromPath(targetPath);

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

  const handleEditorTestCommand = useEffectEvent(async (payload: {
    sessionId: string;
    commandId: string;
    command: Parameters<ReturnType<typeof createEditorTestDriver>["run"]>[0];
  }): Promise<void> => {
    const driver = createEditorTestDriver({
      getState: () => stateRef.current,
      applyState,
      resetAutosaveRuntime,
      editor: {
        getContent: getEditorContent,
        setContent: (content: string) => {
          editorRef.current?.setContent(content);
        },
        insertText: (text: string) => {
          editorRef.current?.insertText(text);
        },
        setSelection: (anchor: number, head?: number) => {
          editorRef.current?.setSelection(anchor, head);
        },
        pressEnter: () => {
          editorRef.current?.pressEnter();
        }
      },
      setEditorContentSnapshot: (content: string) => {
        editorContentRef.current = content;
      },
      openMarkdownFileFromPath: (targetPath: string) => yulora.openMarkdownFileFromPath(targetPath),
      saveMarkdownFile: (input) => yulora.saveMarkdownFile(input)
    });

    try {
      const result = await driver.run(payload.command);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result: {
          ok: false,
          message
        }
      });
    }
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

  useEffect(() => {
    return yulora.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [yulora]);

  useEffect(() => {
    const startupOpenPath = startupOpenPathRef.current;

    if (!startupOpenPath) {
      return;
    }

    startupOpenPathRef.current = null;
    void handleOpenMarkdownFromPath(startupOpenPath);
  }, []);

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
  const activeRunIdRef = useRef<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasBridge) {
      return;
    }

    const detachEvent = window.yulora.onScenarioRunEvent((payload) => {
      if (activeRunIdRef.current && payload.runId !== activeRunIdRef.current) {
        return;
      }

      const scenario = defaultScenarioRegistry.get(payload.event.scenarioId);
      if (!scenario) {
        return;
      }

      setRunState((current) => applyRunnerEventToDebugState(current, scenario, payload.event));
    });

    const detachTerminal = window.yulora.onScenarioRunTerminal((payload) => {
      if (activeRunIdRef.current && payload.runId !== activeRunIdRef.current) {
        return;
      }

      setRunState((current) => applyScenarioRunTerminalToDebugState(current, payload));
      activeRunIdRef.current = null;
      setActiveRunId(null);
    });

    return () => {
      detachEvent();
      detachTerminal();
    };
  }, [hasBridge]);

  async function handleRunSelectedScenario(): Promise<void> {
    if (!selectedScenario || !hasBridge || activeRunIdRef.current) {
      return;
    }

    setRunState(createIdleDebugRunState(selectedScenario));

    const { runId } = await window.yulora.startScenarioRun({ scenarioId: selectedScenario.id });
    activeRunIdRef.current = runId;
    setActiveRunId(runId);
  }

  function handleInterruptRun(): void {
    if (!activeRunIdRef.current) {
      return;
    }

    void window.yulora.interruptScenarioRun({ runId: activeRunIdRef.current });
  }

  function handleSelectScenario(nextScenarioId: string | null): void {
    setSelectedScenarioId(nextScenarioId);

    if (activeRunIdRef.current) {
      return;
    }

    const nextScenario = nextScenarioId
      ? defaultScenarioRegistry.get(nextScenarioId)
      : scenarios[0] ?? null;
    setRunState(createIdleDebugRunState(nextScenario));
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
            onSelect={handleSelectScenario}
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
              disabled={!selectedScenario || !hasBridge || Boolean(activeRunId)}
              onClick={() => {
                void handleRunSelectedScenario();
              }}
              type="button"
            >
              Run Selected Scenario
            </button>
            <button
              className="test-workbench-secondary"
              disabled={!activeRunId}
              onClick={handleInterruptRun}
              type="button"
            >
              Interrupt Active Run
            </button>
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
            <div>
              <dt>Run ID</dt>
              <dd>{activeRunId ?? runState.runId ?? "Waiting to start"}</dd>
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
          {runState.resultPath || runState.stepTracePath ? (
            <div className="debug-run-artifacts">
              <p className="debug-run-error-label">Artifacts</p>
              {runState.resultPath ? <p>{runState.resultPath}</p> : null}
              {runState.stepTracePath ? <p>{runState.stepTracePath}</p> : null}
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
      </section>
    </main>
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
  readonly runId?: string;
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
  readonly resultPath?: string;
  readonly stepTracePath?: string;
  readonly terminalError?: RunErrorInfo & { readonly stepId?: string };
};

function createIdleDebugRunState(scenario: TestScenario | null): DebugRunState {
  return {
    runId: undefined,
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

function applyScenarioRunTerminalToDebugState(
  current: DebugRunState,
  terminal: ScenarioRunTerminal
): DebugRunState {
  return {
    ...current,
    runId: terminal.runId,
    status: terminal.status,
    currentStepId: terminal.error?.stepId ?? current.currentStepId,
    resultPath: terminal.resultPath,
    stepTracePath: terminal.stepTracePath,
    terminalError: terminal.error
  };
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

function formatRunStatus(status: DebugRunState["status"] | StepStatus): string {
  if (status === "timed-out") {
    return "Timed Out";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

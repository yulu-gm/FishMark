import { useEffect, useRef, useState } from "react";

import "../styles/workbench.css";
import {
  applyRunnerEventToDebugState,
  applyScenarioRunTerminalToDebugState,
  createIdleDebugRunState,
  defaultScenarioRegistry,
  formatRunStatus
} from "@fishmark/test-harness";
import { ScenarioCatalog } from "../scenario-catalog";

export default function WorkbenchApp() {
  const fishmarkTest = window.fishmarkTest;
  const hasBridge = Boolean(fishmarkTest);
  const scenarios = defaultScenarioRegistry.list();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(scenarios[0]?.id ?? null);
  const selectedScenario = selectedScenarioId
    ? defaultScenarioRegistry.get(selectedScenarioId)
    : scenarios[0] ?? null;
  const [runState, setRunState] = useState(() => createIdleDebugRunState(selectedScenario));
  const activeRunIdRef = useRef<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasBridge || !fishmarkTest) {
      return;
    }

    const detachEvent = fishmarkTest.onScenarioRunEvent((payload) => {
      if (activeRunIdRef.current && payload.runId !== activeRunIdRef.current) {
        return;
      }

      const scenario = defaultScenarioRegistry.get(payload.event.scenarioId);
      if (!scenario) {
        return;
      }

      setRunState((current) => applyRunnerEventToDebugState(current, scenario, payload.event));
    });

    const detachTerminal = fishmarkTest.onScenarioRunTerminal((payload) => {
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
  }, [fishmarkTest, hasBridge]);

  async function handleRunSelectedScenario(): Promise<void> {
    if (!selectedScenario || !fishmarkTest || activeRunIdRef.current) {
      return;
    }

    setRunState(createIdleDebugRunState(selectedScenario));

    const { runId } = await fishmarkTest.startScenarioRun({ scenarioId: selectedScenario.id });
    activeRunIdRef.current = runId;
    setActiveRunId(runId);
  }

  function handleInterruptRun(): void {
    if (!activeRunIdRef.current || !fishmarkTest) {
      return;
    }

    void fishmarkTest.interruptScenarioRun({ runId: activeRunIdRef.current });
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
          <h1>FishMark Test Workbench</h1>
          <p className="test-workbench-copy">
            Keep debug state and test process orchestration in this control window, then open
            dedicated editor windows for the concrete test flow.
          </p>
        </div>
        <button
          className="test-workbench-launch"
          disabled={!hasBridge}
          onClick={() => {
            void fishmarkTest?.openEditorTestWindow();
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

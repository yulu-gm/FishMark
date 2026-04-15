# TASK-030 CLI-Driven Real Editor Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the CLI the single execution entry for real editor scenarios, with Electron-backed step execution and a workbench that observes CLI run sessions instead of running scenarios locally.

**Architecture:** Keep `packages/test-harness` runner semantics intact, but move orchestration into a main-owned run session that calls `runCli()` with Electron-backed handlers. Use preload as a narrow bridge in both directions: workbench-to-main for run control and main-to-editor for allowlisted editor test commands. The workbench keeps its debug UI but changes data source from local `runScenario()` callbacks to forwarded CLI events.

**Tech Stack:** Electron, React, TypeScript, Vitest, existing `packages/test-harness` runner / CLI infrastructure

---

### Task 1: Define Shared Run-Session and Editor-Test Contracts

**Files:**
- Create: `src/shared/test-run-session.ts`
- Create: `src/shared/editor-test-command.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.d.ts`
- Test: `src/main/runtime-windows.test.ts`

**Step 1: Write the failing test**

Add a contract-focused test in `src/main/runtime-windows.test.ts` that expects the workbench bridge to expose run control and that an editor session can be addressed by a structured command envelope.

```ts
expect(typeof api.startScenarioRun).toBe("function");
expect(typeof api.onScenarioRunEvent).toBe("function");
expect(sampleEditorCommand.type).toBe("wait-for-editor-ready");
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/runtime-windows.test.ts`  
Expected: FAIL because the new shared contract types and bridge members do not exist yet.

**Step 3: Write minimal implementation**

Create two shared modules:

- `src/shared/test-run-session.ts`
  - `ScenarioRunId`
  - `RunnerEventEnvelope`
  - `ScenarioRunTerminal`
- `src/shared/editor-test-command.ts`
  - `EditorTestCommand`
  - `EditorTestCommandResult`
  - command envelope / result envelope types

Extend preload and renderer typings with:

```ts
startScenarioRun(input: { scenarioId: string }): Promise<{ runId: string }>;
interruptScenarioRun(input: { runId: string }): Promise<void>;
onScenarioRunEvent(listener: (payload: RunnerEventEnvelope) => void): () => void;
onScenarioRunTerminal(listener: (payload: ScenarioRunTerminal) => void): () => void;
```

Plus editor-side command callbacks:

```ts
onEditorTestCommand(listener: (payload: EditorTestCommandEnvelope) => void): () => void;
completeEditorTestCommand(result: EditorTestCommandResultEnvelope): void;
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/runtime-windows.test.ts`  
Expected: PASS for the new shared contract expectations.

**Step 5: Commit**

```bash
git add src/shared/test-run-session.ts src/shared/editor-test-command.ts src/preload/preload.ts src/renderer/types.d.ts src/main/runtime-windows.test.ts
git commit -m "feat: add shared task-030 run-session contracts"
```

### Task 2: Add Main-Process Run Sessions and IPC Routing

**Files:**
- Create: `src/main/test-run-sessions.ts`
- Create: `src/main/test-run-sessions.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/runtime-windows.ts`
- Test: `src/main/test-run-sessions.test.ts`

**Step 1: Write the failing test**

Add tests that describe:
- starting a scenario run returns a `runId`
- run events are forwarded to subscribers
- interrupt requests reach the active run session
- editor window reuse is preserved

```ts
const runId = sessions.startRun({ scenarioId: "open-markdown-file-basic" });
expect(runId).toMatch(/^run-/);
expect(events.at(-1)?.event.type).toBe("scenario-start");
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/test-run-sessions.test.ts`  
Expected: FAIL because there is no run-session manager.

**Step 3: Write minimal implementation**

Create `src/main/test-run-sessions.ts` with:
- in-memory `CliRunSession` map
- `startScenarioRun`
- `interruptScenarioRun`
- subscriber registration for event and terminal payloads
- a small editor-session lookup / ensure hook that delegates to `runtime-windows`

Update `src/main/main.ts` to register narrow IPC handlers such as:

```ts
ipcMain.handle("yulora:start-scenario-run", ...)
ipcMain.handle("yulora:interrupt-scenario-run", ...)
ipcMain.on("yulora:scenario-run-subscribe", ...)
```

Do not add generic IPC. Keep channels dedicated and allowlisted.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/test-run-sessions.test.ts src/main/runtime-windows.test.ts`  
Expected: PASS, with run-session lifecycle and editor-window reuse covered.

**Step 5: Commit**

```bash
git add src/main/test-run-sessions.ts src/main/test-run-sessions.test.ts src/main/main.ts src/main/runtime-windows.ts src/main/runtime-windows.test.ts
git commit -m "feat: add main-process task-030 run session manager"
```

### Task 3: Make `runCli()` Support Electron-Backed Execution

**Files:**
- Create: `packages/test-harness/src/handlers/electron.ts`
- Create: `packages/test-harness/src/handlers/electron.test.ts`
- Modify: `packages/test-harness/src/cli/run.ts`
- Modify: `packages/test-harness/src/cli/run.test.ts`
- Modify: `packages/test-harness/src/cli/artifacts.ts`
- Modify: `packages/test-harness/src/cli/artifacts.test.ts`

**Step 1: Write the failing test**

Add tests proving that:
- `runCli()` can accept an Electron-backed handler builder
- CLI event emission stays ordered
- terminal results still produce the correct exit code
- artifact metadata can include run/runtime metadata without visual fields

```ts
expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
expect(captured.trace?.events[0]?.type).toBe("scenario-start");
expect(captured.result?.meta.cliVersion).toBeDefined();
expect(captured.result?.visualResults).toBeUndefined();
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- packages/test-harness/src/cli/run.test.ts packages/test-harness/src/cli/artifacts.test.ts`  
Expected: FAIL because the CLI runtime does not yet model Electron-backed execution or stripped visual fields.

**Step 3: Write minimal implementation**

Create `packages/test-harness/src/handlers/electron.ts` with a factory like:

```ts
createElectronStepHandlers({
  scenario,
  runEditorCommand
})
```

Update `runCli()` to accept platform hooks:

```ts
buildHandlers?: (args: CliHandlerBuildArgs) => StepHandlerMap;
onEvent?: (event: RunnerEvent) => void;
runtime?: "headless" | "electron";
```

Update `artifacts.ts` to:
- remove or deprecate `visualResults`
- optionally store `runId` / `runtime`
- keep `result.json` and `step-trace.json` stable

**Step 4: Run test to verify it passes**

Run: `npm run test -- packages/test-harness/src/cli/run.test.ts packages/test-harness/src/cli/artifacts.test.ts packages/test-harness/src/handlers/electron.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/test-harness/src/handlers/electron.ts packages/test-harness/src/handlers/electron.test.ts packages/test-harness/src/cli/run.ts packages/test-harness/src/cli/run.test.ts packages/test-harness/src/cli/artifacts.ts packages/test-harness/src/cli/artifacts.test.ts
git commit -m "feat: support task-030 electron-backed cli execution"
```

### Task 4: Implement Editor Test Driver in the Editor Renderer

**Files:**
- Create: `src/renderer/editor-test-driver.ts`
- Create: `src/renderer/editor-test-driver.test.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/document-state.ts`
- Test: `src/renderer/editor-test-driver.test.ts`

**Step 1: Write the failing test**

Add tests that describe the first allowlisted command set:
- `wait-for-editor-ready`
- `open-fixture-file`
- `assert-document-path`
- `assert-editor-content`

```ts
await expect(driver.run({ type: "wait-for-editor-ready" })).resolves.toEqual({ ok: true });
await expect(driver.run({ type: "assert-editor-content", expectedContent: "# title" })).resolves.toEqual({ ok: true });
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/editor-test-driver.test.ts`  
Expected: FAIL because the editor test driver does not exist yet.

**Step 3: Write minimal implementation**

Create `src/renderer/editor-test-driver.ts` as a small adapter around existing editor/document state:
- wait for editor readiness
- reuse existing open/save capabilities where possible
- inspect current document path/content/dirty state
- return `EditorTestCommandResult`

Wire it into `App.tsx` only in editor runtime mode so the editor window can receive test commands and reply with structured results.

Do not expose extra Node APIs. Keep command handling inside the renderer and only for the allowlisted commands.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/editor-test-driver.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/editor-test-driver.ts src/renderer/editor-test-driver.test.ts src/renderer/App.tsx src/renderer/document-state.ts
git commit -m "feat: add task-030 editor test driver"
```

### Task 5: Switch the Workbench to Observe CLI Run Sessions

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/test-workbench.test.tsx`
- Modify: `src/renderer/types.d.ts`
- Modify: `src/preload/preload.ts`
- Test: `src/renderer/test-workbench.test.tsx`

**Step 1: Write the failing test**

Add tests proving that:
- `Run Selected Scenario` uses `startScenarioRun`
- the workbench updates from subscribed events instead of local `runScenario()` callbacks
- `Interrupt Active Run` uses `interruptScenarioRun`
- artifact paths and terminal errors render from terminal payloads

```ts
expect(startScenarioRun).toHaveBeenCalledWith({ scenarioId: "open-markdown-file-basic" });
expect(interruptScenarioRun).toHaveBeenCalledWith({ runId: "run-1" });
expect(container.textContent).toContain("result.json");
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/test-workbench.test.tsx`  
Expected: FAIL because the workbench still uses local `runScenario()`.

**Step 3: Write minimal implementation**

Refactor the workbench flow in `src/renderer/App.tsx` to:
- call `startScenarioRun`
- subscribe to `onScenarioRunEvent`
- subscribe to `onScenarioRunTerminal`
- update `DebugRunState` from forwarded payloads
- use `interruptScenarioRun` for active runs

Keep the existing debug panels and state folding logic where possible. Change only the source of the data.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/test-workbench.test.tsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/test-workbench.test.tsx src/renderer/types.d.ts src/preload/preload.ts
git commit -m "feat: make workbench observe cli task-030 runs"
```

### Task 6: Update Scenario Metadata and Docs

**Files:**
- Modify: `MVP_BACKLOG.md`
- Modify: `docs/progress.md`
- Modify: `packages/test-harness/README.md`
- Modify: `reports/task-summaries/TASK-030.md`
- Modify: `docs/test-cases.md` (only if acceptance steps changed)

**Step 1: Write the failing test**

For docs, use a manual diff checklist rather than an automated failing test:
- `TASK-030` wording must no longer mention screenshots or diffs
- CLI must be described as the execution owner
- workbench must be described as an observer/debug surface

**Step 2: Run manual verification to prove mismatch**

Run: `rg -n "visual-test|baseline|diff|synthetic gradient|Run Selected Scenario" MVP_BACKLOG.md docs packages/test-harness/README.md reports/task-summaries/TASK-030.md`  
Expected: existing wording still reflects the old task framing.

**Step 3: Write minimal documentation updates**

Update docs to match the implemented architecture and remove stale visual-task language.

**Step 4: Run verification to confirm docs are aligned**

Run: `rg -n "visual-test|baseline|diff|synthetic gradient" MVP_BACKLOG.md docs packages/test-harness/README.md reports/task-summaries/TASK-030.md`  
Expected: no stale task-defining references remain for `TASK-030`.

**Step 5: Commit**

```bash
git add MVP_BACKLOG.md docs/progress.md packages/test-harness/README.md reports/task-summaries/TASK-030.md docs/test-cases.md
git commit -m "docs: update task-030 cli-driven execution docs"
```

### Final Verification

Run:

```bash
npm run test -- packages/test-harness/src/cli/run.test.ts packages/test-harness/src/cli/artifacts.test.ts packages/test-harness/src/handlers/electron.test.ts src/main/test-run-sessions.test.ts src/main/runtime-windows.test.ts src/renderer/editor-test-driver.test.ts src/renderer/test-workbench.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected:
- All focused tests pass
- Lint passes
- Typecheck passes
- Build passes

### Notes Before Execution

- The current workspace is dirty, including withdrawn `TASK-030` changes and new planning docs. Do not revert unrelated diffs.
- Prefer implementing in a dedicated worktree only after deciding how to carry the current uncommitted `TASK-030` docs and rollback state forward.
- Apply `@test-driven-development` before each code task and verify the first test fails for the expected reason before writing implementation code.

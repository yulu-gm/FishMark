// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestScenario } from "@yulora/test-harness";
import type {
  RunnerEventEnvelope,
  ScenarioRunTerminal,
  ScenarioRunnerEvent
} from "../shared/test-run-session";
import App from "./App";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const { registry } = vi.hoisted(() => {
  const scenarios: TestScenario[] = [
    {
      id: "app-shell-startup",
      title: "App shell starts with editor window visible",
      summary: "Starts the shell and waits for the empty workspace.",
      surface: "editor",
      tags: ["smoke", "editor"],
      steps: [
        { id: "launch-dev-shell", title: "Launch shell", kind: "setup" },
        { id: "wait-for-empty-workspace", title: "Wait for empty workspace", kind: "assertion" },
        { id: "close-shell", title: "Close shell", kind: "teardown" }
      ]
    },
    {
      id: "open-markdown-file-basic",
      title: "Open a Markdown file via File > Open",
      summary: "Opens a fixture and verifies editor content.",
      surface: "editor",
      tags: ["smoke", "editor", "file-io"],
      steps: [
        { id: "launch-dev-shell", title: "Launch shell", kind: "setup" },
        { id: "invoke-open-command", title: "Invoke File > Open", kind: "action" },
        { id: "select-fixture", title: "Select fixture", kind: "action" }
      ]
    }
  ];

  const registry = {
    register: vi.fn(),
    registerAll: vi.fn(),
    list: vi.fn(() => scenarios),
    get: vi.fn((id: string) => scenarios.find((scenario) => scenario.id === id) ?? null),
    has: vi.fn((id: string) => scenarios.some((scenario) => scenario.id === id)),
    getTags: vi.fn(() => ["editor", "file-io", "smoke"]),
    getSurfaces: vi.fn(() => ["editor"]),
    size: vi.fn(() => scenarios.length)
  };

  return {
    registry
  };
});

vi.mock("@yulora/test-harness", async () => {
  const actual =
    await vi.importActual<typeof import("@yulora/test-harness")>(
      "@yulora/test-harness"
    );

  return {
    ...actual,
    defaultScenarioRegistry: registry
  };
});

describe("Test workbench shell", () => {
  let container: HTMLDivElement;
  let root: Root;
  let openEditorTestWindow: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let startScenarioRun: ReturnType<
    typeof vi.fn<(input: { scenarioId: string }) => Promise<{ runId: string }>>
  >;
  let interruptScenarioRun: ReturnType<typeof vi.fn<(input: { runId: string }) => Promise<void>>>;
  let scenarioRunEventListener: ((payload: RunnerEventEnvelope) => void) | null;
  let scenarioRunTerminalListener: ((payload: ScenarioRunTerminal) => void) | null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/?mode=test-workbench");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    openEditorTestWindow = vi.fn<() => Promise<void>>().mockResolvedValue();
    startScenarioRun = vi
      .fn<(input: { scenarioId: string }) => Promise<{ runId: string }>>()
      .mockResolvedValue({ runId: "run-1" });
    interruptScenarioRun = vi.fn<(input: { runId: string }) => Promise<void>>().mockResolvedValue();
    scenarioRunEventListener = null;
    scenarioRunTerminalListener = null;

    window.yulora = {
      platform: "win32",
      runtimeMode: "test-workbench",
      startupOpenPath: null,
      openMarkdownFile: vi.fn(),
      openMarkdownFileFromPath: vi.fn(),
      handleDroppedMarkdownFile: vi.fn().mockResolvedValue({
        disposition: "open-in-place"
      }),
      getPathForDroppedFile: vi.fn().mockReturnValue(""),
      saveMarkdownFile: vi.fn(),
      saveMarkdownFileAs: vi.fn(),
      importClipboardImage: vi.fn(),
      openEditorTestWindow,
      startScenarioRun,
      interruptScenarioRun,
      onScenarioRunEvent: vi.fn((listener) => {
        scenarioRunEventListener = listener;
        return () => {
          scenarioRunEventListener = null;
        };
      }),
      onScenarioRunTerminal: vi.fn((listener) => {
        scenarioRunTerminalListener = listener;
        return () => {
          scenarioRunTerminalListener = null;
        };
      }),
      onEditorTestCommand: vi.fn(() => () => {}),
      completeEditorTestCommand: vi.fn().mockResolvedValue(undefined),
      onMenuCommand: vi.fn(() => () => {}),
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
      listFontFamilies: vi.fn().mockResolvedValue([]),
      listThemes: vi.fn().mockResolvedValue([]),
      refreshThemes: vi.fn().mockResolvedValue([]),
      listThemePackages: vi.fn().mockResolvedValue([]),
      refreshThemePackages: vi.fn().mockResolvedValue([]),
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      onPreferencesChanged: vi.fn(() => () => {}),
      onAppUpdateState: vi.fn(() => () => {}),
      onAppNotification: vi.fn(() => () => {})
    } as Window["yulora"];
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
    window.history.replaceState({}, "", "/");
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderApp(): Promise<void> {
    await act(async () => {
      root.render(createElement(App));
    });

    await vi.dynamicImportSettled();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("renders the test workbench panels instead of the editor shell", async () => {
    await renderApp();

    expect(container.textContent).toContain("Yulora Test Workbench");
    expect(container.textContent).toContain("Scenario Catalog");
    expect(container.textContent).toContain("Debug Stream");
    expect(container.textContent).toContain("Test Process");
    expect(container.textContent).toContain("registered scenario");
    expect(container.textContent).toContain("app-shell-startup");
    expect(container.textContent).toContain("open-markdown-file-basic");
    expect(container.textContent).toContain("Idle");
    expect(container.textContent).toContain("No events yet");
  });

  it("shows scenario detail for the selected scenario", async () => {
    await renderApp();

    const items = container.querySelectorAll<HTMLButtonElement>(".scenario-list-item");
    expect(items.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      items[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const detail = container.querySelector(".scenario-detail");
    expect(detail?.textContent).toContain("Open a Markdown file via File > Open");
    expect(detail?.textContent).toContain("Invoke File > Open");
    expect(detail?.textContent).toContain("open-markdown-file-basic");
  });

  it("starts the selected scenario through the run bridge and renders live events", async () => {
    await renderApp();

    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Run Selected Scenario")
    );

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(startScenarioRun).toHaveBeenCalledWith({ scenarioId: "app-shell-startup" });

    await act(async () => {
      scenarioRunEventListener?.({
        runId: "run-1",
        event: { type: "scenario-start", scenarioId: "app-shell-startup", at: 100 } as ScenarioRunnerEvent
      });
      scenarioRunEventListener?.({
        runId: "run-1",
        event: {
          type: "step-start",
          scenarioId: "app-shell-startup",
          stepId: "launch-dev-shell",
          at: 110
        } as ScenarioRunnerEvent
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Running");
    expect(container.textContent).toContain("launch-dev-shell");
    expect(container.textContent).toContain("scenario-start");
    expect(container.textContent).toContain("step-start");
  });

  it("renders terminal failure details from the subscribed run stream", async () => {
    await renderApp();

    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Run Selected Scenario")
    );

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      scenarioRunEventListener?.({
        runId: "run-1",
        event: { type: "scenario-start", scenarioId: "app-shell-startup", at: 100 } as ScenarioRunnerEvent
      });
      scenarioRunEventListener?.({
        runId: "run-1",
        event: {
          type: "step-end",
          scenarioId: "app-shell-startup",
          stepId: "launch-dev-shell",
          status: "failed",
          at: 125,
          durationMs: 15,
          error: { message: "boom", kind: "step" }
        } as ScenarioRunnerEvent
      });
      scenarioRunEventListener?.({
        runId: "run-1",
        event: {
          type: "scenario-end",
          scenarioId: "app-shell-startup",
          status: "failed",
          at: 125,
          error: { message: "boom", kind: "step", stepId: "launch-dev-shell" }
        } as ScenarioRunnerEvent
      });
      scenarioRunTerminalListener?.({
        runId: "run-1",
        exitCode: 1,
        status: "failed",
        resultPath: "out/result.json",
        stepTracePath: "out/step-trace.json",
        error: { message: "boom", kind: "step", stepId: "launch-dev-shell" }
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Failed");
    expect(container.textContent).toContain("boom");
    expect(container.textContent).toContain("launch-dev-shell");
    expect(container.textContent).toContain("out/result.json");
    expect(container.textContent).toContain("step · launch-dev-shell · boom");
    expect(container.textContent).toContain("Launch shell · setup");
  });

  it("interrupts the active run through the run bridge", async () => {
    await renderApp();

    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Run Selected Scenario")
    );

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const interruptButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Interrupt Active Run")
    );

    await act(async () => {
      interruptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(interruptScenarioRun).toHaveBeenCalledWith({ runId: "run-1" });
  });

  it("requests a dedicated editor window when the launch button is clicked", async () => {
    await renderApp();

    const launchButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Open Editor Test Window")
    );

    await act(async () => {
      launchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(openEditorTestWindow).toHaveBeenCalledTimes(1);
  });

  it("shows a diagnostic banner instead of crashing when the bridge is unavailable", async () => {
    // @ts-expect-error test intentionally removes the preload bridge
    delete window.yulora;

    await renderApp();

    expect(container.textContent).toContain("Yulora Test Workbench");
    expect(container.textContent).toContain("bridge unavailable");
  });
});

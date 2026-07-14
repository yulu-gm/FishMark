// @vitest-environment jsdom

import { undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createExecutionPlan } from "../../fixtures/editor-behavior/execution-plan";
import { createEditorBehaviorFormalRun } from "../../fixtures/editor-behavior/formal-run-port";
import { editorBehaviorCases } from "../../fixtures/editor-behavior/manifest";
import type { EditorBehaviorCheckpointObservation } from "../../fixtures/editor-behavior/runner-protocol";
import {
  executeBehaviorCase,
  createBrowserEditorBehaviorRuntime,
  type EditorBehaviorRuntime
} from "./editor-behavior-manifest-runner";

let restoreRangeClientRects: (() => void) | null = null;

beforeAll(() => {
  if (typeof Range.prototype.getClientRects === "function") {
    return;
  }
  const emptyRectList = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterator() {}
  } as unknown as DOMRectList;
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => emptyRectList
  });
  restoreRangeClientRects = () => {
    delete (Range.prototype as Partial<Range>).getClientRects;
  };
});

afterAll(() => restoreRangeClientRects?.());

function createRuntime(): {
  readonly events: string[];
  readonly runtime: EditorBehaviorRuntime;
} {
  const events: string[] = [];
  const runtime: EditorBehaviorRuntime = {
    hardReset: vi.fn(async (initial) => {
      events.push(`reset:${initial.source}`);
    }),
    performAction: vi.fn(async (action, phase) => {
      events.push(`${phase}:${action.kind}`);
      return {
        action,
        phase,
        handled: true,
        defaultPrevented: action.kind === "press-key" || action.kind === "undo",
        before: {
          sourceHash: "before",
          selection: { anchor: 0, head: 0 },
          undoDepth: 0
        },
        after: {
          sourceHash: "after",
          selection: { anchor: 0, head: 0 },
          undoDepth: 1
        }
      };
    }),
    observe: vi.fn((identity) => ({
      ...identity,
      source: "actual",
      selection: { anchor: 0, head: 0 },
      semanticPath: ["Document", "Paragraph"],
      rawSemanticPath: ["paragraph"],
      visibleLineRoles: ["content"],
      physicalGeometry: [
        {
          line: 1,
          sourceText: "actual",
          geometry: {
            semanticDepth: 0,
            contentColumn: 0,
            markerColumn: null,
            visibility: "visible"
          }
        }
      ],
      lineDomMappings: [],
      viewMode: "wysiwym"
    } satisfies EditorBehaviorCheckpointObservation))
  };
  return { events, runtime };
}

describe("executeBehaviorCase", () => {
  it("continues repeat from primary actual state and resets only for undo replay", async () => {
    const behaviorCase = editorBehaviorCases[0]!;
    const baseExecutionCase = createExecutionPlan([behaviorCase]).cases[0]!;
    const executionCase = {
      ...baseExecutionCase,
      checkpoints: [
        baseExecutionCase.checkpoints[0]!,
        baseExecutionCase.checkpoints[1]!,
        { ...baseExecutionCase.checkpoints[2]!, from: "repeat" as const }
      ]
    };
    const { runtime, events } = createRuntime();

    const observations = await executeBehaviorCase(executionCase, runtime, {
      manifestHash: "fnv1a32-test",
      contractHash: "fnv1a32-contract",
      runId: "run-1"
    });

    expect(observations.map(({ checkpoint }) => checkpoint)).toEqual([
      "primary",
      "repeat",
      "undo"
    ]);
    expect(events.filter((entry) => entry.startsWith("reset:"))).toHaveLength(2);

    const expectedCheckpointActions = [
      ...executionCase.checkpoints[0]!.actions.map((action) => `checkpoint:${action.kind}`),
      ...executionCase.checkpoints[1]!.actions.map((action) => `checkpoint:${action.kind}`)
    ];
    expect(events.slice(1, 1 + expectedCheckpointActions.length)).toEqual(
      expectedCheckpointActions
    );
    expect(events).toEqual([
      `reset:${executionCase.initial.source}`,
      ...expectedCheckpointActions,
      `reset:${executionCase.initial.source}`,
      ...executionCase.checkpoints[0]!.actions.map((action) => `replay:${action.kind}`),
      ...executionCase.checkpoints[1]!.actions.map((action) => `replay:${action.kind}`),
      ...executionCase.checkpoints[2]!.actions.map((action) => `checkpoint:${action.kind}`)
    ]);
  });

  it("records only declared checkpoint actions as the comparable command plan", async () => {
    const behaviorCase = editorBehaviorCases[0]!;
    const executionCase = createExecutionPlan([behaviorCase]).cases[0]!;
    const { runtime } = createRuntime();

    const observations = await executeBehaviorCase(executionCase, runtime, {
      manifestHash: "fnv1a32-test",
      contractHash: "fnv1a32-contract",
      runId: "run-1"
    });

    expect(observations.map(({ commandPlan }) => commandPlan)).toEqual(
      executionCase.checkpoints.map(({ actions }) => actions)
    );
    expect(observations[2]?.trace.some(({ phase }) => phase === "replay")).toBe(true);
  });
});

describe("createEditorBehaviorFormalRun filters", () => {
  it("applies exact case, command, and container-path filters", () => {
    const selected = createEditorBehaviorFormalRun(
      new URLSearchParams({
        command: "Tab",
        containerPath: "Document > List > ListItem > List > ListItem > Paragraph"
      })
    ).executionPlan.cases;
    expect(selected.length).toBeGreaterThan(0);

    const exact = createEditorBehaviorFormalRun(
      new URLSearchParams({ case: selected[0]!.id })
    ).executionPlan.cases;
    expect(exact.map(({ id }) => id)).toEqual([selected[0]!.id]);
  });

  it("rejects unknown filters instead of running a partial default", () => {
    expect(() =>
      createEditorBehaviorFormalRun(new URLSearchParams({ command: "Delete" }))
    ).toThrow(/unknown command/i);
    expect(() =>
      createEditorBehaviorFormalRun(new URLSearchParams({ case: "missing-case" }))
    ).toThrow(/unknown editor behavior case/i);
  });
});

describe("createBrowserEditorBehaviorRuntime", () => {
  it("reuses one EditorView while hard reset restores selection, view mode, and empty history", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const session = createBrowserEditorBehaviorRuntime(root);

    await session.runtime.hardReset({
      source: "alpha",
      selection: { anchor: 3, head: 3 },
      viewMode: "source"
    });
    const firstView = EditorView.findFromDOM(root.querySelector(".cm-editor")!);
    expect(firstView?.state.doc.toString()).toBe("alpha");
    expect(firstView?.state.selection.main.anchor).toBe(3);
    expect(undoDepth(firstView!.state)).toBe(0);

    await session.runtime.performAction(
      { kind: "insert-text", text: "x" },
      "checkpoint"
    );
    expect(undoDepth(firstView!.state)).toBeGreaterThan(0);

    await session.runtime.hardReset({
      source: "beta",
      selection: { anchor: 1, head: 1 },
      viewMode: "wysiwym"
    });
    const secondView = EditorView.findFromDOM(root.querySelector(".cm-editor")!);
    expect(secondView).toBe(firstView);
    expect(secondView?.state.doc.toString()).toBe("beta");
    expect(secondView?.state.selection.main.anchor).toBe(1);
    expect(undoDepth(secondView!.state)).toBe(0);
    expect(session.viewCount).toBe(1);

    session.destroy();
  });

  it("dispatches key and undo actions as bubbling cancelable KeyboardEvents", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const session = createBrowserEditorBehaviorRuntime(root);
    await session.runtime.hardReset({
      source: "alpha",
      selection: { anchor: 5, head: 5 },
      viewMode: "wysiwym"
    });
    await session.runtime.performAction(
      { kind: "insert-text", text: "x" },
      "checkpoint"
    );
    const events: KeyboardEvent[] = [];
    const content = root.querySelector<HTMLElement>(".cm-content")!;
    content.addEventListener("keydown", (event) => events.push(event));

    const enter = await session.runtime.performAction(
      { kind: "press-key", key: "Enter" },
      "checkpoint"
    );
    await session.runtime.performAction({ kind: "undo" }, "checkpoint");

    expect(enter.handled).toBe(true);
    expect(events.map(({ key }) => key)).toEqual(["Enter", "z"]);
    expect(events.every(({ bubbles, cancelable }) => bubbles && cancelable)).toBe(true);
    expect(events[1]?.ctrlKey || events[1]?.metaKey).toBe(true);

    session.destroy();
  });
});

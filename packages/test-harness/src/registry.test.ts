import { describe, expect, it } from "vitest";

import { createScenarioRegistry, defaultScenarioRegistry, seedScenarios } from "./index";
import type { TestScenario } from "./scenario";

function makeScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "sample",
    title: "Sample",
    summary: "sample scenario",
    surface: "editor",
    tags: ["smoke"],
    execution: { kind: "headless" },
    steps: [{ id: "only", title: "only", kind: "action" }],
    ...overrides
  };
}

describe("createScenarioRegistry", () => {
  it("registers scenarios and lists them in insertion order", () => {
    const registry = createScenarioRegistry();
    registry.register(makeScenario({ id: "one", title: "One" }));
    registry.register(makeScenario({ id: "two", title: "Two" }));

    expect(registry.list().map((scenario) => scenario.id)).toEqual(["one", "two"]);
    expect(registry.size()).toBe(2);
  });

  it("rejects duplicate ids", () => {
    const registry = createScenarioRegistry([makeScenario({ id: "dup" })]);
    expect(() => registry.register(makeScenario({ id: "dup" }))).toThrow(/already registered/);
  });

  it("rejects invalid ids and empty step lists", () => {
    const registry = createScenarioRegistry();
    expect(() => registry.register(makeScenario({ id: "Bad Id" }))).toThrow(/kebab-case/);
    expect(() => registry.register(makeScenario({ id: "empty", steps: [] }))).toThrow(
      /at least one step/
    );
  });

  it("rejects duplicate step ids within a scenario", () => {
    const registry = createScenarioRegistry();
    expect(() =>
      registry.register(
        makeScenario({
          id: "dup-steps",
          steps: [
            { id: "a", title: "a", kind: "action" },
            { id: "a", title: "a2", kind: "assertion" }
          ]
        })
      )
    ).toThrow(/Duplicate step id/);
  });

  it("filters by tag, surface, and case-insensitive search", () => {
    const registry = createScenarioRegistry([
      makeScenario({ id: "ime-heading", title: "IME heading", tags: ["ime", "editor"] }),
      makeScenario({ id: "visual-startup", title: "Visual startup", surface: "workbench", tags: ["visual"] }),
      makeScenario({ id: "file-save", title: "Save file", tags: ["file-io"] })
    ]);

    expect(registry.list({ tag: "ime" }).map((scenario) => scenario.id)).toEqual(["ime-heading"]);
    expect(registry.list({ surface: "workbench" }).map((scenario) => scenario.id)).toEqual([
      "visual-startup"
    ]);
    expect(registry.list({ search: "SAVE" }).map((scenario) => scenario.id)).toEqual(["file-save"]);
    expect(registry.list({ tag: "editor", search: "heading" }).map((scenario) => scenario.id)).toEqual([
      "ime-heading"
    ]);
  });

  it("returns stable get / has results and aggregated tag / surface lists", () => {
    const registry = createScenarioRegistry([
      makeScenario({ id: "one", tags: ["smoke", "editor"] }),
      makeScenario({ id: "two", surface: "workbench", tags: ["visual"] })
    ]);

    expect(registry.get("one")?.id).toBe("one");
    expect(registry.get("missing")).toBeNull();
    expect(registry.has("two")).toBe(true);
    expect(registry.getTags()).toEqual(["editor", "smoke", "visual"]);
    expect(registry.getSurfaces()).toEqual(["editor", "workbench"]);
  });
});

describe("defaultScenarioRegistry", () => {
  it("is seeded with the first-party scenarios in declared order", () => {
    const ids = defaultScenarioRegistry.list().map((scenario) => scenario.id);
    expect(ids).toEqual(seedScenarios.map((scenario) => scenario.id));
    expect(ids).toContain("app-shell-startup");
    expect(ids).toContain("open-markdown-file-basic");
    expect(ids).toContain("list-enter-behavior-basic");
  });

  it("exposes every seeded scenario through get()", () => {
    for (const scenario of seedScenarios) {
      expect(defaultScenarioRegistry.get(scenario.id)).toBe(scenario);
    }
  });
});

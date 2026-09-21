// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController } from "./code-editor";

const controllers: CodeEditorController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function create(source: string) {
  // These are production DOM/semantic contracts, not pixel measurements. Real
  // geometry is separately exercised by the Electron probes.
  vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn() });
  controllers.push(controller);
  return { host, controller };
}

describe("canonical nested rendering through the production editor", () => {
  it("renders a quoted fence and table inside a list item without dropping either leaf", () => {
    const source = [
      "outside", "", "- outer", "  > quote", "  >", "  > ```", "  > const value = 1;", "  > ```", "  >",
      "  > | A | B |", "  > | --- | --- |", "  > | x | y |", "", "after"
    ].join("\n");
    const { host, controller } = create(source);
    const assertLeaves = () => {
      expect(host.querySelectorAll(".cm-table-widget")).toHaveLength(1);
      expect(host.querySelector('.cm-table-widget [data-table-cell="1:0"]')?.textContent).toBe("x");
      expect(Array.from(host.querySelectorAll(".cm-inactive-code-block")).some(
        (line) => line.textContent?.includes("const value = 1;")
      )).toBe(true);
    };
    assertLeaves();
    controller.setSelection(source.length);
    assertLeaves();
    controller.setViewMode("source");
    expect(host.querySelector(".cm-table-widget")).toBeNull();
    expect(controller.getContent()).toBe(source);
    controller.setViewMode("wysiwym");
    assertLeaves();
    expect(controller.getContent()).toBe(source);
  });

  it("preserves strong semantics across a list paragraph soft break", () => {
    const source = "outside\n\n- **alpha\n  beta**\n\nafter";
    const { host, controller } = create(source);
    const assertStrong = () => {
      const visibleStrong = Array.from(host.querySelectorAll(".cm-inactive-inline-strong"))
        .map((element) => element.textContent).join(" ");
      expect(visibleStrong).toContain("alpha");
      expect(visibleStrong).toContain("beta");
    };
    assertStrong();
    controller.setSelection(source.length);
    assertStrong();
    expect(controller.getContent()).toBe(source);
  });

  it("keeps the source of a soft-break image inside a list item instead of duplicating its preview", () => {
    const source = ["- ![alt", "  text](hero.png)", "", "after"].join("\n");
    const { host, controller } = create(source);
    const previewCount = () => host.querySelectorAll(".cm-markdown-image-preview").length;

    expect(previewCount()).toBe(0);
    controller.setSelection(source.length);
    expect(previewCount()).toBe(0);
    expect(controller.getContent()).toBe(source);
  });

  it("keeps a point hard-break widget on both the active and inactive list line", () => {
    const source = ["- Alpha<br>Beta", "", "after"].join("\n");
    const { host, controller } = create(source);
    // An empty line renders its own <br> filler, so the widget is counted on the list line only.
    const breakCount = () => Array.from(host.querySelectorAll(".cm-line"))
      .find((line) => line.textContent?.includes("Alpha"))
      ?.querySelectorAll("br").length;

    host.querySelector(".cm-editor")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    controller.setSelection(source.indexOf("Alpha"));
    expect(breakCount()).toBe(1);

    controller.setSelection(source.length);
    expect(breakCount()).toBe(1);
    expect(controller.getContent()).toBe(source);
  });

  it("hides a nested heading marker only while its line is inactive", () => {
    const source = ["> # Title", ">", "> body", "", "after"].join("\n");
    const { host, controller } = create(source);
    const markerCount = () => host.querySelectorAll(".cm-inactive-heading-marker").length;

    expect(markerCount()).toBe(1);

    host.querySelector(".cm-editor")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    controller.setSelection(source.indexOf("Title"));

    expect(markerCount()).toBe(0);
    expect(host.querySelector(".cm-active-heading")).not.toBeNull();
    expect(controller.getContent()).toBe(source);
  });
});

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

describe("Test workbench shell", () => {
  let container: HTMLDivElement;
  let root: Root;
  let openEditorTestWindow: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/?mode=test-workbench");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    openEditorTestWindow = vi.fn<() => Promise<void>>().mockResolvedValue();

    window.yulora = {
      platform: "win32",
      runtimeMode: "test-workbench",
      openMarkdownFile: vi.fn(),
      saveMarkdownFile: vi.fn(),
      saveMarkdownFileAs: vi.fn(),
      openEditorTestWindow,
      onMenuCommand: vi.fn(() => () => {})
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

  it("renders the test workbench panels instead of the editor shell", async () => {
    await act(async () => {
      root.render(createElement(App));
    });

    expect(container.textContent).toContain("Yulora Test Workbench");
    expect(container.textContent).toContain("Scenario Catalog");
    expect(container.textContent).toContain("Debug Stream");
    expect(container.textContent).toContain("Test Process");
    expect(container.textContent).toContain("No scenario registry yet");
  });

  it("requests a dedicated editor window when the launch button is clicked", async () => {
    await act(async () => {
      root.render(createElement(App));
    });

    const launchButton = container.querySelector("button");

    expect(launchButton?.textContent).toContain("Open Editor Test Window");

    await act(async () => {
      launchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(openEditorTestWindow).toHaveBeenCalledTimes(1);
  });

  it("shows a diagnostic banner instead of crashing when the bridge is unavailable", async () => {
    // @ts-expect-error test intentionally removes the preload bridge
    delete window.yulora;

    await act(async () => {
      root.render(createElement(App));
    });

    expect(container.textContent).toContain("Yulora Test Workbench");
    expect(container.textContent).toContain("bridge unavailable");
  });
});

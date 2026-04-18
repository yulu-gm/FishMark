// @vitest-environment jsdom

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { TEXT_EDITING_SHORTCUTS } from "@yulora/editor-core";

import { ShortcutHintOverlay } from "./shortcut-hint-overlay";

describe("ShortcutHintOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    vi.useRealTimers();
  });

  it("renders text-only shortcut hints with platform key labels", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    expect(
      container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')
    )?.not.toBeNull();
    expect(container.textContent).toContain("Ctrl+B");
    expect(container.textContent).toContain("Bold");
    expect(container.textContent).toContain("Ctrl+Shift+9");
    expect(container.textContent).toContain("Blockquote");
  });

  it("stays hidden when not visible on first render", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    expect(
      container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')
    ).toBeNull();
  });

  it("keeps the overlay visible during fade-out and removes it after the timer", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("data-state")).toBe("closing");

    await act(async () => {
      vi.advanceTimersByTime(179);
    });

    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();
  });

  it("cancels fade-out if the overlay becomes visible again", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          shortcuts: TEXT_EDITING_SHORTCUTS
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("data-state")).toBe("open");
    expect(container.textContent).toContain("Ctrl+B");

    await act(async () => {
      vi.advanceTimersByTime(180);
    });

    const overlayAfterOriginalHideTimeout = container.querySelector(
      '[data-yulora-region="shortcut-hint-overlay"]'
    );

    expect(overlayAfterOriginalHideTimeout).not.toBeNull();
    expect(overlayAfterOriginalHideTimeout?.getAttribute("data-state")).toBe("open");
  });
});

// @vitest-environment jsdom

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP
} from "@yulora/editor-core";

import { ShortcutHintOverlay } from "./shortcut-hint-overlay";

const ITEM_STAGGER_DURATION_MS = 18;
const ITEM_ANIMATION_DURATION_MS = 105;
const TOTAL_CLOSE_DURATION_MS =
  ITEM_ANIMATION_DURATION_MS +
  ITEM_STAGGER_DURATION_MS * (DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts.length - 1);

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
          group: DEFAULT_TEXT_SHORTCUT_GROUP
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

  it("assigns per-item stagger indices for directional sequencing", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    const items = Array.from(container.querySelectorAll<HTMLElement>(".shortcut-hint-overlay-item"));

    expect(items.length).toBe(DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts.length);
    expect(items[0]?.style.getPropertyValue("--shortcut-index")).toBe("0");
    expect(items.at(-1)?.style.getPropertyValue("--shortcut-index")).toBe(
      String(DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts.length - 1)
    );
  });

  it("stays hidden when not visible on first render", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
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
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("data-state")).toBe("closing");

    await act(async () => {
      vi.advanceTimersByTime(TOTAL_CLOSE_DURATION_MS - 1);
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
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: false,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("data-state")).toBe("open");
    expect(container.textContent).toContain("Ctrl+B");

    await act(async () => {
      vi.advanceTimersByTime(TOTAL_CLOSE_DURATION_MS);
    });

    const overlayAfterOriginalHideTimeout = container.querySelector(
      '[data-yulora-region="shortcut-hint-overlay"]'
    );

    expect(overlayAfterOriginalHideTimeout).not.toBeNull();
    expect(overlayAfterOriginalHideTimeout?.getAttribute("data-state")).toBe("open");
  });

  it("switches displayed shortcuts when the editing context group changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          group: DEFAULT_TEXT_SHORTCUT_GROUP
        })
      );
    });

    expect(container.textContent).toContain("Bold");

    await act(async () => {
      root.render(
        createElement(ShortcutHintOverlay, {
          visible: true,
          platform: "win32",
          group: TABLE_EDITING_SHORTCUT_GROUP
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(overlay?.getAttribute("data-shortcut-group")).toBe("table-editing");
    expect(container.textContent).toContain("Next Cell");
    expect(container.textContent).not.toContain("Bold");
  });
});

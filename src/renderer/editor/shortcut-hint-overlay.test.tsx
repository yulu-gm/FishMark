// @vitest-environment jsdom

import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { TEXT_EDITING_SHORTCUTS } from "@yulora/editor-core";

import { ShortcutHintOverlay } from "./shortcut-hint-overlay";

describe("ShortcutHintOverlay", () => {
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
});
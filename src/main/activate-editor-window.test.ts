import { describe, expect, it, vi } from "vitest";
import { activateEditorWindow } from "./activate-editor-window";

describe("activateEditorWindow", () => {
  it.each([
    { name: "hidden", minimized: false, visible: false, expected: ["show", "focus"] },
    { name: "minimized", minimized: true, visible: true, expected: ["restore", "focus"] },
    { name: "hidden minimized", minimized: true, visible: false, expected: ["restore", "show", "focus"] },
    { name: "visible", minimized: false, visible: true, expected: ["focus"] }
  ])("activates a $name window in native lifecycle order", ({ minimized, visible, expected }) => {
    const calls: string[] = [];
    const window = {
      isDestroyed: () => false,
      isMinimized: () => minimized,
      isVisible: () => visible,
      restore: () => { calls.push("restore"); },
      show: () => { calls.push("show"); },
      focus: () => { calls.push("focus"); }
    };
    expect(activateEditorWindow(window)).toBe(true);
    expect(calls).toEqual(expected);
  });

  it("does not access native state after the window is destroyed", () => {
    const nativeCall = vi.fn(() => { throw new Error("destroyed window"); });
    expect(activateEditorWindow({
      isDestroyed: () => true,
      isMinimized: nativeCall,
      isVisible: nativeCall,
      restore: nativeCall,
      show: nativeCall,
      focus: nativeCall
    })).toBe(false);
    expect(nativeCall).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";

import { createCodeEditorController } from "./code-editor";

it("keeps markdown lifecycle handlers alive when replacing a focused document", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const onBlur = vi.fn();
  const controller = createCodeEditorController({
    parent: host, initialContent: "Control\n\n**Old**", onChange: vi.fn(), onBlur
  });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  try {
    controller.focus();
    expect(view.hasFocus).toBe(true);
    controller.replaceDocument("Control\n\n**AAA**");
    controller.replaceDocument("Control\n\n**BBB**");
    await Promise.resolve();
    expect(controller.getContent()).toBe("Control\n\n**BBB**");
    expect(errors.mock.calls.map(call => call.map(String).join(" "))).toEqual([]);
    controller.setSelection(12);
    expect(Array.from(host.querySelectorAll(".cm-active-inline-marker"), element => element.textContent))
      .toEqual(["**", "**"]);
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    await Promise.resolve();
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll(".cm-active-inline-marker")).toHaveLength(0);
    outside.remove();
  } finally {
    controller.destroy();host.remove();errors.mockRestore();
  }
});

it.each(["blur", "destroy"] as const)("cancels focused-load refresh after immediate %s", async action => {
  const host = document.body.appendChild(document.createElement("div"));
  const outside = document.body.appendChild(document.createElement("button"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const onBlur = vi.fn();
  const controller = createCodeEditorController({
    parent: host, initialContent: "**Old**", onChange: vi.fn(), onBlur
  });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  let destroyed = false;
  try {
    controller.focus();
    controller.replaceDocument("**AAA**");
    const dispatch = vi.spyOn(view, "dispatch");
    if (action === "destroy") {
      controller.destroy();destroyed = true;
      dispatch.mockClear();
    } else {
      outside.focus();
    }
    await Promise.resolve();
    expect(errors.mock.calls.map(call => call.map(String).join(" "))).toEqual([]);
    if (action === "destroy") {
      expect(dispatch).not.toHaveBeenCalled();
      expect(host.querySelector(".cm-editor")).toBeNull();
    } else {
      expect(onBlur).toHaveBeenCalledTimes(1);
      expect(view.hasFocus).toBe(false);
      expect(host.querySelectorAll(".cm-active-inline-marker")).toHaveLength(0);
      expect(controller.getContent()).toBe("**AAA**");
    }
    dispatch.mockRestore();
  } finally {
    if (!destroyed) controller.destroy();
    host.remove();outside.remove();errors.mockRestore();
  }
});

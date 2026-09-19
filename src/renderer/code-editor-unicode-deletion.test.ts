// @vitest-environment jsdom
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController, type CodeEditorDocumentChangeFrame } from "./code-editor";

const controllers: CodeEditorController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  document.body.replaceChildren();
});

describe("production Unicode deletion", () => {
  it.each(["😀", "e\u0301", "👩🏽‍💻"].flatMap((grapheme) =>
    (["Backspace", "Delete"] as const).map((key) => ({ grapheme, key }))
  ))("$key deletes one complete $grapheme and undo restores it", ({ grapheme, key }) => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const source = `A${grapheme}B`;
    const frames: CodeEditorDocumentChangeFrame[] = [];
    const controller = createCodeEditorController({ parent, initialContent: source, onChange: vi.fn(), onDocumentChangeFrame: (frame) => frames.push(frame) });
    controllers.push(controller);
    const view = EditorView.findFromDOM(parent.querySelector(".cm-editor")!)!;
    controller.setSelection(key === "Backspace" ? 1 + grapheme.length : 1);
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.getContent()).toBe("AB");
    expect(controller.getSelection()).toEqual({ anchor: 1, head: 1 });
    controller.flushPendingDocumentChanges();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ baseText: source, resultingText: "AB", changes: [{ from: 1, to: 1 + grapheme.length, insert: "" }] });
    expect(undo(view)).toBe(true);
    expect(controller.getContent()).toBe(source);
  });
});

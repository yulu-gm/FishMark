// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { readCompositionState } from "@fishmark/codemirror-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController, type CodeEditorDocumentChangeFrame } from "./code-editor";

let controller: CodeEditorController | undefined;
afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("composition persistence barrier", () => {
  it("releases a no-change composition seal from the finish effect", async () => {
    const parent = document.createElement("div");
    const frames: CodeEditorDocumentChangeFrame[] = [];
    controller = createCodeEditorController({ parent, initialContent: "alpha", onChange: vi.fn(), onDocumentChangeFrame: (frame) => frames.push(frame) });
    const view = EditorView.findFromDOM(parent.querySelector(".cm-editor")!)!;
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    const seal = controller.sealForBarrier();
    await vi.waitFor(() => expect(readCompositionState(view.state).active).toBe(false));
    controller.flushPendingDocumentChanges();
    expect((await seal).text).toBe("alpha");
    expect(frames).toHaveLength(0);
  });

  it("withholds early RAF, manual flush and seal until final input and normalization finish", async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => { callbacks.delete(id); });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const frames: CodeEditorDocumentChangeFrame[] = [];
    const source = "1. one\n2. two";
    controller = createCodeEditorController({ parent, initialContent: source, onChange: vi.fn(), onDocumentChangeFrame: (frame) => frames.push(frame) });
    const view = EditorView.findFromDOM(parent.querySelector(".cm-editor")!)!;
    // Schedule a normal frame before composition so it can race the later DOM end.
    view.dispatch({ changes: { from: source.length, insert: "!" }, userEvent: "input.type" });
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ changes: { from: 7, to: 8, insert: "3" }, selection: { anchor: 8 }, userEvent: "input.type.compose" });
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(readCompositionState(view.state).active).toBe(true);
    let sealed = false;
    const seal = controller.sealForBarrier().then((result) => { sealed = true; return result; });
    // Only run the controller's pending frame, which was the last request made
    // by the document update listener (CM's measurement request precedes it).
    const pendingFrame = [...callbacks.entries()].at(-1)!;
    callbacks.delete(pendingFrame[0]);
    pendingFrame[1](0);
    controller.flushPendingDocumentChanges();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(sealed).toBe(false);
    view.dispatch({ changes: { from: 7, to: 8, insert: "4" }, userEvent: "input.type.compose" });
    view.dispatch({ changes: { from: view.state.doc.length, insert: "中" }, userEvent: "input.type.compose" });
    await vi.waitFor(() => expect(readCompositionState(view.state).active).toBe(false));
    expect(controller.getContent()).toBe("1. one\n2. two!中");
    // Explicit flush after finish must also resolve the seal if it cancels RAF.
    controller.flushPendingDocumentChanges();
    expect((await seal).text).toBe("1. one\n2. two!中");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ baseText: source, resultingText: "1. one\n2. two!中" });
  });
});

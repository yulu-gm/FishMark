// @vitest-environment jsdom
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as adapter from "@fishmark/codemirror-adapter";
import * as model from "@fishmark/editor-model";
import { createCodeEditorController, type CodeEditorController, type CodeEditorDocumentChangeFrame } from "./code-editor";

const controllers: CodeEditorController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function create(source: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const frames: CodeEditorDocumentChangeFrame[] = [];
  const controller = createCodeEditorController({ parent, initialContent: source, onChange: vi.fn(), onDocumentChangeFrame: frame => frames.push(frame) });
  controllers.push(controller);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor")!)!;
  return { controller, view, frames, parent };
}
function planTypedText(text: string) {
  return (context: model.EditorSemanticContext) => model.planPrintableInput(context, text);
}

describe("production semantic routes", () => {
  it.each(["source", "identity"])("discards a pending table composition after its %s changes without restoring stale focus", async (change) => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const { controller, view, parent } = create(source);
    controller.setDocumentIdentity({ tabId: "a", epoch: 1, loadRevision: 1 });
    controller.selectTableCell({ row: 1, column: 0 });
    const cell = parent.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
    cell.focus();
    await Promise.resolve();
    await Promise.resolve();
    cell.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    cell.textContent = "候";
    cell.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    expect(controller.getContent()).toBe(source);
    if (change === "source") view.dispatch({ changes: { from: source.length, insert: "\n\noutside" }, userEvent: "input.type.compose" });
    else controller.setDocumentIdentity({ tabId: "b", epoch: 2, loadRevision: 1 });
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    await vi.waitFor(() => expect(adapter.readCompositionState(view.state).active).toBe(false));
    expect(controller.getContent()).toBe(source + (change === "source" ? "\n\noutside" : ""));
    expect(document.activeElement).toBe(outside);
  });
  it("unfreezes the same view when document identity interrupts composition without a late end event", () => {
    const { controller, view } = create("1. one\n2. two\n\n**word**");
    controller.setDocumentIdentity({ tabId: "a", epoch: 1, loadRevision: 1 });
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    controller.setDocumentIdentity({ tabId: "b", epoch: 2, loadRevision: 1 });
    expect(adapter.readCompositionState(view.state).active).toBe(false);
    view.dispatch({ changes: { from: 7, to: 8, insert: "3" }, selection: { anchor: 8 }, userEvent: "input.type" });
    expect(controller.getContent()).toBe("1. one\n2. two\n\n**word**");
    view.dispatch({ changes: { from: 13, insert: "中" }, selection: { anchor: 14 }, userEvent: "input.type" });
    expect(controller.getContent()).toBe("1. one\n2. two中\n\n**word**");
    expect(view.state.selection.main.anchor).toBe(14);
    controller.setSelection(controller.getContent().length);
    expect(adapter.runSemanticCommand(view, model.planEnter)).toBe(true);
    expect(controller.getContent()).toBe("1. one\n2. two中\n\n**word**\n\n");
  });
  it.each([
    { source: "", anchor: 0, insert: " ", selection: 0, expected: " " },
    { source: "- one\n\n  ", anchor: 9, insert: "中", selection: 10, expected: "- one\n\n  中" }
  ])("preserves native provisional whitespace and detached-list text: $source", ({ source, anchor, insert, selection, expected }) => {
    const { controller, view } = create(source);
    controller.setSelection(anchor);
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ changes: { from: anchor, insert }, selection: { anchor: selection }, userEvent: "input.type.compose" });
    expect(controller.getContent()).toBe(expected);
    expect(view.state.selection.main.anchor).toBe(selection);
  });
  it("does not snap provisional selection across hidden syntax", () => {
    const { view } = create("**word**");
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ selection: { anchor: 1 }, userEvent: "select" });
    expect(view.state.selection.main.anchor).toBe(1);
  });
  it.each(["before", "after"])("defers ordered normalization until native final input %s compositionend", async (order) => {
    const normalize = vi.spyOn(model, "planNormalizeOrderedListScopes");
    const { controller, view, frames } = create("1. one\n2. two");
    controller.setSelection(8);
    normalize.mockClear();
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    view.dispatch({ changes: { from: 7, to: 8, insert: "3" }, selection: { anchor: 8 }, userEvent: "input.type.compose" });
    expect(controller.getContent()).toBe("1. one\n3. two");
    expect(view.state.selection.main.anchor).toBe(8);
    controller.flushPendingDocumentChanges();
    expect(frames).toHaveLength(0);
    const finalInput = () => view.dispatch({ changes: { from: 7, to: 13, insert: "4. two中" }, selection: { anchor: 14 }, userEvent: "input.type.compose" });
    if (order === "before") finalInput();
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    if (order === "after") finalInput();
    expect(controller.getContent()).toBe("1. one\n4. two中");
    expect(normalize).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(adapter.readCompositionState(view.state).active).toBe(false));
    expect(controller.getContent()).toBe("1. one\n2. two中");
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(adapter.readCompositionState(view.state).active).toBe(false);
    controller.flushPendingDocumentChanges();
    expect(frames).toHaveLength(1);
    expect(frames.map((frame) => [frame.baseText, frame.resultingText])).toEqual([
      ["1. one\n2. two", "1. one\n2. two中"]
    ]);
  });
  it("freezes paragraph Enter and hard break helpers during composition but transports native text", async () => {
    const { controller, view, frames } = create("alpha");
    controller.setSelection(5);
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    controller.pressEnter();
    expect(controller.getContent()).toBe("alpha");
    runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }), "editor");
    expect(controller.getContent()).toBe("alpha");
    view.dispatch({ changes: { from: 5, insert: "中" }, selection: { anchor: 6 }, userEvent: "input.type.compose" });
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await vi.waitFor(() => expect(adapter.readCompositionState(view.state).active).toBe(false));
    controller.flushPendingDocumentChanges();
    expect(controller.getContent()).toBe("alpha中");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ baseText: "alpha", resultingText: "alpha中" });
    expect(adapter.runSemanticCommand(view, model.planEnter)).toBe(true);
    expect(controller.getContent()).toBe("alpha中\n\n");
  });
  it("runs controller keys through the model and emits one final frame, including undo", () => {
    const enter = vi.spyOn(model, "planEnter");
    const { controller, view, frames } = create("- one");
    controller.setSelection(5);
    controller.pressEnter();
    controller.flushPendingDocumentChanges();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(controller.getContent()).toBe("- one\n- ");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ baseText: "- one", resultingText: "- one\n- " });
    expect(undo(view)).toBe(true);
    controller.flushPendingDocumentChanges();
    expect(controller.getContent()).toBe("- one");
    expect(frames).toHaveLength(2);
  });

  it("routes the formatting shortcut, table toolbar command and widget input to model planners", async () => {
    const strong = vi.spyOn(model, "planStrongToggle");
    const row = vi.spyOn(model, "planTableInsertRowBelow");
    const cell = vi.spyOn(model, "planTableUpdateCell");
    const { controller, view, parent } = create("word");
    controller.setSelection(0, 4);
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(strong).toHaveBeenCalledTimes(1);
    expect(controller.getContent()).toBe("**word**");
    controller.replaceDocument("| A | B |\n| --- | --- |\n| x | y |");
    controller.selectTableCell({ row: 1, column: 0 });
    controller.insertTableRowBelow();
    expect(row).toHaveBeenCalledTimes(1);
    const editor = parent.querySelector<HTMLInputElement>('[data-table-cell="1:0"]')!;
    editor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await Promise.resolve();
    editor.value = "edited";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    expect(cell).toHaveBeenCalledTimes(1);
    expect(controller.getContent()).toContain("edited");
  });

  it("routes semantic commands through the controller's own session and rebinds it on identity changes", () => {
    const { controller, view } = create("abc");
    controller.setDocumentIdentity({ tabId: "a", epoch: 1, loadRevision: 1 });
    controller.setSelection(3);
    // The controller's transaction adapter is private, so this observes the session it actually
    // bound through the public semantic-command route. A released session returns "unhandled" and
    // leaves the document untouched, so a real edit is proof that the controller owns a live one.
    expect(adapter.runSemanticCommand(view, planTypedText("X"))).toBe(true);
    expect(controller.getContent()).toBe("abcX");
    expect(adapter.readCompositionState(view.state).active).toBe(false);

    controller.setDocumentIdentity({ tabId: "b", epoch: 2, loadRevision: 2 });
    controller.setSelection(4);
    expect(adapter.runSemanticCommand(view, planTypedText("Y"))).toBe(true);
    expect(controller.getContent()).toBe("abcXY");

    controller.replaceDocument("abc");
    controller.setSelection(3);
    expect(adapter.runSemanticCommand(view, planTypedText("Z"))).toBe(true);
    expect(controller.getContent()).toBe("abcZ");

    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
  });

  it("releases the controller session on destroy so semantic routes stop editing", () => {
    const { controller, view } = create("abc");
    controller.setDocumentIdentity({ tabId: "a", epoch: 1, loadRevision: 1 });
    controller.setSelection(3);
    expect(adapter.runSemanticCommand(view, planTypedText("X"))).toBe(true);
    expect(controller.getContent()).toBe("abcX");
    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);

    expect(adapter.runSemanticCommand(view, planTypedText("Y"))).toBe(false);
    expect(view.state.doc.toString()).toBe("abcX");
  });

  it("freezes structural commands during composition while preserving native composition text", async () => {
    const { controller, view, frames } = create("- one");
    controller.setSelection(5);
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    controller.pressEnter();
    expect(controller.getContent()).toBe("- one");
    view.dispatch({ changes: { from: 5, insert: "中" }, selection: { anchor: 6 }, userEvent: "input.type.compose" });
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await vi.waitFor(() => expect(adapter.readCompositionState(view.state).active).toBe(false));
    controller.flushPendingDocumentChanges();
    expect(controller.getContent()).toBe("- one中");
    expect(frames).toHaveLength(1);
  });
});

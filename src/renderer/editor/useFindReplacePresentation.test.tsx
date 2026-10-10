// @vitest-environment jsdom
import { act, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import type { CodeEditorHandle } from "../code-editor-view";
import { FindReplacePanel } from "./components/FindReplacePanel";
import { useEditorFocusPresentation } from "./useEditorFocusPresentation";
import { useFindReplacePresentation } from "./useFindReplacePresentation";
import { useViewContainerPresentation } from "./useViewContainerPresentation";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const empty = { matchCount: 0, currentMatchIndex: null, matches: [] };
const activeDocument: WorkspaceDocumentSnapshot = {
  tabId: "tab-a", path: "C:/note.md", content: "alpha beta", name: "note.md",
  encoding: "utf-8", revision: 1, savedRevision: 1, isDirty: false, saveState: "idle"
};
const setShellMode = vi.fn();
const noop = () => {};
let root: Root;
let container: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let controller: CodeEditorHandle;

function Harness({ revision = 1, shellMode = "editing", panelReady = true }: { revision?: number; shellMode?: "editing" | "reading"; panelReady?: boolean }) {
  const editorRef = useRef(controller);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const panel = useViewContainerPresentation();
  const search = useFindReplacePresentation({
    activeTabId: "tab-a", editorEpoch: 1, editorLoadRevision: revision, editorRef,
    activeViewContainer: panel.activeViewContainer,
    isDocumentOpen: true, isSearchViewActive: panel.activeViewContainer === "search",
    isViewContainerEnabled: true, onCloseViewContainer: panel.closeViewContainer,
    onToggleViewContainer: panel.toggleViewContainer
  });
  useEditorFocusPresentation({
    activeDocument, isSettingsOpen: false, isSettingsClosing: false, editorContainerRef,
    editorRef, handleEditorBlur: noop, isDocumentOpen: true,
    editorLoadRevision: revision, shellMode, setShellMode, setIsEditorFocused: noop
  });
  return <div onKeyDownCapture={search.handleWorkspaceKeyDownCapture}>
    <div ref={editorContainerRef} className="cm-editor"><div className="cm-content" tabIndex={0} aria-label="Markdown editor" /></div>
    <button onClick={search.toggleSearchViewContainer}>Search</button>
    <button onClick={() => panel.toggleViewContainer("outline")}>Outline</button>
    <output data-testid="active-container">{panel.activeViewContainer}</output>
    {(panel.activeViewContainer ?? panel.closingViewContainer) === "search" ? <aside className="side-panel" data-state={panel.activeViewContainer ? "open" : "closing"}>
      {panelReady ? <FindReplacePanel findText={search.findText} replaceText={search.replaceText}
        autoFocus={panel.activeViewContainer === "search"}
        matchStatusLabel={search.matchStatusLabel} findInputRef={search.findInputRef}
        handleFindReplaceKeyDown={search.handleFindReplaceKeyDown}
        handleFindTextChange={search.handleFindTextChange} handleReplaceTextChange={search.handleReplaceTextChange}
        hasMatches={false} onPrevious={noop} onNext={noop} onReplaceCurrent={noop} onReplaceAll={noop}
        matches={search.findReplaceSnapshot.matches} currentMatchIndex={search.findReplaceSnapshot.currentMatchIndex}
        onSelectMatch={search.selectFindReplaceMatch} /> : null}
    </aside> : null}
  </div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  controller = {
    prepareFindReplace: vi.fn(async () => {}), clearFindReplaceQuery: vi.fn(() => empty),
    getContent: vi.fn(() => activeDocument.content), getSelection: vi.fn(() => ({ anchor: 0, head: 0 })),
    updateFindReplaceQuery: vi.fn(() => empty), findNextMatch: vi.fn(() => empty), findPreviousMatch: vi.fn(() => empty),
    selectFindReplaceMatch: vi.fn(() => empty),
    focus: vi.fn(() => container.querySelector<HTMLElement>('[aria-label="Markdown editor"]')!.focus())
  } as unknown as CodeEditorHandle;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function render(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<StrictMode><Harness {...props} /></StrictMode>));
}
function editor() { return container.querySelector<HTMLElement>('[aria-label="Markdown editor"]')!; }
function input() { return container.querySelector<HTMLInputElement>('[aria-label="Find text"]')!; }
async function key(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  await act(async () => target.dispatchEvent(event));
  return event;
}
async function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => pending.forEach(callback => callback(0)));
}

it("keeps the first Search focus when an earlier editing-mode focus frame runs", async () => {
  await render();
  editor().focus();
  await key(editor(), "f", { ctrlKey: true });
  expect(document.activeElement).toBe(input());
  expect(frames.size).toBeGreaterThan(0);
  await flushFrames();
  expect(document.activeElement).toBe(input());
  expect(controller.focus).not.toHaveBeenCalled();
});

it("keeps Search focused when a reload schedules another editor focus frame", async () => {
  await render();
  await flushFrames();
  await key(editor(), "f", { ctrlKey: true });
  const searchInput = input();
  await render({ revision: 2 });
  await flushFrames();
  expect(document.activeElement).toBe(searchInput);
});

it("still focuses the editor when entering editing mode without a Search focus", async () => {
  await render({ shellMode: "reading" });
  expect(frames.size).toBe(0);
  await render();
  await flushFrames();
  expect(document.activeElement).toBe(editor());
  expect(controller.focus).toHaveBeenCalledTimes(1);
});

it("refocuses Search on repeated Ctrl+F and reopens it after Escape", async () => {
  await render();
  await flushFrames();
  await key(editor(), "f", { ctrlKey: true });
  const original = input();
  const replace = container.querySelector<HTMLInputElement>('[aria-label="Replace with"]')!;
  replace.focus();
  await key(replace, "f", { ctrlKey: true });
  expect(document.activeElement).toBe(original);
  await key(original, "Escape");
  expect(document.activeElement).toBe(editor());
  expect(setShellMode).not.toHaveBeenCalled();
  await key(editor(), "f", { ctrlKey: true });
  expect(document.activeElement).toBe(original);
  await key(original, "Escape");
  await act(async () => vi.advanceTimersByTime(180));
  expect(input()).toBeNull();
  await key(editor(), "f", { ctrlKey: true });
  expect(input()).not.toBe(original);
  expect(document.activeElement).toBe(input());
});

it("seeds Search from a reversed source selection without overwriting it on a repeated input shortcut", async () => {
  await render();
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 10, head: 6 });
  await key(editor(), "f", { ctrlKey: true });
  expect(input().value).toBe("beta");
  expect(controller.updateFindReplaceQuery).toHaveBeenLastCalledWith({ search: "beta", replace: "" });
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 0, head: 5 });
  await key(input(), "f", { ctrlKey: true });
  expect(input().value).toBe("beta");
  expect(document.activeElement).toBe(input());
});

it("seeds Search from the canonical source selection while a table cell owns DOM focus", async () => {
  await render();
  const source = "| Name |\n| --- |\n| beta |\n";
  vi.mocked(controller.getContent).mockReturnValue(source);
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: source.indexOf("beta"), head: source.indexOf("beta") + 4 });
  const cell = document.createElement("div");
  cell.className = "cm-table-widget-input";
  cell.contentEditable = "true";
  cell.tabIndex = 0;
  editor().parentElement!.append(cell);
  cell.focus();
  await key(cell, "f", { ctrlKey: true });
  expect(input().value).toBe("beta");
  expect(document.activeElement).toBe(input());
  expect(controller.updateFindReplaceQuery).toHaveBeenLastCalledWith({ search: "beta", replace: "" });
});

it.each(["\n", "\r\n"])("does not seed or overwrite Search with a multiline %j selection", async lineBreak => {
  await render();
  const multiline = `alpha${lineBreak}beta`;
  vi.mocked(controller.getContent).mockReturnValue(multiline);
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 0, head: multiline.length });
  await key(editor(), "f", { ctrlKey: true });
  expect(document.activeElement).toBe(input());
  expect(input().value).toBe("");
  expect(controller.updateFindReplaceQuery).not.toHaveBeenCalled();

  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 0, head: 5 });
  await key(editor(), "f", { ctrlKey: true });
  expect(input().value).toBe("alpha");
  expect(controller.updateFindReplaceQuery).toHaveBeenCalledTimes(1);
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 0, head: multiline.length });
  await key(editor(), "f", { ctrlKey: true });
  expect(document.activeElement).toBe(input());
  expect(input().value).toBe("alpha");
  expect(controller.updateFindReplaceQuery).toHaveBeenCalledTimes(1);
});

it("does not let a delayed Search preparation reopen after a document revision changes", async () => {
  let ready!: () => void;
  const preparation = new Promise<void>(resolve => { ready = resolve; });
  vi.mocked(controller.prepareFindReplace).mockReturnValue(preparation);
  await render();
  await key(editor(), "f", { ctrlKey: true });
  await render({ revision: 2 });
  await act(async () => ready());
  expect(input()).toBeNull();
});

it("closes Search on Escape before its lazy form mounts, without late autofocus during exit", async () => {
  await render({ panelReady: false });
  await flushFrames();
  await key(editor(), "f", { ctrlKey: true });
  expect(container.querySelector("output")?.textContent).toBe("search");
  expect(input()).toBeNull();
  const event = await key(editor(), "Escape");
  expect(event.defaultPrevented).toBe(true);
  expect(container.querySelector("output")?.textContent).toBe("");
  expect(controller.clearFindReplaceQuery).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(editor());
  // Model the chunk finishing while the closing animation still owns its view.
  await render({ panelReady: true });
  expect(container.querySelector(".side-panel")?.getAttribute("data-state")).toBe("closing");
  expect(document.activeElement).toBe(editor());
  await act(async () => vi.advanceTimersByTime(180));
  expect(input()).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("");
});

it("leaves Enter on a result button available for native activation instead of navigating next", async () => {
  const match = { from: 0, to: 5, line: 1, column: 1, snippet: "alpha beta" };
  const snapshot = { matchCount: 1, currentMatchIndex: 1, matches: [match] };
  vi.mocked(controller.updateFindReplaceQuery).mockReturnValue(snapshot);
  vi.mocked(controller.selectFindReplaceMatch).mockReturnValue(snapshot);
  vi.mocked(controller.getSelection).mockReturnValue({ anchor: 0, head: 5 });
  await render();
  await key(editor(), "f", { ctrlKey: true });
  const result = container.querySelector<HTMLButtonElement>(".find-replace-result")!;
  result.focus();
  const event = await key(result, "Enter");
  expect(event.defaultPrevented).toBe(false);
  expect(controller.findNextMatch).not.toHaveBeenCalled();
  expect(controller.findPreviousMatch).not.toHaveBeenCalled();
  // jsdom does not synthesize button activation from keydown; test the preserved click path too.
  await act(async () => result.click());
  expect(controller.selectFindReplaceMatch).toHaveBeenCalledWith(match);
  expect(document.activeElement).toBe(result);
});

it.each(["Escape", "Outline"])("cancels a cold Search request after %s", async action => {
  let ready!: () => void;
  vi.mocked(controller.prepareFindReplace).mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
  await render();
  await key(editor(), "f", { ctrlKey: true });
  if (action === "Escape") {
    await key(editor(), "Escape");
  } else {
    const outline = [...container.querySelectorAll("button")].find(button => button.textContent === "Outline")!;
    await act(async () => outline.click());
  }
  await act(async () => ready());
  expect(input()).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe(action === "Outline" ? "outline" : "");
});

it("cancels a pending Search activation when its workspace unmounts", async () => {
  let ready!: () => void;
  vi.mocked(controller.prepareFindReplace).mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
  await render();
  await key(editor(), "f", { ctrlKey: true });
  await act(async () => root.render(null));
  await act(async () => ready());
  expect(container.childElementCount).toBe(0);
  expect(controller.focus).not.toHaveBeenCalled();
});

it("focuses only once after repeated shortcuts while Search is loading", async () => {
  let ready!: () => void;
  vi.mocked(controller.prepareFindReplace).mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
  await render();
  await flushFrames();
  await key(editor(), "f", { ctrlKey: true });
  await key(editor(), "f", { ctrlKey: true, repeat: true });
  expect(input()).toBeNull();
  await act(async () => ready());
  expect(document.activeElement).toBe(input());
  expect(container.querySelector(".side-panel")?.getAttribute("data-state")).toBe("open");
});

it.each([
  { ctrlKey: true, altKey: true }, { ctrlKey: true, shiftKey: true },
  { ctrlKey: true, metaKey: true }, { ctrlKey: true, isComposing: true },
  { ctrlKey: true, keyCode: 229 }
])("leaves other modifiers and composition shortcuts alone: %j", async options => {
  await render();
  const event = await key(editor(), "f", options);
  expect(event.defaultPrevented).toBe(false);
  expect(input()).toBeNull();
});

it("opens Search with Cmd+F", async () => {
  await render();
  const event = await key(editor(), "f", { metaKey: true });
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(input());
});

it("does not claim an already consumed find shortcut", async () => {
  await render();
  const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  event.preventDefault();
  await act(async () => editor().dispatchEvent(event));
  expect(input()).toBeNull();
});

it.each(["Enter", "Escape"])("does not consume composing %s in Search", async pressedKey => {
  await render();
  await key(editor(), "f", { ctrlKey: true });
  const event = await key(input(), pressedKey, { isComposing: true });
  expect(event.defaultPrevented).toBe(false);
  expect(container.querySelector(".side-panel")?.getAttribute("data-state")).toBe("open");
  expect(controller.findNextMatch).not.toHaveBeenCalled();
  expect(controller.clearFindReplaceQuery).not.toHaveBeenCalled();
  expect(setShellMode).not.toHaveBeenCalled();
});

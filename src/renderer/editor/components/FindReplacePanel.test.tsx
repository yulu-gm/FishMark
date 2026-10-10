// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FindReplacePanel } from "./FindReplacePanel";
import type { FindReplaceMatch } from "../../code-editor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
const matches: FindReplaceMatch[] = Array.from({ length: 123 }, (_, index) => ({
  from: index * 6, to: index * 6 + 5, line: index + 1, column: 1, snippet: `alpha ${index + 1}`
}));
const select = vi.fn();
const findInputRef = createRef<HTMLInputElement>();
const noop = () => {};
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
async function render(currentMatchIndex: number | null = 1, results = matches, findText = "alpha") {
  await act(async () => root.render(<FindReplacePanel findText={findText} replaceText="beta"
    matchStatusLabel={`${currentMatchIndex ?? 0} / ${results.length}`} findInputRef={findInputRef}
    handleFindReplaceKeyDown={noop} handleFindTextChange={noop} handleReplaceTextChange={noop}
    hasMatches={results.length > 0} onPrevious={noop} onNext={noop} onReplaceCurrent={noop} onReplaceAll={noop}
    matches={results} currentMatchIndex={currentMatchIndex} onSelectMatch={select} />));
}
function button(label: string) { return container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!; }
function rows() { return [...container.querySelectorAll<HTMLButtonElement>(".find-replace-result")]; }

it("shows the current result's page on its first mount", async () => {
  await render(101);
  expect(rows()).toHaveLength(23);
  expect(rows()[0]?.dataset.matchIndex).toBe("101");
  expect(rows()[0]?.getAttribute("aria-current")).toBe("true");
});

it("bounds rendered rows, preserves browsed pages on projection refresh, and follows navigation", async () => {
  await render();
  expect(document.activeElement).toBe(findInputRef.current);
  expect(rows()).toHaveLength(50);
  expect(rows()[0]?.getAttribute("aria-current")).toBe("true");
  await act(async () => button("Next results page").click());
  expect(rows()[0]?.dataset.matchIndex).toBe("51");
  await render(1, matches.map(match => ({ ...match })));
  expect(rows()[0]?.dataset.matchIndex).toBe("51");
  await render(101);
  expect(rows()).toHaveLength(23);
  expect(rows()[0]?.dataset.matchIndex).toBe("101");
  expect(button("Next results page").disabled).toBe(true);
  await act(async () => rows()[22]!.click());
  expect(select).toHaveBeenLastCalledWith(matches[122]);
  await render(null, matches.slice(0, 4));
  expect(rows()).toHaveLength(4);
  await render(null, [], "missing");
  expect(rows()).toHaveLength(0);
  expect(container.querySelector(".find-replace-results-empty")?.textContent).toBe("No matches");
  await render(null, [], "");
  expect(container.querySelector(".find-replace-results-empty")?.textContent).toBe("Enter text to find matches");
});

it("preserves active form-input pointer focus without suppressing button keyboard focus", async () => {
  await render();
  for (const label of ["Previous match", "Next match", "Replace current match", "Replace all matches", "Next results page"]) {
    const action = button(label);
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => action.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  }
  const replace = container.querySelector<HTMLInputElement>('[aria-label="Replace with"]')!;
  replace.focus();
  const result = rows()[1]!;
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  await act(async () => result.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  result.focus();
  const keyboardFocusEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  await act(async () => result.dispatchEvent(keyboardFocusEvent));
  expect(keyboardFocusEvent.defaultPrevented).toBe(false);
  await act(async () => result.click());
  expect(select).toHaveBeenLastCalledWith(matches[1]);
  expect(document.activeElement).toBe(result);
});

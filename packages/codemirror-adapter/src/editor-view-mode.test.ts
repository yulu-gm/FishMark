// @vitest-environment jsdom
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";

import {
  DEFAULT_EDITOR_VIEW_MODE,
  getMarkdownEditorViewMode,
  markdownEditorViewModeField,
  setMarkdownEditorViewMode,
  setMarkdownEditorViewModeEffect
} from "./editor-view-mode";

const SOURCE = ["# Title", "", "Alpha paragraph", "", "Beta paragraph"].join("\n");

function createView(initialMode: "wysiwym" | "source" = "wysiwym"): {
  readonly transactions: Transaction[];
  readonly view: EditorView;
} {
  const transactions: Transaction[] = [];
  const host = document.createElement("div");
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: SOURCE,
      extensions: [
        markdownEditorViewModeField.init(() => initialMode),
        EditorView.updateListener.of((update) => {
          transactions.push(...update.transactions);
        })
      ]
    })
  });

  return { transactions, view };
}

it("dispatches the mode toggle as one transaction that history must not record", () => {
  const { transactions, view } = createView();

  try {
    setMarkdownEditorViewMode(view, "source");

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.annotation(Transaction.addToHistory)).toBe(false);
    expect(getMarkdownEditorViewMode(view.state)).toBe("source");
    expect(view.state.doc.toString()).toBe(SOURCE);

    // A repeated request for the mode the view is already in must not dispatch at all.
    setMarkdownEditorViewMode(view, "source");

    expect(transactions).toHaveLength(1);
  } finally {
    view.destroy();
  }
});

it("keeps the document and selection untouched by the toggle", () => {
  const { view } = createView();

  try {
    const selectionBefore = view.state.selection.main;

    setMarkdownEditorViewMode(view, "source");

    expect(view.state.doc.toString()).toBe(SOURCE);
    expect(view.state.selection.main.anchor).toBe(selectionBefore.anchor);
    expect(view.state.selection.main.head).toBe(selectionBefore.head);
    // Presentation state must not become an undo step: the toggle's only transaction carries
    // `addToHistory === false`, asserted directly in the test above.
  } finally {
    view.destroy();
  }
});

it("defaults to wysiwym, honours the initial mode, and stays out of source until asked", () => {
  expect(DEFAULT_EDITOR_VIEW_MODE).toBe("wysiwym");

  const { view } = createView();

  try {
    expect(getMarkdownEditorViewMode(view.state)).toBe("wysiwym");
  } finally {
    view.destroy();
  }

  const sourceFirst = createView("source");

  try {
    expect(getMarkdownEditorViewMode(sourceFirst.view.state)).toBe("source");
  } finally {
    sourceFirst.view.destroy();
  }
});

it("applies the mode effect from any transaction, not just the toggle helper", () => {
  const { view } = createView();

  try {
    view.dispatch({ effects: setMarkdownEditorViewModeEffect.of("source") });
    expect(getMarkdownEditorViewMode(view.state)).toBe("source");

    view.dispatch({ effects: setMarkdownEditorViewModeEffect.of("wysiwym") });
    expect(getMarkdownEditorViewMode(view.state)).toBe("wysiwym");
  } finally {
    view.destroy();
  }
});

it("lets the last mode effect in one transaction win", () => {
  const { view } = createView();

  try {
    view.dispatch({
      effects: [
        setMarkdownEditorViewModeEffect.of("source"),
        setMarkdownEditorViewModeEffect.of("wysiwym")
      ]
    });

    expect(getMarkdownEditorViewMode(view.state)).toBe("wysiwym");
  } finally {
    view.destroy();
  }
});

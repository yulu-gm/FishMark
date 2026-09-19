// @vitest-environment jsdom
import { EditorState, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import { createEditTransactionPlan } from "@fishmark/editor-model";
import { runSemanticCommand } from "./semantic-keypress";

it.each(["navigation", "structural", "edit"] as const)("retains %s cursor scroll requests after retiring the legacy command target", (intent) => {
  const host = document.createElement("div");
  const transactions: Transaction[] = [];
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: "Alpha\nBeta",
    extensions: [EditorView.updateListener.of((update) => transactions.push(...update.transactions))]
  }) });
  try {
    runSemanticCommand(view, (context) => createEditTransactionPlan({ context, commandId: "pointer",
      intent, edits: intent === "navigation" ? [] : [{ from: 0, to: 0, insert: "x" }], selection: { anchor: 6, head: 6 }
    }));
    expect(view.state.selection.main.anchor).toBe(6);
    expect(transactions.at(-1)?.scrollIntoView).toBe(true);
  } finally { view.destroy(); }
});

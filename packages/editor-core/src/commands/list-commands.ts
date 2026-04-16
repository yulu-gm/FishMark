import type { EditorView } from "@codemirror/view";

import { buildContinuationPrefix, parseListLine } from "./line-parsers";

export function runListEnter(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const parsed = parseListLine(line.text);
  if (!parsed) {
    return false;
  }

  if (parsed.content.trim().length === 0) {
    const deleteTo =
      line.to < view.state.doc.length && view.state.doc.sliceString(line.to, line.to + 1) === "\n"
        ? line.to + 1
        : line.to;

    view.dispatch({
      changes: {
        from: line.from,
        to: deleteTo,
        insert: ""
      },
      selection: {
        anchor: line.from,
        head: line.from
      }
    });
    return true;
  }

  const continuationPrefix = buildContinuationPrefix(parsed);
  const insertAt = selection.head;
  const nextAnchor = insertAt + 1 + continuationPrefix.length;

  view.dispatch({
    changes: {
      from: insertAt,
      to: insertAt,
      insert: `\n${continuationPrefix}`
    },
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

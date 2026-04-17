import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  createYuloraMarkdownExtensions,
  runMarkdownBackspace,
  runMarkdownEnter,
  type ActiveBlockState
} from "@yulora/editor-core";
import { parseMarkdownDocument } from "@yulora/markdown-engine";

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
};

export type CodeEditorController = {
  getContent: () => string;
  replaceDocument: (nextContent: string) => void;
  focus: () => void;
  navigateToOffset: (offset: number) => void;
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  destroy: () => void;
};

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  let activeBlockState: ActiveBlockState = {
    blockMap: parseMarkdownDocument(""),
    activeBlock: null,
    selection: {
      anchor: 0,
      head: 0
    }
  };

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: createYuloraMarkdownExtensions({
        parseMarkdownDocument,
        onContentChange: options.onChange,
        onActiveBlockChange: (nextState) => {
          activeBlockState = nextState;
          options.onActiveBlockChange?.(nextState);
        },
        onBlur: options.onBlur
      })
    });

  const initialState = createState(options.initialContent);
  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  return {
    getContent: () => view.state.doc.toString(),
    replaceDocument(nextContent: string) {
      const nextState = createState(nextContent);
      view.setState(nextState);
    },
    focus() {
      view.focus();
    },
    navigateToOffset(offset: number) {
      const nextOffset = Math.max(0, Math.min(offset, view.state.doc.length));

      view.dispatch({
        selection: {
          anchor: nextOffset,
          head: nextOffset
        },
        effects: EditorView.scrollIntoView(nextOffset, {
          y: "center",
          yMargin: 24
        })
      });
      view.focus();
    },
    insertText(text: string) {
      const selection = view.state.selection.main;
      const nextAnchor = selection.from + text.length;

      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text
        },
        selection: {
          anchor: nextAnchor,
          head: nextAnchor
        }
      });
    },
    setSelection(anchor: number, head = anchor) {
      view.dispatch({
        selection: {
          anchor,
          head
        }
      });
    },
    pressEnter() {
      runMarkdownEnter(view, activeBlockState);
    },
    pressBackspace() {
      runMarkdownBackspace(view, activeBlockState);
    },
    destroy() {
      view.destroy();
    }
  };
}

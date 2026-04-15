import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  onChange: (content: string) => void;
};

export type CodeEditorController = {
  getContent: () => string;
  replaceDocument: (nextContent: string) => void;
  destroy: () => void;
};

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([...historyKeymap, ...defaultKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": "Markdown editor",
          spellcheck: "false"
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.state.doc.toString());
          }
        })
      ]
    });

  const view = new EditorView({
    state: createState(options.initialContent),
    parent: options.parent
  });

  return {
    getContent: () => view.state.doc.toString(),
    replaceDocument(nextContent: string) {
      view.setState(createState(nextContent));
    },
    destroy() {
      view.destroy();
    }
  };
}

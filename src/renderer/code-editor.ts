import {
  defaultKeymap,
  deleteCharBackward,
  history,
  historyKeymap,
  insertNewlineAndIndent
} from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";

import {
  createActiveBlockStateFromBlockMap,
  type ActiveBlockState
} from "../../packages/editor-core/src";
import { parseBlockMap } from "../../packages/markdown-engine/src";

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
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  destroy: () => void;
};

const setBlockDecorationsEffect = StateEffect.define<DecorationSet>();

const blockDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setBlockDecorationsEffect)) {
        nextDecorations = effect.value;
      }
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  let blockMap = parseBlockMap("");
  let activeBlockState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: 0,
    head: 0
  });
  let blockDecorationSignature = "";
  let hasEditorFocus = false;
  let isCompositionGuardActive = false;
  let hasPendingDerivedStateFlush = false;
  let applyBlockDecorations: (force?: boolean) => void = () => {};

  const createSelectionSnapshot = (state: EditorState) => ({
    anchor: state.selection.main.anchor,
    head: state.selection.main.head
  });

  const notifyActiveBlockChange = (nextState: ActiveBlockState, force = false) => {
    const didChange =
      force ||
      activeBlockState.selection.anchor !== nextState.selection.anchor ||
      activeBlockState.selection.head !== nextState.selection.head ||
      activeBlockState.activeBlock?.id !== nextState.activeBlock?.id ||
      activeBlockState.blockMap !== nextState.blockMap;

    activeBlockState = nextState;

    if (didChange) {
      options.onActiveBlockChange?.(nextState);
    }
  };

  const recomputeDerivedState = (state: EditorState, force = false) => {
    blockMap = parseBlockMap(state.doc.toString());
    notifyActiveBlockChange(
      createActiveBlockStateFromBlockMap(blockMap, createSelectionSnapshot(state)),
      force
    );
    applyBlockDecorations(force);
  };

  const createBlockDecorations = (state: ActiveBlockState, source: string) => {
    const activeBlockId = hasEditorFocus ? state.activeBlock?.id ?? null : null;
    const ranges = [];
    const signatures: string[] = [];

    for (const block of state.blockMap.blocks) {
      if (block.id === activeBlockId) {
        continue;
      }

      if (block.type === "heading") {
        signatures.push(`${block.type}:${block.id}:${block.startOffset}:${block.depth}`);
        const markerEnd = getInactiveHeadingMarkerEnd(block.startOffset, block.depth, source);
        ranges.push(
          Decoration.line({
            attributes: {
              class: `cm-inactive-heading cm-inactive-heading-depth-${block.depth}`
            }
          }).range(block.startOffset)
        );
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-heading-marker"
            }
          }).range(block.startOffset, markerEnd)
        );
      }

      if (block.type === "paragraph") {
        signatures.push(`${block.type}:${block.id}:${block.startOffset}`);
        ranges.push(
          Decoration.line({
            attributes: {
              class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
            }
          }).range(block.startOffset)
        );
      }

      if (block.type === "list") {
        signatures.push(
          `${block.type}:${block.id}:${block.ordered}:${block.items
            .map((item) => `${item.id}:${item.indent}:${item.task?.checked ?? "none"}`)
            .join(",")}`
        );

        for (const item of block.items) {
          const lineClasses = [
            "cm-inactive-list",
            block.ordered ? "cm-inactive-list-ordered" : "cm-inactive-list-unordered",
            `cm-inactive-list-depth-${Math.floor(item.indent / 2)}`
          ];

          if (item.task) {
            lineClasses.push(
              "cm-inactive-list-task",
              item.task.checked
                ? "cm-inactive-list-task-checked"
                : "cm-inactive-list-task-unchecked"
            );
          }

          ranges.push(
            Decoration.line({
              attributes: {
                class: lineClasses.join(" ")
              }
            }).range(item.startOffset)
          );

          ranges.push(
            Decoration.mark({
              attributes: {
                class: "cm-inactive-list-marker"
              }
            }).range(item.markerStart, item.markerEnd)
          );

          if (item.task) {
            ranges.push(
              Decoration.mark({
              attributes: {
                class: [
                  "cm-inactive-task-marker",
                  item.task.checked
                    ? "cm-inactive-task-marker-checked"
                    : "cm-inactive-task-marker-unchecked"
                ].join(" "),
                "data-task-state": item.task.checked ? "checked" : "unchecked"
              }
            }).range(item.task.markerStart, item.task.markerEnd)
          );
          }
        }
      }

      if (block.type === "blockquote") {
        signatures.push(`${block.type}:${block.id}:${block.startOffset}:${block.endOffset}`);

        for (const line of getInactiveBlockquoteLines(block.startOffset, block.endOffset, source)) {
          const lineClasses = ["cm-inactive-blockquote"];

          if (line.isFirstLine) {
            lineClasses.push("cm-inactive-blockquote-start");
          }

          if (line.isLastLine) {
            lineClasses.push("cm-inactive-blockquote-end");
          }

          ranges.push(
            Decoration.line({
              attributes: {
                class: lineClasses.join(" ")
              }
            }).range(line.lineStart)
          );

          if (line.markerEnd > line.lineStart) {
            ranges.push(
              Decoration.mark({
                attributes: {
                  class: "cm-inactive-blockquote-marker"
                }
              }).range(line.lineStart, line.markerEnd)
            );
          }
        }
      }

      if (block.type === "codeFence") {
        signatures.push(`${block.type}:${block.id}:${block.info ?? ""}`);

        for (const line of getInactiveCodeFenceLines(block.startOffset, block.endOffset, source)) {
          if (line.kind === "fence") {
            ranges.push(
              Decoration.line({
                attributes: {
                  class: "cm-inactive-code-block-fence"
                }
              }).range(line.lineStart)
            );
            if (line.lineEnd > line.lineStart) {
              ranges.push(
                Decoration.mark({
                  attributes: {
                    class: "cm-inactive-code-block-fence-marker"
                  }
                }).range(line.lineStart, line.lineEnd)
              );
            }
            continue;
          }

          const lineClasses = ["cm-inactive-code-block"];

          if (line.isFirstContentLine) {
            lineClasses.push("cm-inactive-code-block-start");
          }

          if (line.isLastContentLine) {
            lineClasses.push("cm-inactive-code-block-end");
          }

          ranges.push(
            Decoration.line({
              attributes: {
                class: lineClasses.join(" ")
              }
            }).range(line.lineStart)
          );
        }
      }
    }

    return {
      decorationSet: Decoration.set(ranges, true),
      signature: signatures.join("|")
    };
  };

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        blockDecorationsField,
        history(),
        keymap.of([
          {
            key: "Backspace",
            run: (editorView) =>
              runCodeFenceBackspace(editorView, activeBlockState) || deleteCharBackward(editorView)
          },
          {
            key: "Enter",
            run: (editorView) => {
              return (
                runCodeFenceEnter(editorView, activeBlockState) ||
                runListEnter(editorView) ||
                runBlockquoteEnter(editorView) ||
                insertNewlineAndIndent(editorView)
              );
            }
          },
          ...historyKeymap,
          ...defaultKeymap
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": "Markdown editor",
          spellcheck: "false"
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.state.doc.toString());
          }

          if (!update.docChanged && !update.selectionSet) {
            return;
          }

          if (
            isCompositionGuardActive ||
            update.view.compositionStarted ||
            update.view.composing
          ) {
            hasPendingDerivedStateFlush = true;
            return;
          }

          recomputeDerivedState(update.state);
        })
      ]
    });

  const initialState = createState(options.initialContent);
  blockMap = parseBlockMap(initialState.doc.toString());
  activeBlockState = createActiveBlockStateFromBlockMap(blockMap, createSelectionSnapshot(initialState));

  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  applyBlockDecorations = (force = false) => {
    const { decorationSet, signature } = createBlockDecorations(
      activeBlockState,
      view.state.doc.toString()
    );

    if (!force && signature === blockDecorationSignature) {
      return;
    }

    blockDecorationSignature = signature;
    view.dispatch({
      effects: setBlockDecorationsEffect.of(decorationSet)
    });
  };

  applyBlockDecorations(true);
  options.onActiveBlockChange?.(activeBlockState);

  const handleCompositionStart = () => {
    isCompositionGuardActive = true;
  };

  const handleCompositionEnd = () => {
    isCompositionGuardActive = false;

    if (!hasPendingDerivedStateFlush) {
      return;
    }

    hasPendingDerivedStateFlush = false;
    recomputeDerivedState(view.state, true);
  };

  const syncBlurDecorations = () => {
    queueMicrotask(() => {
      const nextHasEditorFocus = view.hasFocus;

      if (hasEditorFocus === nextHasEditorFocus) {
        return;
      }

      hasEditorFocus = nextHasEditorFocus;
      applyBlockDecorations(true);
    });
  };

  const handleFocusIn = () => {
    if (hasEditorFocus) {
      return;
    }

    hasEditorFocus = true;
    applyBlockDecorations(true);
  };

  const handleBlur = () => {
    syncBlurDecorations();
    options.onBlur?.();
  };

  view.dom.addEventListener("compositionstart", handleCompositionStart);
  view.dom.addEventListener("compositionupdate", handleCompositionStart);
  view.dom.addEventListener("compositionend", handleCompositionEnd);
  view.dom.addEventListener("focusin", handleFocusIn);
  view.dom.addEventListener("focusout", handleBlur);

  return {
    getContent: () => view.state.doc.toString(),
    replaceDocument(nextContent: string) {
      isCompositionGuardActive = false;
      hasPendingDerivedStateFlush = false;
      const nextState = createState(nextContent);
      blockMap = parseBlockMap(nextState.doc.toString());

      view.setState(nextState);
      notifyActiveBlockChange(
        createActiveBlockStateFromBlockMap(blockMap, createSelectionSnapshot(nextState)),
        true
      );
      applyBlockDecorations(true);
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
      if (
        !runCodeFenceEnter(view, activeBlockState) &&
        !runListEnter(view) &&
        !runBlockquoteEnter(view)
      ) {
        insertNewlineAndIndent(view);
      }
    },
    pressBackspace() {
      if (!runCodeFenceBackspace(view, activeBlockState)) {
        deleteCharBackward(view);
      }
    },
    destroy() {
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionupdate", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("focusin", handleFocusIn);
      view.dom.removeEventListener("focusout", handleBlur);
      view.destroy();
    }
  };
}

function getInactiveHeadingMarkerEnd(startOffset: number, depth: number, source: string): number {
  let endOffset = startOffset + depth;

  while (endOffset < source.length) {
    const character = source[endOffset];
    if (character !== " " && character !== "\t") {
      break;
    }
    endOffset += 1;
  }

  return endOffset;
}

type InactiveBlockquoteLine = {
  lineStart: number;
  markerEnd: number;
  isFirstLine: boolean;
  isLastLine: boolean;
};

type InactiveCodeFenceLine = {
  lineStart: number;
  lineEnd: number;
  kind: "fence" | "content";
  isFirstContentLine: boolean;
  isLastContentLine: boolean;
};

function getInactiveBlockquoteLines(
  startOffset: number,
  endOffset: number,
  source: string
): InactiveBlockquoteLine[] {
  const lines: InactiveBlockquoteLine[] = [];
  let cursor = startOffset;
  let isFirstLine = true;

  while (cursor < endOffset) {
    const nextBreak = source.indexOf("\n", cursor);
    const lineEnd = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak;
    const lineText = source.slice(cursor, lineEnd);
    const markerMatch = /^\s{0,3}>\s?/.exec(lineText);
    const markerEnd = cursor + (markerMatch?.[0].length ?? 0);
    const nextCursor = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak + 1;

    lines.push({
      lineStart: cursor,
      markerEnd,
      isFirstLine,
      isLastLine: nextCursor >= endOffset
    });

    cursor = nextCursor;
    isFirstLine = false;
  }

  return lines;
}

function getInactiveCodeFenceLines(
  startOffset: number,
  endOffset: number,
  source: string
): InactiveCodeFenceLine[] {
  const lines = getBlockLineInfos(startOffset, endOffset, source);

  if (lines.length === 0) {
    return [];
  }

  const lastIndex = lines.length - 1;

  return lines.map((line, index) => ({
    lineStart: line.lineStart,
    lineEnd: line.lineEnd,
    kind: index === 0 || index === lastIndex ? "fence" : "content",
    isFirstContentLine: index === 1,
    isLastContentLine: index === lastIndex - 1
  }));
}

function getBlockLineInfos(
  startOffset: number,
  endOffset: number,
  source: string
): Array<{ lineStart: number; lineEnd: number }> {
  const lines: Array<{ lineStart: number; lineEnd: number }> = [];
  let cursor = startOffset;

  while (cursor < endOffset) {
    const nextBreak = source.indexOf("\n", cursor);
    const lineEnd = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak;

    lines.push({
      lineStart: cursor,
      lineEnd
    });

    if (nextBreak === -1 || nextBreak >= endOffset) {
      break;
    }

    cursor = nextBreak + 1;
  }

  return lines;
}

type ParsedListLine =
  | {
      indent: string;
      marker: string;
      task: null;
      content: string;
    }
  | {
      indent: string;
      marker: string;
      task: {
        checked: boolean;
      };
      content: string;
    };

const LIST_LINE_PATTERN = /^(\s*)([*+-]|\d+[.)])(?:[ \t]+|$)(.*)$/;
const TASK_CONTENT_PATTERN = /^\[( |x|X)\](?:[ \t]+|$)(.*)$/;
const BLOCKQUOTE_LINE_PATTERN = /^(\s{0,3})>(?:[ \t]?)(.*)$/;
const CODE_FENCE_LINE_PATTERN = /^(\s{0,3})(`{3,}|~{3,})([^\n]*)$/;

function runCodeFenceEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const activeCodeFence =
    activeState.activeBlock?.type === "codeFence" ? activeState.activeBlock : null;
  if (activeCodeFence && isClosedCodeFenceBlock(view.state.doc.toString(), activeCodeFence)) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to) {
    return false;
  }

  const parsed = parseCodeFenceLine(line.text);
  if (!parsed) {
    return false;
  }

  const closingFence = `${parsed.indent}${parsed.fence}`;
  const insertAt = selection.head;
  const insertText = `\n\n${closingFence}`;
  const nextAnchor = insertAt + 1;

  view.dispatch({
    changes: {
      from: insertAt,
      to: insertAt,
      insert: insertText
    },
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

function runCodeFenceBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const lineStart = getBackspaceLineStart(view.state, selection.head, line.from);

  if (selection.head !== lineStart) {
    return false;
  }

  const adjacentCodeFence = getAdjacentClosedCodeFenceBlock(
    activeState,
    lineStart,
    view.state.doc.toString()
  );
  if (!adjacentCodeFence) {
    return false;
  }

  const source = view.state.doc.toString();
  const nextAnchor = getCodeFenceEditableAnchor(source, adjacentCodeFence);

  view.dispatch({
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

function getBackspaceLineStart(state: EditorState, selectionHead: number, lineStart: number): number {
  if (
    selectionHead === state.doc.length &&
    selectionHead > 0 &&
    state.doc.sliceString(selectionHead - 1, selectionHead) === "\n"
  ) {
    return selectionHead;
  }

  return lineStart;
}

function runListEnter(view: EditorView): boolean {
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

function runBlockquoteEnter(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const parsed = parseBlockquoteLine(line.text);
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

  const continuationPrefix = `${parsed.indent}> `;
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

function parseListLine(text: string): ParsedListLine | null {
  const match = LIST_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const indent = match[1] ?? "";
  const marker = match[2] ?? "-";
  const remainder = match[3] ?? "";
  const taskMatch = TASK_CONTENT_PATTERN.exec(remainder);

  if (!taskMatch) {
    return {
      indent,
      marker,
      task: null,
      content: remainder
    };
  }

  return {
    indent,
    marker,
    task: {
      checked: taskMatch[1]?.toLowerCase() === "x"
    },
    content: taskMatch[2] ?? ""
  };
}

function parseBlockquoteLine(text: string): { indent: string; content: string } | null {
  const match = BLOCKQUOTE_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  return {
    indent: match[1] ?? "",
    content: match[2] ?? ""
  };
}

function parseCodeFenceLine(text: string): { indent: string; fence: string } | null {
  const match = CODE_FENCE_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  return {
    indent: match[1] ?? "",
    fence: match[2] ?? "```"
  };
}

function getAdjacentClosedCodeFenceBlock(
  activeState: ActiveBlockState,
  lineStart: number,
  source: string
): Extract<ActiveBlockState["activeBlock"], { type: "codeFence" }> | null {
  if (
    activeState.activeBlock?.type === "codeFence" &&
    activeState.activeBlock.startOffset === lineStart
  ) {
    return null;
  }

  for (const block of [...activeState.blockMap.blocks].reverse()) {
    if (block.type !== "codeFence") {
      continue;
    }

    const blockLines = getBlockLineInfos(block.startOffset, block.endOffset, source);
    const closingFenceLine = blockLines.at(-1);
    const separatorLineStart = closingFenceLine ? closingFenceLine.lineEnd + 1 : block.endOffset;

    if (separatorLineStart !== lineStart) {
      continue;
    }

    return isClosedCodeFenceBlock(source, block) ? block : null;
  }

  return null;
}

function getCodeFenceEditableAnchor(
  source: string,
  block: Extract<ActiveBlockState["activeBlock"], { type: "codeFence" }>
): number {
  const lines = getBlockLineInfos(block.startOffset, block.endOffset, source);

  if (lines.length >= 3) {
    return lines[lines.length - 2]!.lineEnd;
  }

  return lines[0]?.lineEnd ?? block.endOffset;
}

function isClosedCodeFenceBlock(
  source: string,
  block: Extract<ActiveBlockState["activeBlock"], { type: "codeFence" }>
): boolean {
  const blockSource = source.slice(block.startOffset, block.endOffset);
  const lines = blockSource.split("\n");
  const nonEmptyLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.length > 0);
  const firstEntry = nonEmptyLines[0];
  const lastEntry = nonEmptyLines.at(-1);
  const firstLine = firstEntry?.line ?? "";
  const lastLine = lastEntry?.line ?? "";
  const openingFence = parseCodeFenceLine(firstLine);
  const closingFence = parseCodeFenceLine(lastLine);

  if (!openingFence || !closingFence || !firstEntry || !lastEntry || firstEntry.index === lastEntry.index) {
    return false;
  }

  if (openingFence.indent !== closingFence.indent) {
    return false;
  }

  if (openingFence.fence[0] !== closingFence.fence[0]) {
    return false;
  }

  return closingFence.fence.length >= openingFence.fence.length;
}

function buildContinuationPrefix(parsed: ParsedListLine): string {
  const basePrefix = `${parsed.indent}${incrementListMarker(parsed.marker)} `;

  if (!parsed.task) {
    return basePrefix;
  }

  return `${basePrefix}[ ] `;
}

function incrementListMarker(marker: string): string {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);
  if (!orderedMatch) {
    return marker;
  }

  return `${Number.parseInt(orderedMatch[1] ?? "1", 10) + 1}${orderedMatch[2] ?? "."}`;
}

import type { EditorView } from "@codemirror/view";

import type { MarkdownNode } from "@fishmark/markdown-engine";

import type { ActiveBlockState, EditorDerivedSnapshot } from "@fishmark/editor-model";

export type PointerInteractionContext = {
  view: EditorView;
  activeState: ActiveBlockState;
  snapshot: EditorDerivedSnapshot;
  source: string;
  target: Element;
  event: MouseEvent;
  lineElement: HTMLElement;
  lineStart: number;
  lineEnd: number;
  /** Canonical root-level block whose line span owns the clicked line, if any. */
  lineBlock: MarkdownNode | null;
  rect: DOMRect;
  paddingLeft: number;
  paddingTop: number;
  paddingBottom: number;
};

export type VerticalInteractionContext = {
  view: EditorView;
  activeState: ActiveBlockState;
  snapshot: EditorDerivedSnapshot;
  source: string;
  /** Canonical root-level block that owns the selection, matching the projection's active block. */
  activeBlock: MarkdownNode | null;
  lineStart: number;
  lineEnd: number;
  goalColumn: number | undefined;
};

export type VerticalNavigationResult = {
  anchor: number;
  goalColumn: number | undefined;
};

export type BlockInteractionAdapter = {
  resolvePointerSelection?: (context: PointerInteractionContext) => number | null;
  resolveArrowUp?: (context: VerticalInteractionContext) => VerticalNavigationResult | number | null;
  resolveArrowDown?: (context: VerticalInteractionContext) => VerticalNavigationResult | number | null;
};

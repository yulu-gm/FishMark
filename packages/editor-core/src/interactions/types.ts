import type { EditorView } from "@codemirror/view";

import type { MarkdownBlock, MarkdownDocument } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";

export type PointerInteractionContext = {
  view: EditorView;
  activeState: ActiveBlockState;
  source: string;
  document: MarkdownDocument;
  target: Element;
  event: MouseEvent;
  lineElement: HTMLElement;
  lineStart: number;
  lineEnd: number;
  lineBlock: MarkdownBlock | null;
  rect: DOMRect;
  paddingLeft: number;
  paddingTop: number;
  paddingBottom: number;
};

export type VerticalInteractionContext = {
  view: EditorView;
  activeState: ActiveBlockState;
  source: string;
  document: MarkdownDocument;
  activeBlock: MarkdownBlock | null;
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

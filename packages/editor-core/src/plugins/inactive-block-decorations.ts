import type { DecorationSet } from "@codemirror/view";

import type { BlockMapCache } from "../derived-state/block-map-cache";
import {
  createActiveBlockStateFromBlockMap,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active-block";
import { createBlockDecorations } from "../decorations";

export type DeriveInactiveBlockDecorationsStateOptions = {
  source: string;
  selection: ActiveBlockSelection;
  hasEditorFocus: boolean;
  blockMapCache: BlockMapCache;
};

export type InactiveBlockDecorationsDerivedState = {
  activeBlockState: ActiveBlockState;
  decorationSet: DecorationSet;
  signature: string;
};

export function deriveInactiveBlockDecorationsState(
  options: DeriveInactiveBlockDecorationsStateOptions
): InactiveBlockDecorationsDerivedState {
  const blockMap = options.blockMapCache.read(options.source);
  const activeBlockState = createActiveBlockStateFromBlockMap(blockMap, options.selection);
  const { decorationSet, signature } = createBlockDecorations({
    activeBlockState,
    hasEditorFocus: options.hasEditorFocus,
    source: options.source
  });

  return {
    activeBlockState,
    decorationSet,
    signature
  };
}

export { createBlockDecorations, type BlockDecorationsResult } from "./block-decorations";
export { createInactiveInlineDecorations } from "./inline-decorations";
export { createTableWidgetDecoration, type TableWidgetCallbacks } from "./table-widget";
export {
  getBlockLineInfos,
  getInactiveBlockquoteLines,
  getInactiveCodeFenceLines,
  type BlockLineInfo,
  type InactiveBlockquoteLine,
  type InactiveCodeFenceLine
} from "@fishmark/editor-model";
export {
  createBlockDecorationSignature,
  getInactiveHeadingMarkerEnd
} from "./signature";

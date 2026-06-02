import type { BlockMap } from "./block-map";
import type { FootnoteDefinition, InlineReferenceDefinition } from "./inline-ast";

export interface MarkdownDocument {
  blocks: BlockMap["blocks"];
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
}

export type { BlockMap };

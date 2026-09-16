import { childrenOf, type MarkdownDocumentTree } from "../model/document-tree";
import type { MarkdownNode } from "../model/markdown-node";

// A checkpoint is a line start the incremental parser can safely resume from: outside every
// container and outside any open fence. Checkpoints bound the reparse window so an edit never
// strands an unterminated container or fence.
export interface OpenFence {
  readonly kind: "code-fence" | "block-math";
  readonly marker: string;
}

export interface ParseCheckpoint {
  readonly offset: number;
  readonly lineNumber: number;
  readonly containerDepth: number;
  readonly openFence: OpenFence | null;
}

export function isSafeCheckpoint(checkpoint: ParseCheckpoint): boolean {
  return checkpoint.containerDepth === 0 && checkpoint.openFence === null;
}

export function collectParseCheckpoints(
  source: string,
  tree: MarkdownDocumentTree
): readonly ParseCheckpoint[] {
  const checkpoints: ParseCheckpoint[] = [];
  let lineNumber = 1;
  let lineStart = 0;
  let openFence: OpenFence | null = null;

  for (let offset = 0; offset <= source.length; offset += 1) {
    const atLineEnd = offset === source.length || source[offset] === "\n";
    if (atLineEnd) {
      const lineText = source.slice(lineStart, offset);
      if (openFence === null) {
        openFence = openFenceFromLine(lineText);
      } else if (isFenceClose(lineText, openFence.marker)) {
        openFence = null;
      }
      checkpoints.push(
        Object.freeze({
          offset: lineStart,
          lineNumber,
          containerDepth: containerDepthAt(tree, lineStart),
          openFence
        })
      );
      lineNumber += 1;
      lineStart = offset + 1;
    }
  }

  return Object.freeze(checkpoints);
}

export function findCheckpointBefore(
  checkpoints: readonly ParseCheckpoint[],
  offset: number
): ParseCheckpoint | null {
  let match: ParseCheckpoint | null = null;
  for (const checkpoint of checkpoints) {
    if (checkpoint.offset > offset) break;
    if (isSafeCheckpoint(checkpoint)) match = checkpoint;
  }
  return match;
}

export function findCheckpointAfter(
  checkpoints: readonly ParseCheckpoint[],
  offset: number
): ParseCheckpoint | null {
  for (const checkpoint of checkpoints) {
    if (checkpoint.offset >= offset && isSafeCheckpoint(checkpoint)) return checkpoint;
  }
  return null;
}

function containerDepthAt(tree: MarkdownDocumentTree, offset: number): number {
  let depth = 0;
  let candidate: MarkdownNode = tree.root;
  for (;;) {
    const next: MarkdownNode | undefined = childrenOf(candidate).find(
      (child) => offset >= child.source.startOffset && offset < child.source.endOffset
    );
    if (next === undefined) break;
    if (next.kind !== "document") depth += 1;
    candidate = next;
  }
  return depth;
}

function openFenceFromLine(lineText: string): OpenFence | null {
  const trimmed = lineText.trimStart();
  const fence = /^(`{3,}|~{3,})/u.exec(trimmed);
  if (fence !== null) return { kind: "code-fence", marker: fence[1] ?? "```" };
  if (trimmed.startsWith("$$")) return { kind: "block-math", marker: "$$" };
  return null;
}

function isFenceClose(lineText: string, marker: string): boolean {
  const trimmed = lineText.trim();
  if (marker === "$$") return trimmed === "$$" || trimmed.endsWith("$$");
  const closing = /^(`{3,}|~{3,})$/u.exec(trimmed);
  return closing !== null && (closing[1] ?? "").length >= marker.length;
}

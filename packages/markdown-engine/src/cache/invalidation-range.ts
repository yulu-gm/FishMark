import type { MarkdownDocumentTree } from "../model/document-tree";
import {
  collectParseCheckpoints,
  findCheckpointAfter,
  findCheckpointBefore,
  type ParseCheckpoint
} from "../parse/parse-checkpoint";

export interface TextEdit {
  readonly fromOffset: number;
  readonly toOffset: number;
  readonly insertedText: string;
}

// The minimal region that must be reparsed. Its bounds are always safe checkpoints in the old
// source, so the reparsed window can never strand a container or fence.
export interface InvalidationWindow {
  readonly oldStart: number;
  readonly oldEnd: number;
  readonly newStart: number;
  readonly newEnd: number;
  readonly delta: number;
  readonly before: ParseCheckpoint;
  readonly after: ParseCheckpoint;
}

export function computeInvalidationWindow(
  source: string,
  tree: MarkdownDocumentTree,
  edit: TextEdit
): InvalidationWindow | null {
  if (
    !Number.isSafeInteger(edit.fromOffset) ||
    !Number.isSafeInteger(edit.toOffset) ||
    edit.fromOffset < 0 ||
    edit.toOffset < edit.fromOffset ||
    edit.toOffset > source.length
  ) {
    return null;
  }

  const checkpoints = collectParseCheckpoints(source, tree);
  const before = findCheckpointBefore(checkpoints, edit.fromOffset);
  const after = findCheckpointAfter(checkpoints, edit.toOffset);
  if (before === null || after === null || after.offset < before.offset) {
    return null;
  }

  const delta = edit.insertedText.length - (edit.toOffset - edit.fromOffset);
  return Object.freeze({
    oldStart: before.offset,
    oldEnd: after.offset,
    newStart: before.offset,
    newEnd: after.offset + delta,
    delta,
    before,
    after
  });
}

export function applyTextEdit(source: string, edit: TextEdit): string {
  return (
    source.slice(0, edit.fromOffset) +
    edit.insertedText +
    source.slice(edit.toOffset)
  );
}

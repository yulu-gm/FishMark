import { Decoration, type DecorationSet } from "@codemirror/view";
import { type Range } from "@codemirror/state";

import type { ActiveBlockState } from "../active-block";
import { getInactiveBlockquoteLines, getInactiveCodeFenceLines } from "./block-lines";
import {
  createCjkTextDecorations,
  createInactiveInlineDecorations
} from "./inline-decorations";
import {
  createActiveHtmlImagePreviewDecoration,
  createActiveInlineImageDecorations,
  createInactiveHtmlImagePreviewDecoration
} from "./image-widgets";
import {
  createBlockDecorationSignature,
  getInactiveHeadingMarkerEnd
} from "./signature";

export type CreateBlockDecorationsOptions = {
  activeBlockState: ActiveBlockState;
  hasEditorFocus: boolean;
  source: string;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
};

export type BlockDecorationsResult = {
  decorationSet: DecorationSet;
  signature: string;
};

export function createBlockDecorations(
  options: CreateBlockDecorationsOptions
): BlockDecorationsResult {
  const { activeBlockState, hasEditorFocus, source, resolveImagePreviewUrl } = options;
  const activeBlockId = hasEditorFocus ? activeBlockState.activeBlock?.id ?? null : null;
  const activeCodeFenceInContentEdit =
    hasEditorFocus &&
    activeBlockState.activeBlock?.type === "codeFence" &&
    isCodeFenceContentSelection(activeBlockState.activeBlock, activeBlockState.selection.head, source);
  const ranges: Range<Decoration>[] = [];
  const signatures: string[] = [];

  for (const block of activeBlockState.blockMap.blocks) {
    if (block.id === activeBlockId) {
      if (activeCodeFenceInContentEdit && block.type === "codeFence") {
        signatures.push(`${createBlockDecorationSignature(block)}:content-edit`);
        appendCodeFenceDecorations(block.startOffset, block.endOffset, source, ranges);
        continue;
      }

      appendActiveDecorationsForBlock(block, source, ranges, resolveImagePreviewUrl);
      continue;
    }

    signatures.push(createBlockDecorationSignature(block));

    if (block.type === "htmlImage") {
      ranges.push(createInactiveHtmlImagePreviewDecoration(block, resolveImagePreviewUrl));
      continue;
    }

    if (block.type === "heading") {
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
      ranges.push(...createInactiveInlineDecorations(block.inline, { resolveImagePreviewUrl }));
      continue;
    }

    if (block.type === "paragraph") {
      ranges.push(
        Decoration.line({
          attributes: {
            class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
          }
        }).range(block.startOffset)
      );
      ranges.push(...createInactiveInlineDecorations(block.inline, { resolveImagePreviewUrl }));
      continue;
    }

    if (block.type === "list") {
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

        ranges.push(...createInactiveInlineDecorations(item.inline, { resolveImagePreviewUrl }));
      }

      continue;
    }

    if (block.type === "blockquote") {
      if (block.lines) {
        const lineCount = block.lines.length;

        block.lines.forEach((line, index) => {
          const lineClasses = ["cm-inactive-blockquote"];

          if (index === 0) {
            lineClasses.push("cm-inactive-blockquote-start");
          }

          if (index === lineCount - 1) {
            lineClasses.push("cm-inactive-blockquote-end");
          }

          ranges.push(
            Decoration.line({
              attributes: {
                class: lineClasses.join(" ")
              }
            }).range(line.startOffset)
          );

          if (line.markerEnd > line.startOffset) {
            ranges.push(
              Decoration.mark({
                attributes: {
                  class: "cm-inactive-blockquote-marker"
                }
              }).range(line.startOffset, line.markerEnd)
            );
          }

          ranges.push(...createInactiveInlineDecorations(line.inline, { resolveImagePreviewUrl }));
        });
        continue;
      }

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

      continue;
    }

    if (block.type === "codeFence") {
      appendCodeFenceDecorations(block.startOffset, block.endOffset, source, ranges);
      continue;
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: "cm-inactive-thematic-break"
        }
      }).range(block.startOffset)
    );

    if (block.endOffset > block.startOffset) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-thematic-break-marker"
          }
        }).range(block.startOffset, block.endOffset)
      );
    }
  }

  return {
    decorationSet: Decoration.set(ranges, true),
    signature: signatures.join("|")
  };
}

function appendCodeFenceDecorations(
  startOffset: number,
  endOffset: number,
  source: string,
  ranges: Range<Decoration>[]
): void {
  for (const line of getInactiveCodeFenceLines(startOffset, endOffset, source)) {
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

function isCodeFenceContentSelection(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "codeFence" }>,
  selectionHead: number,
  source: string
): boolean {
  const line = getInactiveCodeFenceLines(block.startOffset, block.endOffset, source).find(
    (entry) => selectionHead >= entry.lineStart && selectionHead <= entry.lineEnd
  );

  return line?.kind === "content";
}

function appendActiveDecorationsForBlock(
  block: NonNullable<ActiveBlockState["activeBlock"]>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  if (block.type === "heading" || block.type === "paragraph") {
    ranges.push(...createActiveInlineImageDecorations(block.inline, source, resolveImagePreviewUrl));
    ranges.push(...createCjkTextDecorations(block.inline));
    return;
  }

  if (block.type === "htmlImage") {
    ranges.push(createActiveHtmlImagePreviewDecoration(block, source, resolveImagePreviewUrl));
    return;
  }

  if (block.type === "list") {
    for (const item of block.items) {
      ranges.push(...createActiveInlineImageDecorations(item.inline, source, resolveImagePreviewUrl));
      ranges.push(...createCjkTextDecorations(item.inline));
    }
    return;
  }

  if (block.type === "blockquote" && block.lines) {
    for (const line of block.lines) {
      ranges.push(...createActiveInlineImageDecorations(line.inline, source, resolveImagePreviewUrl));
      ranges.push(...createCjkTextDecorations(line.inline));
    }
  }
}

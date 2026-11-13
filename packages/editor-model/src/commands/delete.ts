import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";
import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan
} from "../transactions/edit-transaction-plan";
import { graphemeDeletionRange } from "./grapheme-deletion";
import { lastOfKind, lineContainerChain } from "./line-structure";

// 字符删除和结构边界分开处理；能合并的边界仍沿用当前行的格式。
export type DeletePlanKind = "default" | "range-delete" | "line-join";

export interface DeleteDecision {
  readonly kind: DeletePlanKind;
  readonly plan: EditTransactionPlan;
}

export function planDelete(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideDelete(context)?.plan ?? null;
}

export function decideDelete(context: EditorSemanticContext): DeleteDecision | null {
  const selection = context.selectionContext;
  const line = context.lineAt(selection.activeOffset);

  if (line === null) {
    return null;
  }

  if (!selection.empty) {
    return rangeDelete(context, selection.from, selection.to);
  }

  const offset = selection.activeOffset;

  const node = line.nodeId ? context.nodeById(line.nodeId) : null;
  const headingEnd = node?.kind === "heading" && context.lineAt(node.content.endOffset)?.lineNumber === line.lineNumber
    ? node.content.endOffset : null;
  const atHeadingEnd = headingEnd !== null && offset === headingEnd;
  // 标题可见文字的末尾可能还有隐藏的 ATX 尾标记，或下一行的 Setext 下划线。
  if (offset < line.contentEndOffset && !atHeadingEnd) {
    const range = graphemeDeletionRange(context.source, line, offset, "forward");
    return range === null ? null : rangeDelete(context, range.from, range.to, "default");
  }

  // 2. At the end of the line, join the next line into this one.
  const lastLine = atHeadingEnd && node ? context.lineAt(node.source.endOffset) ?? line : line;
  const nextLine = context.lineAt(lastLine.range.endOffset);

  if (nextLine === null || nextLine.lineNumber === lastLine.lineNumber) {
    return null;
  }

  let joinTo = nextLine.contentStartOffset;
  const chain = lineContainerChain(context, line);
  // 代码正文最后一行的下一物理行是结束围栏，不能与代码正文拼接。
  if (line.role === "fence-content" && nextLine.role === "fence-close" && line.nodeId === nextLine.nodeId) {
    const below = context.lines.lines[nextLine.lineNumber];
    return { kind: "line-join", plan: boundaryNavigation(context, "forward", below?.contentStartOffset ?? offset) };
  }
  let following = nextLine;
  // 只越过纯空行做边界判定，不把有空格或容器前缀的行当成可吞掉的分隔。
  while (following.range.startOffset === following.contentEndOffset && context.lines.lines[following.lineNumber]) {
    following = context.lines.lines[following.lineNumber]!;
  }
  const block = blockDeletionBoundary(context, lastLine, following, "forward");
  if (block !== null) return { kind: "line-join", plan: block };

  const nextNode = following.nodeId ? context.nodeById(following.nodeId) : null;
  if (node?.kind === "paragraph" && nextNode?.kind === "heading" &&
      nextNode.content.startOffset > following.range.startOffset && !line.segments.length && !following.segments.length &&
      following.lineNumber <= line.lineNumber + 2) {
    // 正文合并紧邻的 ATX 标题时只带标题文字，尾部的 ### 同样不应出现在正文。
    return { kind: "line-join", plan: createEditTransactionPlan({ context, commandId: "delete", intent: "structural",
      edits: [{ from: line.contentEndOffset, to: nextNode.content.startOffset, insert: "" },
        ...(nextNode.content.endOffset < following.contentEndOffset
          ? [{ from: nextNode.content.endOffset, to: following.contentEndOffset, insert: "" }] : [])],
      selection: { anchor: line.contentEndOffset, head: line.contentEndOffset } }) };
  }
  if (headingEnd !== null && nextNode?.kind === "paragraph" && !line.segments.length && !following.segments.length &&
      following.lineNumber <= line.lineNumber + 2 && (atHeadingEnd || offset === line.contentEndOffset) &&
      /^(?:\r?\n){1,2}$/u.test(context.source.slice(line.contentEndOffset, following.range.startOffset))) {
    return { kind: "line-join", plan: joinParagraphIntoHeading(context, line, following, headingEnd, "forward") };
  }
  if (following === nextLine) {
    const nextChain = lineContainerChain(context, nextLine);
    const item = lastOfKind(nextChain, "list-item");
    const quoteDepth = (entry: PhysicalLine) => entry.segments.filter(segment => segment.kind === "quote-marker").length;
    // 不删任务标记，也不把子列表或更深引用的第一行拽进上一行。
    const quote = lastOfKind(nextChain, "blockquote");
    const opensMultilineQuote = quote && !chain.includes(quote) && quote.source.endOffset > nextLine.contentEndOffset;
    const entersNestedList = item && lastOfKind(chain, "list-item") &&
      lastOfKind(chain, "list") !== lastOfKind(nextChain, "list");
    const isTask = item?.data.kind === "list-item" && item.data.checked !== null;
    if ((item && item !== lastOfKind(chain, "list-item") && (entersNestedList || isTask || listItemHasContinuation(context, item))) ||
        opensMultilineQuote || (quoteDepth(nextLine) !== quoteDepth(line) && Math.max(quoteDepth(nextLine), quoteDepth(line)) > 1)) {
      return { kind: "line-join", plan: boundaryNavigation(context, "forward", nextLine.contentStartOffset) };
    }
  }
  if (chain.length === 2 && chain[1]?.kind === "paragraph" &&
      nextLine.range.startOffset === nextLine.contentEndOffset) {
    const followingChain = lineContainerChain(context, following);
    // 普通段落之间按完整段落删除：单个分隔合并正文，额外空段落一次移除一对换行。
    // 含空格的行及列表、引用、围栏等块仍交给各自的结构规则。
    if (followingChain.length === 2 && followingChain[1]?.kind === "paragraph") {
      const blankCount = following.lineNumber - line.lineNumber - 1;
      if (blankCount === 1) joinTo = following.contentStartOffset;
      else if (blankCount % 2 === 1) joinTo = context.lines.lines[line.lineNumber + 1]!.range.startOffset;
    }
  }

  return {
    kind: "line-join",
    plan: createEditTransactionPlan({
      context,
      commandId: "delete",
      intent: "structural",
      // The break plus the next line's hidden prefix disappear, so the tail continues this leaf.
      edits: [{ from: line.contentEndOffset, to: joinTo, insert: "" }],
      selection: { anchor: line.contentEndOffset, head: line.contentEndOffset }
    })
  };
}

// 表格和围栏有不能拼到正文上的语法行。用两侧实际块身份判断，保留块内逐字删除。
export function blockDeletionBoundary(
  context: EditorSemanticContext, left: PhysicalLine, right: PhysicalLine, direction: "forward" | "backward"
): EditTransactionPlan | null {
  const leftNode = left.nodeId ? context.nodeById(left.nodeId) : null;
  const rightNode = right.nodeId ? context.nodeById(right.nodeId) : null;
  if (leftNode === rightNode) return null;
  const target = direction === "forward" ? rightNode : leftNode;
  const edge = direction === "forward" ? right : left;
  const isTable = leftNode?.kind === "table" || rightNode?.kind === "table";
  const isFence = leftNode?.kind === "code-fence" || rightNode?.kind === "code-fence";
  const isSetext = leftNode?.kind === "heading" && left.range.startOffset >= leftNode.content.endOffset ||
    rightNode?.kind === "heading" && context.lineAt(rightNode.content.endOffset)?.lineNumber !==
      context.lineAt(rightNode.source.endOffset)?.lineNumber;
  const gap = context.source.slice(left.contentEndOffset, right.range.startOffset);
  const leftChain = !isTable && !isFence && !isSetext && rightNode?.kind === "paragraph" && rightNode.path.length === 1 &&
    /^(?:\r?\n){2,}$/u.test(gap) ? lineContainerChain(context, left) : [];
  // 普通顶层列表项仍可合并下一段；嵌套子项和引用不能在删空行时悄悄吸收外部正文。
  const leavesContainer = leftChain[1]?.kind === "blockquote" ||
    leftChain.filter(node => node.kind === "list-item").length > 1;
  if (!isTable && !isFence && !isSetext && !leavesContainer) return null;

  // 围栏的常规空白分隔可以缩到一条换行；表格和缩进代码保留必要的空行，防止吞并相邻正文。
  const needsBlank = isTable || isSetext || leavesContainer ||
    (leftNode?.data.kind === "code-fence" && leftNode.data.fence === "indented") ||
    (rightNode?.data.kind === "code-fence" && rightNode.data.fence === "indented");
  if (gap && /^(?:\r?\n)+$/u.test(gap)) {
    const breaks = gap.match(/\r?\n/gu)!;
    if (breaks.length > (needsBlank ? 2 : 1)) {
      const forward = direction === "forward";
      const from = forward ? left.contentEndOffset : right.range.startOffset - breaks[breaks.length - 1]!.length;
      const to = forward ? from + breaks[0]!.length : right.range.startOffset;
      return createEditTransactionPlan({ context, commandId: forward ? "delete" : "backspace", intent: "structural",
        edits: [{ from, to, insert: "" }], selection: { anchor: from, head: from } });
    }
  }

  let anchor = direction === "forward" ? edge.contentStartOffset : edge.contentEndOffset;
  if (target?.data.kind === "table") {
    const row = direction === "forward" ? target.data.header : target.data.rows.at(-1) ?? target.data.header;
    const cell = direction === "forward" ? row[0] : row.at(-1);
    if (cell) anchor = direction === "forward" ? cell.content.startOffset : cell.content.endOffset;
  } else if (target?.data.kind === "code-fence" && target.data.fence === "fenced") {
    const body = context.lines.lineForNode(target).filter(line => line.role === "fence-content");
    const line = direction === "forward" ? body[0] : body.at(-1);
    if (line) anchor = direction === "forward" ? line.contentStartOffset : line.contentEndOffset;
  } else if (target?.kind === "heading") {
    anchor = direction === "forward" ? target.content.startOffset : target.content.endOffset;
  }
  return boundaryNavigation(context, direction, anchor);
}

export function joinParagraphIntoHeading(
  context: EditorSemanticContext, left: PhysicalLine, right: PhysicalLine, anchor: number,
  direction: "forward" | "backward"
): EditTransactionPlan {
  // 把首行正文放在 ATX 尾标记前，避免把可见文字塞到闭合标记之后。
  return createEditTransactionPlan({ context, commandId: direction === "forward" ? "delete" : "backspace", intent: "structural",
    edits: [{ from: anchor, to: right.contentEndOffset,
      insert: context.source.slice(right.contentStartOffset, right.contentEndOffset) + context.source.slice(anchor, left.contentEndOffset) }],
    selection: { anchor, head: anchor } });
}

export function boundaryNavigation(
  context: EditorSemanticContext, direction: "forward" | "backward", anchor: number
): EditTransactionPlan {
  return createEditTransactionPlan({ context, commandId: direction === "forward" ? "delete" : "backspace",
    intent: "navigation", edits: [], selection: { anchor, head: anchor } });
}

export function listItemHasContinuation(context: EditorSemanticContext, item: MarkdownNode): boolean {
  return item.data.kind === "list-item" && (childrenOf(item).length > 1 ||
    context.lines.lineForNode(item).some(line => line.range.startOffset > item.source.startOffset &&
      line.contentEndOffset > line.contentStartOffset));
}

function rangeDelete(
  context: EditorSemanticContext,
  from: number,
  to: number,
  kind: DeletePlanKind = "range-delete"
): DeleteDecision {
  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "delete",
      intent: kind === "default" ? "edit" : "structural",
      edits: [{ from, to, insert: "" }],
      selection: { anchor: from, head: from }
    })
  };
}

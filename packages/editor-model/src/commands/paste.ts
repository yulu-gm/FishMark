import { parseFullDocumentTree, type MarkdownNode } from "@fishmark/markdown-engine";
import type { EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditTransactionPlan, type EditTransactionPlan } from "../transactions/edit-transaction-plan";
import { continuationPrefix, lineContainerChain } from "./line-structure";

/**
 * 富文本转换后的 Markdown 粘贴。跨容器或触及结构标记时返回 null，供调用方回退纯文本。
 * 源码模式、代码块中的纯文本粘贴由入口选择，不在这里判断视图模式。
 */
export function planRichTextPaste(context: EditorSemanticContext, markdown: string): EditTransactionPlan | null {
  if (markdown.length === 0) return null;
  const { from, to } = context.selectionContext;
  const first = context.lineAt(from);
  const last = context.lineAt(to);
  if (!first || !last || from < first.contentStartOffset || to < last.contentStartOffset ||
      from > first.contentEndOffset || to > last.contentEndOffset) return null;

  const containers = lineContainerChain(context, first).filter(isPasteContainer);
  // 两端属于同一容器还不够：中间也不能跨子列表、围栏、表格等结构。
  for (const line of context.lines.lines.slice(first.lineNumber - 1, last.lineNumber)) {
    const chain = lineContainerChain(context, line);
    const owners = chain.filter(isPasteContainer);
    if (owners.length !== containers.length || owners.some((owner, index) => owner.id !== containers[index]?.id) ||
        chain.some(node => !["document", "list", "list-item", "blockquote", "paragraph"].includes(node.kind))) return null;
  }

  let insert = markdown.replace(/\r\n?/gu, "\n");
  let replaceFrom = from;
  const owner = containers.at(-1);
  if (owner) {
    const opening = context.lineAt(owner.source.startOffset);
    if (!opening) return null;
    const marker = owner.markers.find(marker =>
      marker.kind === (owner.kind === "list-item" ? "list-marker" : "blockquote"));
    const markerIndex = opening.segments.findIndex(segment => segment.range.startOffset === marker?.range.startOffset);
    if (markerIndex < 0) return null;
    const segment = opening.segments[markerIndex]!;
    const spacing = opening.segments[markerIndex + 1];
    // 只取该容器的标记及间距；任务框和同一行内更深的容器不计入续行缩进。
    let prefix = continuationPrefix(opening,
      spacing?.kind === "spacing" ? spacing.range.endOffset : segment.range.endOffset);
    // 空列表的标记虽已换成空格，仍需另留标记与正文之间的一格。
    if (spacing?.kind !== "spacing" || !/[ \t]$/u.test(prefix)) prefix += " ";

    // 片段沿用项目的 Markdown 解析器，只读首尾块类型，不另写语法识别规则。
    const blocks = parseFullDocumentTree(insert).root.children;
    const startsBlock = blocks[0] !== undefined && blocks[0].kind !== "paragraph";
    const endsBlock = blocks.at(-1) !== undefined && blocks.at(-1)!.kind !== "paragraph";
    if (startsBlock && context.source.slice(first.contentStartOffset, from).trim()) {
      insert = "\n\n" + insert.replace(/^\n+/u, "");
    } else if (startsBlock && first.lineNumber !== opening.lineNumber) {
      // 惰性续行可能没有完整前缀；仅替换行首前缀及空白，并隔开前段，
      // 让列表、围栏的首行和后续行都显式属于原容器。
      replaceFrom = first.range.startOffset;
      insert = prefix + "\n" + insert.replace(/^\n+/u, "");
    }
    if (endsBlock && context.source.slice(to, last.contentEndOffset).trim()) {
      insert = insert.replace(/\n+$/u, "") + "\n\n";
    } else if (endsBlock && to === last.contentEndOffset) {
      const next = context.lines.lines[last.lineNumber];
      if (next && context.source.slice(next.contentStartOffset, next.contentEndOffset).trim()) {
        const nextOwners = lineContainerChain(context, next).filter(isPasteContainer);
        if (nextOwners.at(-1)?.id === owner.id &&
            continuationPrefix(next) !== prefix) {
          // 未显式带容器前缀的惰性续行依赖上一段；这里不能加空行后让它脱离容器。
          return null;
        }
        // 原有下一行不能变成粘贴列表末项的惰性续行；插入空行分隔，原文不重写。
        insert = insert.replace(/\n+$/u, "") + "\n";
      }
    }
    // 容器首行复用原标记；续行行首已在上面补齐，其余换行统一补前缀。
    insert = insert.replace(/\n/gu, "\n" + prefix);
    if (owner.kind === "list-item" && from === segment.range.endOffset && spacing?.kind !== "spacing") {
      insert = " " + insert;
    }
  }
  const eol = context.source.slice(first.contentEndOffset, first.range.endOffset) ||
    (context.source.includes("\r\n") ? "\r\n" : "\n");
  insert = insert.replace(/\n/gu, eol);
  const caret = replaceFrom + insert.length;
  return createEditTransactionPlan({ context, commandId: "insert-text", intent: "edit",
    edits: [{ from: replaceFrom, to, insert }], selection: { anchor: caret, head: caret }, userEventName: "input.paste" });
}

function isPasteContainer(node: MarkdownNode): boolean {
  return node.kind === "list-item" || node.kind === "blockquote";
}

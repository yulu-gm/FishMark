import type { MarkdownBlock, MarkdownLeafNode, MarkdownTableCell } from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "@fishmark/editor-model";

// Widget inputs are presentation DTOs, never a second document tree. All ranges and
// inline nodes come directly from the revision's canonical leaf.
export function canonicalLeafView(node: MarkdownLeafNode, snapshot: EditorDerivedSnapshot): MarkdownBlock {
  const first = snapshot.lineAt(node.source.startOffset)!;
  const last = snapshot.lineAt(Math.max(node.source.startOffset, node.source.endOffset - 1))!;
  const base = { id: node.id, startOffset: first.range.startOffset, endOffset: node.source.endOffset,
    startLine: first.lineNumber, endLine: last.lineNumber };
  const data = node.data;
  switch (data.kind) {
    case "heading": return { ...base, type: "heading", depth: data.depth, inline: node.inline };
    case "paragraph": return { ...base, type: "paragraph", inline: node.inline };
    case "code-fence": return { ...base, type: "codeFence", kind: data.fence, info: data.info };
    case "block-math": {
      const opening = node.markers[0]?.range ?? node.source;
      const closing = node.markers.at(-1)?.range;
      return { ...base, type: "blockMath", value: data.value, closed: data.closed,
        contentStartOffset: node.content.startOffset, contentEndOffset: node.content.endOffset,
        markerStartOffset: opening.startOffset, markerEndOffset: opening.endOffset,
        closingMarkerStartOffset: data.closed ? closing?.startOffset ?? null : null,
        closingMarkerEndOffset: data.closed ? closing?.endOffset ?? null : null };
    }
    case "table": {
      const cell = (value: MarkdownTableCell) => ({ text: value.text, inline: value.inline,
        rowIndex: value.rowIndex, columnIndex: value.columnIndex, isHeader: value.isHeader,
        startOffset: value.source.startOffset, endOffset: value.source.endOffset,
        contentStartOffset: value.content.startOffset, contentEndOffset: value.content.endOffset });
      return { ...base, type: "table", columnCount: data.columnCount, hasHeader: data.hasHeader,
        rowSeparator: data.rowSeparator, alignments: data.alignments.map(value => value ?? "none"),
        header: data.header.map(cell), rows: data.rows.map(row => row.map(cell)) };
    }
    case "definition": return { ...base, type: "definition", footnoteDefinition: data.footnote };
    case "thematic-break": return { ...base, type: "thematicBreak", marker: data.marker };
    case "html-image": return { ...base, ...data, type: "htmlImage" };
    default: throw new Error(`Container ${node.id} cannot be passed to a leaf widget`);
  }
}

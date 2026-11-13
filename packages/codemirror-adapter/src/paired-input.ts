import { closeBrackets, deleteBracketPair, insertBracket } from "@codemirror/autocomplete";
import { Annotation, EditorState, Facet, Prec, type Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import type { InlineASTNode, InlineCodeSpan, InlineMath } from "@fishmark/markdown-engine";
import { readCompositionState, readEditorStructureCache } from "./transaction-adapter";

export type PairingOptions = { autoPairBrackets: boolean; autoPairMarkdown: boolean };
export const pairedInputSelection = Annotation.define<boolean>();
export const pairingOptions = Facet.define<PairingOptions, PairingOptions>({
  combine: values => values[0] ?? { autoPairBrackets: false, autoPairMarkdown: false }
});

function escapedAt(state: EditorState, offset: number): boolean {
  const before = state.sliceDoc(state.doc.lineAt(offset).from, offset);
  return (before.match(/\\+$/u)?.[0].length ?? 0) % 2 === 1;
}

const markdownTokens = "*_`$";
const pairCandidates = "()[]{}\"'*_`$";

function markdownContext(state: EditorState, pos: number) {
  const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(state));
  const node = snapshot.nodeAt(pos);
  const inline = node && "inline" in node ? node.inline : snapshot.tableAt(pos)?.cell.inline;
  let literal: InlineCodeSpan | InlineMath | undefined;
  let closing = false;
  const visit = (entry: InlineASTNode): void => {
    if (pos < entry.startOffset || pos >= entry.endOffset) return;
    if ((entry.type === "codeSpan" || entry.type === "inlineMath") && pos > entry.startOffset) literal = entry;
    // 只允许跳过 AST 确认的闭标记；完整标记范围支持多反引号行内代码。
    if ((entry.type === "codeSpan" || entry.type === "inlineMath" || entry.type === "strong" || entry.type === "emphasis") &&
        pos >= entry.closeMarker.startOffset && pos < entry.closeMarker.endOffset) closing = true;
    if ("children" in entry) entry.children.forEach(visit);
  };
  if (inline) visit(inline);
  return { node, literal, closing, line: snapshot.lineAt(pos) };
}

function bracketsAt(state: EditorState, pos: number): string[] {
  if (state.readOnly || readCompositionState(state).active || escapedAt(state, pos)) return [];
  const options = state.facet(pairingOptions);
  const brackets = options.autoPairBrackets ? ["(", "[", "{", '"', "'"] : [];
  // 普通括号开关不依赖 Markdown 快照。
  if (!options.autoPairMarkdown) return brackets;
  const { node, literal, closing } = markdownContext(state, pos);
  // 代码块内的括号仍可配对，Markdown 标记则按代码原文输入。
  if (node?.kind !== "code-fence") {
    if (!literal) brackets.push("*", "_", "`", "$");
    else if (closing) brackets.push(literal.type === "codeSpan" ? "`" : "$");
  }
  return brackets;
}

export function pairedInputTransaction(state: EditorState, text: string): Transaction | null {
  if (text.length !== 1 || !pairCandidates.includes(text) || state.readOnly || readCompositionState(state).active) return null;
  const { from, empty } = state.selection.main;
  const tokens = bracketsAt(state, from);
  if (!tokens.length) return null;
  const markdown = markdownTokens.includes(text) && tokens.includes(text) ? markdownContext(state, from) : null;
  const contentStart = markdown?.line
    ? Math.max(markdown.line.contentStartOffset, markdown.node?.content.startOffset ?? markdown.line.contentStartOffset)
    : undefined;
  if (empty && text === "`" && contentStart !== undefined && state.sliceDoc(contentStart, from) === "``") {
    // 第三个反引号仍建立围栏，不能被行内代码配对变成四个反引号。
    return state.update({ changes: { from, insert: text }, selection: { anchor: from + 1 }, userEvent: "input.type" });
  }
  if (empty && markdown && state.sliceDoc(from, from + 1) === text) {
    const line = state.doc.lineAt(from);
    const before = state.sliceDoc(line.from, from);
    const after = state.sliceDoc(from, line.to);
    let left = 0, right = 0;
    while (before[before.length - left - 1] === text) left++;
    while (after[right] === text) right++;
    // 连续输入 ** 或 __ 扩成加粗，而不是第二次输入就跳出空配对。
    const beforePair = before.slice(0, before.length - left);
    if ((text === "*" || text === "_") && left > 0 && left === right && left < 3 &&
        (!beforePair || /[\s([{]$/u.test(beforePair))) {
      return state.update({ changes: { from, insert: text + text }, selection: { anchor: from + 1 }, userEvent: "input.type" });
    }
    // 跳过已存在的闭标记只移动光标；不制造内容变化，也不让隐藏标记归一化拉回光标。
    if (markdown.closing) {
      return state.update({ selection: { anchor: from + 1 }, annotations: pairedInputSelection.of(true), userEvent: "select" });
    }
  }
  return insertBracket(state, text);
}

export function createPairedInputExtension() {
  return [
    EditorState.languageData.of((state, pos) => [{ closeBrackets: { brackets: bracketsAt(state, pos), before: ")]}'\"`:;>" } }]),
    // CodeMirror 负责普通配对、包裹选区和配对退格；只补充 Markdown 连续标记的规则。
    Prec.high(EditorView.inputHandler.of((view, from, to, text) => {
      if (view.compositionStarted || from !== view.state.selection.main.from || to !== view.state.selection.main.to) return false;
      const transaction = pairedInputTransaction(view.state, text);
      if (!transaction) return false;
      view.dispatch(transaction);
      return true;
    })),
    closeBrackets(),
    Prec.high(keymap.of([{ key: "Backspace", run: view =>
      !view.compositionStarted && !readCompositionState(view.state).active && deleteBracketPair(view) }]))
  ];
}

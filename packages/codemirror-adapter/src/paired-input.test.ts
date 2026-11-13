import { EditorState } from "@codemirror/state";
import { expect, it, vi } from "vitest";
import { createPairedInputExtension, pairedInputTransaction, pairingOptions } from "./paired-input";
import * as transactionAdapter from "./transaction-adapter";

it("非候选字符及关闭 Markdown 后的普通括号不读取语义快照", () => {
  const state = (markdown: boolean) => EditorState.create({ extensions: [
    pairingOptions.of({ autoPairBrackets: true, autoPairMarkdown: markdown }), createPairedInputExtension()
  ] });
  const off = state(false), on = state(true);
  const read = vi.spyOn(transactionAdapter, "readEditorStructureCache");
  try {
    expect(pairedInputTransaction(on, "b")).toBeNull();
    expect(pairedInputTransaction(on, "中文")).toBeNull();
    expect(pairedInputTransaction(off, "(")?.newDoc.toString()).toBe("()");
    expect(read).not.toHaveBeenCalled();
  } finally { read.mockRestore(); }
});

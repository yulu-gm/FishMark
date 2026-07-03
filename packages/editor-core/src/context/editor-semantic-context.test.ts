import { parseMarkdownDocument } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { createPhysicalEditingDocument } from "../physical-editing-document";
import { createEditorSemanticContext } from "./editor-semantic-context";

describe("editor semantic context", () => {
  it("exposes a body code fence draft", () => {
    const source = "```ts";
    const context = createContext(source, source.length);

    expect(context.containers).toEqual([]);
    expect(context.leaf?.type).toBe("codeFence");
    expect(context.draft?.type).toBe("codeFenceOpener");
  });

  it("exposes a quote-internal code fence draft", () => {
    const source = "> ```ts";
    const context = createContext(source, source.length);

    expect(context.activeBlock?.type).toBe("blockquote");
    expect(context.containers.map((container) => container.type)).toEqual(["blockquote"]);
    expect(context.draft).toMatchObject({
      type: "codeFenceOpener",
      containerPrefix: "> ",
      contentPrefix: "> "
    });
  });

  it("exposes closed quote-internal code fence content lines as parser blocks", () => {
    const source = ["> ```ts", "> const answer = 42;", "> ```"].join("\n");
    const context = createContext(source, source.indexOf("answer"));

    expect(context.blockPath.map((entry) => entry.block.type)).toEqual([
      "blockquote",
      "codeFence"
    ]);
    expect(context.containers.map((container) => container.type)).toEqual(["blockquote"]);
    expect(context.leaf?.type).toBe("codeFence");
    expect(context.draft).toBeNull();
  });

  it("re-derives stale compatibility active block state instead of mixing contexts", () => {
    const source = "> quote";
    const markdownDocument = parseMarkdownDocument(source);
    const staleMarkdownDocument = parseMarkdownDocument("Paragraph");
    const staleActiveState = createActiveBlockStateFromMarkdownDocument(staleMarkdownDocument, {
      anchor: 0,
      head: 0
    });

    const context = createEditorSemanticContext({
      source,
      markdownDocument,
      selection: {
        anchor: source.indexOf("quote"),
        head: source.indexOf("quote")
      },
      activeState: staleActiveState
    });

    expect(context.activeBlock?.type).toBe("blockquote");
    expect(context.activeState.blockMap).toBe(markdownDocument);
  });

  it("re-derives editing documents with stale semantic line maps", () => {
    const source = "# Title";
    const markdownDocument = parseMarkdownDocument(source);
    const staleEditingDocument = createPhysicalEditingDocument(source);

    const context = createEditorSemanticContext({
      source,
      markdownDocument,
      selection: {
        anchor: source.indexOf("Title"),
        head: source.indexOf("Title")
      },
      editingDocument: staleEditingDocument
    });

    expect(context.editingDocument).not.toBe(staleEditingDocument);
    expect(context.editingDocument.semanticLineMap.byLineNumber.get(1)?.block?.type).toBe("heading");
  });
});

function createContext(source: string, cursor: number) {
  return createEditorSemanticContext({
    source,
    markdownDocument: parseMarkdownDocument(source),
    selection: {
      anchor: cursor,
      head: cursor
    }
  });
}

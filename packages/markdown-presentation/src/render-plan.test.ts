import { describe, expect, it } from "vitest";
import { createDocumentStructureCache, flattenMarkdownTree, isMarkdownLeafNode, parseFullDocumentTree } from "@fishmark/markdown-engine";
import { buildRenderPlan } from "./render-plan";

describe("canonical render plan", () => {
  it("retains every arbitrary container descendant and its authoritative payload", () => {
    const source = [
      "> - parent", ">   > quote", ">   >", ">   > ```ts", ">   > const x = 1", ">   > ```",
      ">   >", ">   > $$", ">   > x + y", ">   > $$", ">   >",
      ">   > | A | B |", ">   > | --- | --- |", ">   > | **x** | y |"
    ].join("\n");
    const tree = parseFullDocumentTree(source);
    const plan = buildRenderPlan(tree, { revision: 4 });
    const nodes = flattenMarkdownTree(tree);
    expect(plan.entries.map((entry) => entry.node)).toEqual(nodes);
    expect(plan.entries.map((entry) => entry.role)).toEqual(expect.arrayContaining(["container", "text", "code", "math", "table"]));
    for (const node of nodes) {
      const entry = plan.entryByNodeId.get(node.id)!;
      expect(entry.node).toBe(node);
      expect(entry.node.source).toBe(node.source);
      expect(entry.node.markers).toBe(node.markers);
      expect(entry.node.data).toBe(node.data);
      if (isMarkdownLeafNode(node)) {
        expect(entry.capabilities.includes("inline")).toBe(node.inline !== undefined);
        expect(isMarkdownLeafNode(entry.node) && entry.node.inline).toBe(node.inline);
      }
    }
    const table = plan.entries.find((entry) => entry.node.kind === "table")!;
    expect(plan.ancestorsOf(table.node.id).map((entry) => entry.node.kind)).toEqual([
      "document", "blockquote", "list", "list-item", "blockquote"
    ]);
    expect(table.capabilities).toEqual(["table-edit"]);
  });

  it("indexes direct children without building a second tree", () => {
    const tree = parseFullDocumentTree("- > - alpha\n  > - beta");
    const plan = buildRenderPlan(tree, { revision: 0 });
    const outerItem = plan.entries.find((entry) => entry.node.kind === "list-item")!;
    const children = plan.childrenOf(outerItem.node.id);
    expect(children.map((entry) => entry.node.kind)).toEqual(["blockquote"]);
    expect(children[0]).toBe(plan.entryByNodeId.get(children[0]!.node.id));
    expect(children[0]!.parentId).toBe(outerItem.node.id);
    expect(plan.childrenOf(outerItem.node.id)).toBe(children);
    expect(plan.ancestorsOf(children[0]!.node.id)).toBe(plan.ancestorsOf(children[0]!.node.id));
    expect(plan.childrenOf("missing")).toEqual([]);
    expect(plan.ancestorsOf(tree.root.id)).toEqual([]);
  });

  it("exposes table-cell inline payloads with canonical absolute offsets", () => {
    const source = "> | **A** | B |\n> | --- | --- |\n> | x | `y` |";
    const tree = parseFullDocumentTree(source);
    const plan = buildRenderPlan(tree, { revision: 1 });
    const node = plan.entries.find((entry) => entry.node.kind === "table")!.node;
    expect(node.data.kind).toBe("table");
    if (node.data.kind !== "table") throw new Error("Expected canonical table");
    const header = node.data.header[0]!;
    expect(header.inline.children[0]).toMatchObject({ type: "strong", startOffset: source.indexOf("**A**") });
    const canonical = flattenMarkdownTree(tree).find((candidate) => candidate.id === node.id)!;
    if (canonical.data.kind !== "table") throw new Error("Expected canonical table");
    expect(header.inline).toBe(canonical.data.header[0]!.inline);
    expect(node.data.rows[0]![1]!.inline.children[0]).toMatchObject({ type: "codeSpan", startOffset: source.indexOf("`y`") });
  });

  it("offers footnote presentation only for canonical valid definitions", () => {
    const source = "[^ok]: **body**\n\n[^dup]: first\n[^dup]: second\n\n[^]: malformed";
    const tree = parseFullDocumentTree(source);
    const plan = buildRenderPlan(tree, { revision: 1 });
    const definitions = plan.entries.filter((entry) => entry.node.data.kind === "definition");
    expect(definitions.map((entry) => entry.node.data.kind === "definition" && entry.node.data.footnote?.status))
      .toEqual(["valid", "duplicate", "duplicate", "malformed"]);
    expect(definitions.map((entry) => entry.capabilities.includes("footnote-definition"))).toEqual([true, false, false, false]);
    const data = definitions[0]!.node.data;
    if (data.kind !== "definition") throw new Error("Expected canonical definition");
    expect(data.footnote?.lines).toBe(tree.footnoteDefinitions.get("ok")?.lines);
    expect(data.footnote?.lines[0]?.inline?.children[0]).toMatchObject({ type: "strong", startOffset: source.indexOf("**body**") });
  });

  it("reuses a document revision while isolating distinct documents and revisions", () => {
    const first = createDocumentStructureCache("- [x] done");
    const second = createDocumentStructureCache("- [x] done");
    const plan = buildRenderPlan(first.tree, { revision: first.revision });
    expect(buildRenderPlan(first.tree, { revision: first.revision })).toBe(plan);
    expect(buildRenderPlan(second.tree, { revision: second.revision })).not.toBe(plan);
    expect(buildRenderPlan(first.tree, { revision: first.revision + 1 })).not.toBe(plan);
    expect(plan.entries.find((entry) => entry.node.kind === "list-item")?.capabilities)
      .toEqual(["container-prefix", "task-toggle"]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.entries)).toBe(true);
  });

  it("does not invent paragraph content for an empty list item", () => {
    const tree = parseFullDocumentTree("> -");
    const plan = buildRenderPlan(tree, { revision: 1 });
    const item = plan.entries.at(-1)!;
    expect(item.node.kind).toBe("list-item");
    expect(plan.childrenOf(item.node.id)).toEqual([]);
    expect(item.capabilities).toEqual(["container-prefix"]);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid revision %s", (revision) => {
    expect(() => buildRenderPlan(parseFullDocumentTree(""), { revision })).toThrow(RangeError);
  });
});

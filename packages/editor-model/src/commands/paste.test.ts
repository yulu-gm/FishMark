import { describe, expect, it } from "vitest";
import { createDocumentStructureCache, parseFullDocumentTree } from "@fishmark/markdown-engine";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planRichTextPaste } from "./paste";

function paste(source: string, markdown: string, anchor = source.length, head = anchor) {
  const context = createEditorSemanticContext({
    snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)),
    selection: { anchor, head }
  });
  const plan = planRichTextPaste(context, markdown);
  let text = source;
  for (const edit of [...(plan?.edits ?? [])].reverse()) {
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  }
  return { plan, text };
}

function paragraphOwners(source: string, word: string) {
  const offset = source.indexOf(word);
  return [...parseFullDocumentTree(source).nodesById.values()]
    .filter(node => (node.kind === "list-item" || node.kind === "blockquote") &&
      node.source.startOffset <= offset && node.source.endOffset >= offset + word.length)
    .map(node => node.kind);
}

describe("富文本粘贴容器", () => {
  it("原位拼接片段会丢失列表和引用的续行容器", () => {
    for (const source of ["- parent", "> parent"]) {
      const text = source + " first\n\nsecond";
      expect(text).toBe(source + " first\n\nsecond");
      expect(parseFullDocumentTree(text).root.children.map(node => node.kind))
        .toEqual([source.startsWith("-") ? "list" : "blockquote", "paragraph"]);
    }
  });

  it("普通段落原位替换反向选区，保留前后文并一次粘贴", () => {
    const { plan, text } = paste("before OLD after", "**one**\n\ntwo", 10, 7);
    expect(text).toBe("before **one**\n\ntwo after");
    expect(plan?.edits).toHaveLength(1);
    expect(plan?.userEventName).toBe("input.paste");
    expect(plan?.selection).toEqual({ anchor: text.indexOf(" after"), head: text.indexOf(" after") });
  });

  it.each([
    ["- parent", "  ", ["list-item"]],
    ["> parent", "> ", ["blockquote"]],
    ["> - parent", ">   ", ["blockquote", "list-item"]],
    ["- > parent", "  > ", ["list-item", "blockquote"]],
    ["- [x] parent", "  ", ["list-item"]],
    ["12. parent", "    ", ["list-item"]],
    [">>parent", ">> ", ["blockquote", "blockquote"]]
  ] as const)("在 %s 中粘贴多段和多行，所有段落仍属于原容器", (source, prefix, owners) => {
    const { text } = paste(source, " first\n\nsecond\nthird");
    expect(text).toBe(source + " first\n" + prefix + "\n" + prefix + "second\n" + prefix + "third");
    expect(paragraphOwners(text, "second")).toEqual(owners);
    expect(paragraphOwners(text, "third")).toEqual(owners);
  });

  it("续行中粘贴不复制首行标记，后续子项和兄弟项仍属于原层级", () => {
    const source = "- parent\n  body tail\n  - child\n- sibling";
    const offset = source.indexOf(" tail");
    const { text } = paste(source, " A\n\nB", offset);
    expect(text).toBe("- parent\n  body A\n  \n  B tail\n  - child\n- sibling");
    expect(paragraphOwners(text, "B tail")).toEqual(["list-item"]);
    expect(paragraphOwners(text, "child")).toEqual(["list-item", "list-item"]);
    expect(paragraphOwners(text, "sibling")).toEqual(["list-item"]);
  });

  it("同一列表项跨段落的反向选区使用起点容器，并保留两端文字", () => {
    const source = "> - first OLD\n>   \n>   LAST tail";
    const from = source.indexOf("OLD");
    const to = source.indexOf(" tail");
    const { text, plan } = paste(source, "one\n\ntwo", to, from);
    expect(text).toBe("> - first one\n>   \n>   two tail");
    expect(plan?.selection.head).toBe(text.indexOf(" tail"));
  });

  it("列表片段在行中单独成块，保留前后文和片段内部嵌套", () => {
    const source = "- before after\n  - old child\n- sibling";
    const { text } = paste(source, "- A\n  - nested\n- B", source.indexOf(" after"));
    expect(text).toBe("- before\n  \n  - A\n    - nested\n  - B\n  \n   after\n  - old child\n- sibling");
    expect(paragraphOwners(text, "nested")).toEqual(["list-item", "list-item", "list-item"]);
    expect(paragraphOwners(text, "after")).toEqual(["list-item"]);
    expect(paragraphOwners(text, "old child")).toEqual(["list-item", "list-item"]);
  });

  it("空列表项的首行复用已有标记，第二个粘贴子项不变成外层兄弟", () => {
    const { text } = paste("- ", "- A\n- B");
    expect(text).toBe("- - A\n  - B");
    expect(paragraphOwners(text, "A")).toEqual(["list-item", "list-item"]);
    expect(paragraphOwners(text, "B")).toEqual(["list-item", "list-item"]);
  });

  it("围栏片段与原文字分开，代码缩进和引用内的列表归属保持不变", () => {
    const source = "> - before tail";
    const fragment = "```python\n    return 1\n```";
    const { text } = paste(source, fragment, source.indexOf(" tail"));
    expect(text).toBe("> - before\n>   \n>   ```python\n>       return 1\n>   ```\n>   \n>    tail");
    const fences = [...parseFullDocumentTree(text).nodesById.values()].filter(node => node.kind === "code-fence");
    expect(fences).toHaveLength(1);
    expect(paragraphOwners(text, "return")).toEqual(["blockquote", "list-item"]);
    expect(paragraphOwners(text, "tail")).toEqual(["blockquote", "list-item"]);
  });

  it("列表片段末项不吞掉原有下一行引用正文", () => {
    const source = "> before\n> after";
    const { text } = paste(source, "- A\n- B", source.indexOf("\n"));
    expect(text).toBe("> before\n> \n> - A\n> - B\n> \n> after");
    expect(paragraphOwners(text, "after")).toEqual(["blockquote"]);
  });

  it("CRLF 文档和片段不产生双 CR，也不改动既有正文", () => {
    const source = "> before\r\n> tail";
    const { text } = paste(source, " A\r\n\r\nB\rC", source.indexOf("\r"));
    expect(text).toBe("> before A\r\n> \r\n> B\r\n> C\r\n> tail");
  });

  it.each(["\n", "\r\n"])("惰性续行行首的列表仍属于原项，换行=%j", eol => {
    const source = ["- parent", "continued", "- sibling"].join(eol);
    const { text, plan } = paste(source, ["- A", "- B"].join(eol), source.indexOf("continued"));
    expect(plan).not.toBeNull();
    expect(text).toBe(["- parent", "  ", "  - A", "  - B", "  ", "  continued", "- sibling"].join(eol));
    const tree = parseFullDocumentTree(text);
    const parent = [...tree.nodesById.values()].find(node => node.kind === "list-item" && node.source.startOffset === 0)!;
    expect(text.slice(parent.source.startOffset, parent.source.endOffset)).toContain("continued");
    expect(paragraphOwners(text, "A")).toEqual(["list-item", "list-item"]);
    expect(paragraphOwners(text, "B")).toEqual(["list-item", "list-item"]);
    expect(paragraphOwners(text, "continued")).toEqual(["list-item"]);
    expect(paragraphOwners(text, "sibling")).toEqual(["list-item"]);
    expect(plan?.selection.head).toBe(text.indexOf("continued"));
  });

  it.each(["\n", "\r\n"])("引用惰性续行行首粘贴的围栏正常闭合，换行=%j", eol => {
    const source = ["> parent", "continued"].join(eol);
    const { text } = paste(source, ["```js", "x", "```"].join(eol), source.indexOf("continued"));
    expect(text).toBe(["> parent", "> ", "> ```js", "> x", "> ```", "> ", "> continued"].join(eol));
    const tree = parseFullDocumentTree(text);
    expect(tree.root.children.map(node => node.kind)).toEqual(["blockquote"]);
    const fences = [...tree.nodesById.values()].filter(node => node.kind === "code-fence");
    expect(fences).toHaveLength(1);
    // 节点起点位于围栏标记，不包含首行的引用前缀。
    expect(text.slice(fences[0]!.source.startOffset, fences[0]!.source.endOffset).trimEnd()).toBe(["```js", "> x", "> ```"].join(eol));
    expect(paragraphOwners(text, "continued")).toEqual(["blockquote"]);
    expect([...tree.nodesById.values()].some(node => node.kind === "paragraph" &&
      text.slice(node.source.startOffset, node.source.endOffset).includes("continued"))).toBe(true);
  });

  it.each(["-", "12.", "> -"])("空列表标记 %s 后补首行间距和完整续行缩进", marker => {
    const prefix = marker === "-" ? "  " : marker === "12." ? "    " : ">   ";
    const { text } = paste(marker, "- A\n- B");
    expect(text).toBe(marker + " - A\n" + prefix + "- B");
    const owners = marker === "> -" ? ["blockquote", "list-item", "list-item"] : ["list-item", "list-item"];
    expect(paragraphOwners(text, "A")).toEqual(owners);
    expect(paragraphOwners(text, "B")).toEqual(owners);
    expect(paste(marker, "one\n\ntwo").text).toBe(marker + " one\n" + prefix + "\n" + prefix + "two");
  });

  it.each(["\n", "\r\n"])("引用列表续行只有部分前缀时补齐且不重复，换行=%j", eol => {
    const source = ["> - parent", "> continued"].join(eol);
    const from = source.indexOf("continued");
    const { text, plan } = paste(source, "2. A\n3. B", from + 4, from);
    expect(text).toBe(["> - parent", ">   ", ">   2. A", ">   3. B", ">   ", ">   inued"].join(eol));
    expect(plan?.edits).toHaveLength(1);
    expect(plan?.selection.head).toBe(text.indexOf("inued"));
    expect(paragraphOwners(text, "A")).toEqual(["blockquote", "list-item", "list-item"]);
    expect(paragraphOwners(text, "B")).toEqual(["blockquote", "list-item", "list-item"]);
    expect(paragraphOwners(text, "inued")).toEqual(["blockquote", "list-item"]);
  });

  it("父列表首行包含引用时，粘贴到后续父级段落不带入引用标记", () => {
    const source = "- > quote\n\n  own";
    expect(paste(source, " A\n\nB").text).toBe("- > quote\n\n  own A\n  \n  B");
  });

  it("深层列表中的片段不改变后续子项或同层兄弟的父级", () => {
    const source = "- outer\n  - target\n    - child\n  - peer";
    const { text } = paste(source, " A\n\nB", source.indexOf("\n    - child"));
    expect(text).toBe("- outer\n  - target A\n    \n    B\n    - child\n  - peer");
    expect(paragraphOwners(text, "B")).toEqual(["list-item", "list-item"]);
    expect(paragraphOwners(text, "child")).toEqual(["list-item", "list-item", "list-item"]);
    expect(paragraphOwners(text, "peer")).toEqual(["list-item", "list-item"]);
  });

  it("在省略引用标记的续行内粘贴，新增段落补回正确前缀", () => {
    const source = "> first\ncontinued";
    const { text } = paste(source, " A\n\nB");
    expect(text).toBe("> first\ncontinued A\n> \n> B");
    expect(paragraphOwners(text, "B")).toEqual(["blockquote"]);
  });

  it.each(["- before\ncontinued", "> before\ncontinued"])("块片段会使已有惰性续行脱离容器时回退：%s", source => {
    expect(paste(source, "- A\n- B", source.indexOf("\n")).plan).toBeNull();
  });

  it.each([
    ["- first\n- last", 2, 14],
    ["> first\n\nlast", 2, 13],
    ["- before\n  - child\n\n  after", 2, 26],
    ["```\ncode\n```", 6, 6],
    ["# heading", 3, 3],
    ["- text", 0, 3]
  ])("复杂跨容器、代码或结构标记选区返回 null：%s", (source, from, to) => {
    expect(paste(source, "one\n\ntwo", from, to).plan).toBeNull();
  });
});

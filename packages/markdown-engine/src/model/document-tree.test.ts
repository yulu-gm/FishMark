import { describe, expect, it } from "vitest";

import {
  childContainerPath,
  compareContainerPaths,
  containerPathKey,
  isContainerPathAncestor,
  ROOT_CONTAINER_PATH,
  type ContainerPath
} from "./container-path";
import {
  assertMarkdownTreeInvariants,
  childrenOf,
  createContainerPrefixedSource,
  createMarkdownDocumentTree,
  createNodeIdForSource,
  findMarkdownNodeByPath,
  fingerprintMarkdownSource,
  flattenMarkdownTree,
  getMarkdownNodeById
} from "./document-tree";
import {
  createMarkdownContainerNode,
  createMarkdownLeafNode,
  isMarkdownContainerNode,
  isMarkdownLeafNode,
  type MarkdownContainerNode
} from "./markdown-node";
import {
  collectUnmaskedRanges,
  createSourceRange,
  maskSourceRanges,
  sourceRangeContainsRange
} from "./source-range";

function buildHierarchy(depth: number, path: ContainerPath, maxDepth: number): MarkdownContainerNode {
  const source = "# root content nested deep\n";
  const kind = depth === 0 ? "document" : depth % 2 === 1 ? "blockquote" : "list";
  const range = createSourceRange(depth, source.length - depth);
  const children = depth < maxDepth ? [buildHierarchy(depth + 1, childContainerPath(path, 0), maxDepth)] : [];
  return createMarkdownContainerNode({
    id: createNodeIdForSource({ path, kind, source: source.slice(depth, source.length - depth) }),
    kind,
    path,
    source: range,
    content: range,
    markers: [],
    data: kind === "list"
      ? { kind: "list", ordered: false, startOrdinal: null, delimiter: null }
      : { kind },
    children
  });
}

describe("recursive container paths", () => {
  it("extends, compares, and nests paths without offsets", () => {
    const root = ROOT_CONTAINER_PATH;
    const first = childContainerPath(root, 0);
    const nested = childContainerPath(first, 2);

    expect(containerPathKey(nested)).toBe("0.2");
    expect(isContainerPathAncestor(root, nested)).toBe(true);
    expect(isContainerPathAncestor(first, nested)).toBe(true);
    expect(isContainerPathAncestor(nested, first)).toBe(false);
    expect(compareContainerPaths(first, nested)).toBe(-1);
    expect(compareContainerPaths(nested, nested)).toBe(0);
  });
});

describe("source ranges and masked container source", () => {
  it("masks container prefixes while preserving offsets, CRLF, and Unicode", () => {
    const source = "> héllo\r\n> 世界\r\n";
    const masked = maskSourceRanges(source, [
      createSourceRange(0, 2),
      createSourceRange(9, 11)
    ]);

    expect(masked.length).toBe(source.length);
    expect(masked).toBe("  héllo\r\n  世界\r\n");
    expect(masked.split("\r\n").length).toBe(source.split("\r\n").length);
  });

  it("keeps tabs intact outside mask ranges and reports unmasked content", () => {
    const source = "\t> a\tb";
    const masked = maskSourceRanges(source, [createSourceRange(1, 3)]);

    expect(masked).toBe("\t  a\tb");
    expect(collectUnmaskedRanges(source.length, [createSourceRange(1, 3)])).toEqual([
      createSourceRange(0, 1),
      createSourceRange(3, source.length)
    ]);
  });

  it("builds container-prefixed source with document-aligned offsets", () => {
    const source = "> one\n> two\n";
    const prefixed = createContainerPrefixedSource(source, [
      createSourceRange(0, 2),
      createSourceRange(6, 8)
    ]);

    expect(prefixed.masked).toBe("  one\n  two\n");
    expect(prefixed.contentRanges).toEqual([
      createSourceRange(2, 6),
      createSourceRange(8, source.length)
    ]);
  });

  it("rejects a content range that escapes its source range", () => {
    expect(() =>
      createMarkdownLeafNode({
        id: "bad",
        kind: "paragraph",
        path: ROOT_CONTAINER_PATH,
        source: createSourceRange(0, 4),
        content: createSourceRange(0, 8),
        markers: [],
        data: { kind: "paragraph" }
      })
    ).toThrow(/content range/);
  });
});

describe("stable node identity", () => {
  it("derives ids from ancestry and subtree identity, not raw offsets", () => {
    const path = childContainerPath(ROOT_CONTAINER_PATH, 1);
    const first = createNodeIdForSource({ path, kind: "paragraph", source: "same text" });
    const shifted = createNodeIdForSource({ path, kind: "paragraph", source: "same text" });

    expect(first).toBe(shifted);
    expect(first).not.toBe(createNodeIdForSource({ path, kind: "heading", source: "same text" }));
    expect(first).not.toBe(
      createNodeIdForSource({ path: childContainerPath(path, 0), kind: "paragraph", source: "same text" })
    );
    expect(first).not.toBe(
      createNodeIdForSource({ path, kind: "paragraph", source: "different text" })
    );
    expect(fingerprintMarkdownSource("héllo世界")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("document tree", () => {
  it("indexes every node and resolves it by path and id", () => {
    const root = buildHierarchy(0, ROOT_CONTAINER_PATH, 3);
    const tree = createMarkdownDocumentTree(root);

    assertMarkdownTreeInvariants(tree);
    expect(flattenMarkdownTree(tree)).toHaveLength(4);
    expect(findMarkdownNodeByPath(tree, childContainerPath(childContainerPath(ROOT_CONTAINER_PATH, 0), 0))).not.toBeNull();
    expect(getMarkdownNodeById(tree, root.id)).toBe(root);
    expect(isMarkdownContainerNode(root)).toBe(true);
    expect(childrenOf(root)).toHaveLength(1);
  });

  it("supports empty containers and depth 0-8 nesting", () => {
    const deep = buildHierarchy(0, ROOT_CONTAINER_PATH, 8);
    const tree = createMarkdownDocumentTree(deep);
    assertMarkdownTreeInvariants(tree);
    expect(flattenMarkdownTree(tree)).toHaveLength(9);

    const leaf = createMarkdownLeafNode({
      id: "leaf",
      kind: "paragraph",
      path: ROOT_CONTAINER_PATH,
      source: createSourceRange(0, 0),
      content: createSourceRange(0, 0),
      markers: [],
      data: { kind: "paragraph" }
    });
    expect(isMarkdownLeafNode(leaf)).toBe(true);
    expect(childrenOf(leaf)).toHaveLength(0);
  });

  it("treats a lazily continued line as plain content inside its container", () => {
    const source = "> first\ncontinued\n";
    const containerRange = createSourceRange(0, source.length);
    const root = createMarkdownContainerNode({
      id: "root",
      kind: "blockquote",
      path: ROOT_CONTAINER_PATH,
      source: containerRange,
      content: containerRange,
      markers: [],
      data: { kind: "blockquote" },
      children: [
        createMarkdownLeafNode({
          id: "child",
          kind: "paragraph",
          path: childContainerPath(ROOT_CONTAINER_PATH, 0),
          source: containerRange,
          content: createSourceRange(2, source.length),
          markers: [],
          data: { kind: "paragraph" }
        })
      ]
    });
    const tree = createMarkdownDocumentTree(root);

    assertMarkdownTreeInvariants(tree);
    expect(sourceRangeContainsRange(root.source, childrenOf(root)[0]!.source)).toBe(true);
  });
});

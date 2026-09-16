import { containerPathKey, type ContainerPath } from "./container-path";
import type {
  MarkdownContainerNode,
  MarkdownNode,
  MarkdownNodeKind
} from "./markdown-node";
import {
  collectUnmaskedRanges,
  createSourceRange,
  maskSourceRanges,
  type SourceRange
} from "./source-range";

// The document tree is the whole parsed document plus an id index. Ids come from structural
// ancestry and a subtree-identity fingerprint rather than offsets alone, so editing text
// above a node does not silently renumber unrelated nodes.
export interface MarkdownDocumentTree {
  readonly root: MarkdownContainerNode;
  readonly nodesById: ReadonlyMap<string, MarkdownNode>;
}

export function createMarkdownNodeId(input: {
  readonly path: ContainerPath;
  readonly kind: MarkdownNodeKind;
  readonly fingerprint: string;
}): string {
  const ancestry = containerPathKey(input.path);
  return `${input.kind}@${ancestry.length === 0 ? "root" : ancestry}#${input.fingerprint}`;
}

// Deterministic 32-bit FNV-1a over a node's own source text. Structural ancestry plus this
// fingerprint form the subtree identity; offsets never participate.
export function fingerprintMarkdownSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createNodeIdForSource(input: {
  readonly path: ContainerPath;
  readonly kind: MarkdownNodeKind;
  readonly source: string;
}): string {
  return createMarkdownNodeId({
    path: input.path,
    kind: input.kind,
    fingerprint: fingerprintMarkdownSource(input.source)
  });
}

// Container-prefixed source: the document slice of a container plus the ranges its prefixes
// occupy. `masked` keeps document offsets (prefixes become spaces) so inline parsing of a
// blockquote child produces document offsets directly, with no translation table.
export interface ContainerPrefixedSource {
  readonly masked: string;
  readonly prefixRanges: readonly SourceRange[];
  readonly contentRanges: readonly SourceRange[];
}

export function createContainerPrefixedSource(
  source: string,
  prefixRanges: readonly SourceRange[]
): ContainerPrefixedSource {
  const ordered = Object.freeze(
    [...prefixRanges]
      .map((range) => createSourceRange(range.startOffset, range.endOffset))
      .sort((left, right) => left.startOffset - right.startOffset)
  );
  return Object.freeze({
    masked: maskSourceRanges(source, ordered),
    prefixRanges: ordered,
    contentRanges: collectUnmaskedRanges(source.length, ordered)
  });
}

export function createMarkdownDocumentTree(
  root: MarkdownContainerNode
): MarkdownDocumentTree {
  const nodesById = new Map<string, MarkdownNode>();
  visit(root);
  return Object.freeze({ root, nodesById });

  function visit(node: MarkdownNode): void {
    if (nodesById.has(node.id)) {
      throw new Error(`Duplicate markdown node id '${node.id}'.`);
    }
    nodesById.set(node.id, node);
    for (const child of childrenOf(node)) {
      visit(child);
    }
  }
}

export function flattenMarkdownTree(tree: MarkdownDocumentTree): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  visit(tree.root);
  return Object.freeze(nodes);

  function visit(node: MarkdownNode): void {
    nodes.push(node);
    for (const child of childrenOf(node)) {
      visit(child);
    }
  }
}

export function findMarkdownNodeByPath(
  tree: MarkdownDocumentTree,
  path: ContainerPath
): MarkdownNode | null {
  let current: MarkdownNode = tree.root;
  for (const segment of path) {
    const children = childrenOf(current);
    const next = children[segment];
    if (next === undefined) return null;
    current = next;
  }
  return current;
}

export function getMarkdownNodeById(
  tree: MarkdownDocumentTree,
  id: string
): MarkdownNode | null {
  return tree.nodesById.get(id) ?? null;
}

export function childrenOf(node: MarkdownNode): readonly MarkdownNode[] {
  return "children" in node ? node.children : [];
}

// Fails closed when a tree violates the model invariants the parser must uphold: children
// stay inside their parent, every child path extends its parent path, and depth matches path.
export function assertMarkdownTreeInvariants(tree: MarkdownDocumentTree): void {
  visit(tree.root);

  function visit(node: MarkdownNode): void {
    if (node.path.length !== node.depth) {
      throw new Error(`Node '${node.id}' depth does not match its container path.`);
    }
    if (node.content.startOffset < node.source.startOffset ||
        node.content.endOffset > node.source.endOffset) {
      throw new Error(`Node '${node.id}' content range escapes its source range.`);
    }
    const children = childrenOf(node);
    children.forEach((child, index) => {
      if (child.path.length !== node.path.length + 1) {
        throw new Error(`Node '${child.id}' is not one level below '${node.id}'.`);
      }
      if (child.path[child.path.length - 1] !== index) {
        throw new Error(`Node '${child.id}' path does not match its child index ${index}.`);
      }
      if (child.source.startOffset < node.source.startOffset ||
          child.source.endOffset > node.source.endOffset) {
        throw new Error(`Node '${child.id}' escapes its parent '${node.id}' source range.`);
      }
      visit(child);
    });
  }
}

import {
  childrenOf,
  isMarkdownLeafNode,
  type MarkdownDocumentTree,
  type MarkdownNode
} from "@fishmark/markdown-engine";

export type RenderRole = "container" | "text" | "code" | "math" | "table" | "rule" | "definition" | "image";

export type RenderCapability =
  | "inline"
  | "container-prefix"
  | "task-toggle"
  | "code-preview"
  | "math-preview"
  | "table-edit"
  | "image-preview"
  | "footnote-definition";

export interface CanonicalRenderMetadata {
  readonly revision: number;
}

export interface RenderPlanEntry {
  // IDs, source/content ranges, markers, inline and typed data remain owned by
  // the canonical node. No projected block or copied child tree is introduced.
  readonly node: MarkdownNode;
  readonly parentId: string | null;
  readonly role: RenderRole;
  readonly capabilities: readonly RenderCapability[];
}

export interface RenderPlan {
  readonly revision: number;
  readonly tree: MarkdownDocumentTree;
  /** Canonical preorder, including the document entry. */
  readonly entries: readonly RenderPlanEntry[];
  readonly entryByNodeId: ReadonlyMap<string, RenderPlanEntry>;
  childrenOf(nodeId: string): readonly RenderPlanEntry[];
  /** Document first, immediate parent last; excludes the queried entry. */
  ancestorsOf(nodeId: string): readonly RenderPlanEntry[];
}

const plans = new WeakMap<MarkdownDocumentTree, RenderPlan>();
const EMPTY_ENTRIES: readonly RenderPlanEntry[] = Object.freeze([]);

/** Build document-only presentation decisions; selection and geometry stay with the consumer. */
export function buildRenderPlan(tree: MarkdownDocumentTree, canonicalMetadata: CanonicalRenderMetadata): RenderPlan {
  const { revision } = canonicalMetadata;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RangeError("Render plan revision must be a non-negative integer.");
  const cached = plans.get(tree);
  if (cached?.revision === revision) return cached;

  const entries: RenderPlanEntry[] = [];
  const entryByNodeId = new Map<string, RenderPlanEntry>();
  const pending: { node: MarkdownNode; parentId: string | null }[] = [{ node: tree.root, parentId: null }];
  while (pending.length > 0) {
    const { node, parentId } = pending.pop()!;
    const entry = Object.freeze({ node, parentId, role: roleOf(node), capabilities: capabilitiesOf(node) });
    entries.push(entry);
    entryByNodeId.set(node.id, entry);
    const children = childrenOf(node);
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push({ node: children[index]!, parentId: node.id });
  }
  const childEntries = new Map<string, readonly RenderPlanEntry[]>();
  const ancestorEntries = new Map<string, readonly RenderPlanEntry[]>();
  const plan: RenderPlan = Object.freeze({
    revision,
    tree,
    entries: Object.freeze(entries),
    entryByNodeId,
    childrenOf(nodeId: string): readonly RenderPlanEntry[] {
      const entry = entryByNodeId.get(nodeId);
      if (entry === undefined) return EMPTY_ENTRIES;
      let result = childEntries.get(nodeId);
      if (result === undefined) {
        result = Object.freeze(childrenOf(entry.node).map((node) => entryByNodeId.get(node.id)!));
        childEntries.set(nodeId, result);
      }
      return result;
    },
    ancestorsOf(nodeId: string): readonly RenderPlanEntry[] {
      const entry = entryByNodeId.get(nodeId);
      if (entry === undefined) return EMPTY_ENTRIES;
      let result = ancestorEntries.get(nodeId);
      if (result === undefined) {
        const ancestors: RenderPlanEntry[] = [];
        let parentId = entry.parentId;
        while (parentId !== null) {
          const parent = entryByNodeId.get(parentId)!;
          ancestors.push(parent);
          parentId = parent.parentId;
        }
        result = Object.freeze(ancestors.reverse());
        ancestorEntries.set(nodeId, result);
      }
      return result;
    }
  });
  plans.set(tree, plan);
  return plan;
}

function roleOf(node: MarkdownNode): RenderRole {
  switch (node.kind) {
    case "document": case "blockquote": case "list": case "list-item": return "container";
    case "paragraph": case "heading": return "text";
    case "code-fence": return "code";
    case "block-math": return "math";
    case "table": return "table";
    case "thematic-break": return "rule";
    case "definition": return "definition";
    case "html-image": return "image";
  }
}

function capabilitiesOf(node: MarkdownNode): readonly RenderCapability[] {
  const capabilities: RenderCapability[] = [];
  if (isMarkdownLeafNode(node) && node.inline !== undefined) capabilities.push("inline");
  switch (node.kind) {
    case "blockquote": capabilities.push("container-prefix"); break;
    case "list-item":
      capabilities.push("container-prefix");
      if (node.data.kind === "list-item" && node.data.checked !== null) capabilities.push("task-toggle");
      break;
    case "code-fence": capabilities.push("code-preview"); break;
    case "block-math": capabilities.push("math-preview"); break;
    case "table": capabilities.push("table-edit"); break;
    case "html-image": capabilities.push("image-preview"); break;
    case "definition":
      if (node.data.kind === "definition" && node.data.footnote?.status === "valid") capabilities.push("footnote-definition");
      break;
  }
  return Object.freeze(capabilities);
}

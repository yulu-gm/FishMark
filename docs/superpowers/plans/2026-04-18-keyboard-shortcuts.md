# Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Yulora 编辑器接入一组默认 Markdown 切换型快捷键（粗体、斜体、H1~H4、无序列表、引用块、代码块），保持 Markdown 文本为唯一事实来源、行为可逆、选区稳定。

**Architecture:** 三层结构。`packages/editor-core/src/commands/semantic-context.ts` 把 `EditorState` + `ActiveBlockState` 整理成命令可消费的语义上下文；`packages/editor-core/src/commands/semantic-edits.ts` 把“目标语义 + 上下文”翻译成 `ChangeSpec` 与新选区；`toggle-inline-commands.ts` / `toggle-block-commands.ts` 是命令入口；`extensions/markdown.ts` 的 keymap 把按键挂到命令。每次按键只 dispatch 一个事务，复用现有 `parseMarkdownDocument()`、active block 与 decorations 链路。

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/state`, `@codemirror/view`), `@yulora/markdown-engine` (micromark-based block map + inline AST), Vitest, jsdom。

---

## File Structure

新增（全部位于 `packages/editor-core/src/commands/`）：

- `semantic-context.ts` — 上下文读取层。给定 `EditorState` + `ActiveBlockState`，输出 `SemanticContext`：`{ state, source, activeState, selection }`。无副作用。下游 compute 函数若需要行范围或 inline 节点，直接基于 `state.doc` 与 `activeState.activeBlock` 自取，避免预先计算未被消费的字段。
- `semantic-context.test.ts` — context 读取的纯函数测试。
- `semantic-edits.ts` — edits 计算层。导出按目标语义命名的 pure functions：`computeStrongToggle`、`computeEmphasisToggle`、`computeHeadingToggle`、`computeBulletListToggle`、`computeBlockquoteToggle`、`computeCodeFenceToggle`。每个函数接收 `SemanticContext` + 必要参数（如 heading level），返回 `{ changes, selection }` 或 `null`（表示不改动）。
- `semantic-edits.test.ts` — edits 计算的纯函数测试。
- `toggle-inline-commands.ts` — `toggleStrong(view, activeState)`、`toggleEmphasis(view, activeState)`。读 context、调用 compute，单次 `view.dispatch`。
- `toggle-inline-commands.test.ts` — 命令级行为测试（接 EditorView，但用纯文本断言文本与选区）。
- `toggle-block-commands.ts` — `toggleHeading(level)(view, activeState)`、`toggleBulletList`、`toggleBlockquote`、`toggleCodeFence`。
- `toggle-block-commands.test.ts` — 命令级测试。

修改：

- `packages/editor-core/src/commands/index.ts` — 导出新增命令。
- `packages/editor-core/src/extensions/markdown.ts` — keymap 增加默认快捷键绑定。
- `packages/editor-core/src/extensions/markdown.test.ts` — 验证按键能触发命令、不破坏 IME guard 与 active block 链路。
- `src/renderer/code-editor.test.ts` — 验证默认快捷键在真实 controller 中触发，不破坏 autosave / blur 链路。
- `MVP_BACKLOG.md` / `docs/progress.md` / `docs/decision-log.md` / `docs/test-report.md` — 收尾文档同步。

每个文件单一职责：context 只读、edits 只算、commands 只 dispatch、keymap 只接线。

---

## Conventions for every code task

- TDD：先写失败测试 → 跑测试看到失败 → 写最小实现 → 跑测试看到通过 → 提交。
- 每条新增的 toggle 命令必须同时断言文本与选区，对应设计 risks 第 4 点（selection drift）。
- 每个命令只允许一次 `view.dispatch`，对应设计 risks 第 2 点（undo/redo）。
- 不修改正文，只改必要 marker（除代码块解包/包裹场景），对应设计 risks 第 3 点（round-trip）。
- 不绕开现有 composition guard、`onContentChange`、`onActiveBlockChange` 链路。
- 每个步骤 2~5 分钟，commit 频率以测试通过为粒度。

测试 harness 模板（命令级测试统一沿用）：

```typescript
// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";

const createHarness = (initial: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: initial.doc,
    selection: { anchor: initial.anchor, head: initial.head ?? initial.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });
  const buildActiveState = () =>
    createActiveBlockStateFromMarkdownDocument(parseMarkdownDocument(view.state.doc.toString()), {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    });
  return {
    view,
    activeState: () => buildActiveState(),
    text: () => view.state.doc.toString(),
    selection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    }),
    destroy: () => view.destroy()
  };
};
```

---

### Task 1: SemanticContext reader

**Files:**
- Create: `packages/editor-core/src/commands/semantic-context.ts`
- Create: `packages/editor-core/src/commands/semantic-context.test.ts`

- [ ] **Step 1: 写 context 读取的失败测试**

```typescript
// packages/editor-core/src/commands/semantic-context.test.ts
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { readSemanticContext } from "./semantic-context";

const buildContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  return readSemanticContext(state, activeState);
};

describe("readSemanticContext", () => {
  it("captures selection range, line range and covered top-level blocks", () => {
    const doc = ["# Title", "", "Paragraph one", "Paragraph two"].join("\n");
    const anchor = doc.indexOf("Paragraph one");
    const head = doc.indexOf("two") + 3;
    const ctx = buildContext(doc, anchor, head);

    expect(ctx.selection).toEqual({ from: anchor, to: head, empty: false });
    expect(ctx.lineRange.fromLine).toBe(3);
    expect(ctx.lineRange.toLine).toBe(4);
    expect(ctx.coveredBlocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("returns the inline strong node hit by an empty cursor", () => {
    const doc = "alpha **bold** beta";
    const anchor = doc.indexOf("bold") + 1;
    const ctx = buildContext(doc, anchor);

    expect(ctx.selection.empty).toBe(true);
    expect(ctx.inlineHit?.type).toBe("strong");
  });

  it("returns inlineHit=null when the cursor sits in plain text", () => {
    const doc = "plain paragraph";
    const ctx = buildContext(doc, 4);

    expect(ctx.inlineHit).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-context.test.ts`
Expected: FAIL — `Cannot find module './semantic-context'`.

- [ ] **Step 3: 实现最小 SemanticContext reader**

```typescript
// packages/editor-core/src/commands/semantic-context.ts
import type { EditorState } from "@codemirror/state";

import type {
  InlineContainerNode,
  InlineNode,
  InlineRoot,
  MarkdownBlock
} from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";

export type SemanticSelection = {
  from: number;
  to: number;
  empty: boolean;
};

export type SemanticLineRange = {
  fromLine: number;
  toLine: number;
  fromOffset: number;
  toOffset: number;
};

export type SemanticInlineHit = InlineContainerNode;

export type SemanticContext = {
  state: EditorState;
  source: string;
  activeState: ActiveBlockState;
  selection: SemanticSelection;
  lineRange: SemanticLineRange;
  coveredBlocks: readonly MarkdownBlock[];
  inlineHit: SemanticInlineHit | null;
};

export function readSemanticContext(
  state: EditorState,
  activeState: ActiveBlockState
): SemanticContext {
  const main = state.selection.main;
  const from = Math.min(main.anchor, main.head);
  const to = Math.max(main.anchor, main.head);
  const fromLine = state.doc.lineAt(from);
  const toLine = state.doc.lineAt(to);

  const coveredBlocks = activeState.blockMap.blocks.filter(
    (block) => block.endOffset > from && block.startOffset < Math.max(to, from + 1)
  );

  const inlineHit = main.empty
    ? findInlineHit(activeState.activeBlock, from)
    : null;

  return {
    state,
    source: state.doc.toString(),
    activeState,
    selection: { from, to, empty: main.empty },
    lineRange: {
      fromLine: fromLine.number,
      toLine: toLine.number,
      fromOffset: fromLine.from,
      toOffset: toLine.to
    },
    coveredBlocks,
    inlineHit
  };
}

function findInlineHit(
  activeBlock: MarkdownBlock | null,
  offset: number
): SemanticInlineHit | null {
  const inline = readInlineRoot(activeBlock);
  if (!inline) {
    return null;
  }

  return walkInline(inline, offset);
}

function readInlineRoot(activeBlock: MarkdownBlock | null): InlineRoot | null {
  if (!activeBlock) {
    return null;
  }
  if (activeBlock.type === "heading" || activeBlock.type === "paragraph") {
    return activeBlock.inline ?? null;
  }
  return null;
}

function walkInline(node: InlineRoot | InlineNode, offset: number): SemanticInlineHit | null {
  if (offset < node.startOffset || offset > node.endOffset) {
    return null;
  }

  if (
    node.type === "strong" ||
    node.type === "emphasis" ||
    node.type === "strikethrough" ||
    node.type === "link" ||
    node.type === "image"
  ) {
    if (
      offset >= node.openMarker.endOffset &&
      offset <= node.closeMarker.startOffset
    ) {
      const childHit = walkChildren(node.children, offset);
      return childHit ?? node;
    }
  }

  if ("children" in node) {
    return walkChildren(node.children, offset);
  }

  return null;
}

function walkChildren(children: InlineNode[], offset: number): SemanticInlineHit | null {
  for (const child of children) {
    const hit = walkInline(child, offset);
    if (hit) {
      return hit;
    }
  }
  return null;
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-context.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-context.ts \
        packages/editor-core/src/commands/semantic-context.test.ts
git commit -m "feat(editor-core): add SemanticContext reader for keymap commands"
```

---

### Task 2: Inline edits — strong toggle

**Files:**
- Create: `packages/editor-core/src/commands/semantic-edits.ts`
- Create: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 写 strong toggle 的失败测试**

```typescript
// packages/editor-core/src/commands/semantic-edits.test.ts
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import { computeStrongToggle } from "./semantic-edits";

const buildContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  return readSemanticContext(state, activeState);
};

describe("computeStrongToggle", () => {
  it("wraps a non-empty selection with ** markers and keeps the selection on the content", () => {
    const doc = "alpha bold beta";
    const from = doc.indexOf("bold");
    const to = from + 4;
    const result = computeStrongToggle(buildContext(doc, from, to));

    expect(result).not.toBeNull();
    expect(result!.changes).toEqual({ from, to, insert: "**bold**" });
    expect(result!.selection).toEqual({ anchor: from + 2, head: to + 2 });
  });

  it("inserts an empty pair and parks the cursor between markers when the selection is empty", () => {
    const doc = "alpha ";
    const result = computeStrongToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: doc.length, to: doc.length, insert: "****" });
    expect(result!.selection).toEqual({ anchor: doc.length + 2, head: doc.length + 2 });
  });

  it("unwraps a strong node when the cursor sits inside the empty pair", () => {
    const doc = "alpha **** beta";
    const inner = doc.indexOf("****") + 2;
    const result = computeStrongToggle(buildContext(doc, inner));

    expect(result!.changes).toEqual({ from: inner - 2, to: inner + 2, insert: "" });
    expect(result!.selection).toEqual({ anchor: inner - 2, head: inner - 2 });
  });

  it("unwraps a strong node when the selection covers its full content", () => {
    const doc = "alpha **bold** beta";
    const contentFrom = doc.indexOf("bold");
    const contentTo = contentFrom + 4;
    const result = computeStrongToggle(buildContext(doc, contentFrom, contentTo));

    expect(result!.changes).toEqual({ from: contentFrom - 2, to: contentTo + 2, insert: "bold" });
    expect(result!.selection).toEqual({ anchor: contentFrom - 2, head: contentTo - 2 });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeStrongToggle is not a function`.

- [ ] **Step 3: 实现 `computeStrongToggle`**

```typescript
// packages/editor-core/src/commands/semantic-edits.ts
import type { ChangeSpec } from "@codemirror/state";

import type { InlineContainerNode } from "@yulora/markdown-engine";

import type { SemanticContext } from "./semantic-context";

export type SemanticEdit = {
  changes: ChangeSpec;
  selection: { anchor: number; head: number };
};

export function computeStrongToggle(ctx: SemanticContext): SemanticEdit | null {
  return computeInlineToggle(ctx, { type: "strong", marker: "**" });
}

type InlineToggleSpec = {
  type: "strong" | "emphasis";
  marker: "**" | "*";
};

function computeInlineToggle(ctx: SemanticContext, spec: InlineToggleSpec): SemanticEdit | null {
  const markerLength = spec.marker.length;

  if (!ctx.selection.empty) {
    const enclosing = findEnclosingContainer(ctx.activeState.activeBlock, ctx.selection, spec.type);
    if (enclosing) {
      const innerFrom = enclosing.openMarker.endOffset;
      const innerTo = enclosing.closeMarker.startOffset;
      const inner = ctx.source.slice(innerFrom, innerTo);

      return {
        changes: { from: enclosing.startOffset, to: enclosing.endOffset, insert: inner },
        selection: {
          anchor: ctx.selection.from - markerLength,
          head: ctx.selection.to - markerLength
        }
      };
    }

    const slice = ctx.source.slice(ctx.selection.from, ctx.selection.to);
    return {
      changes: {
        from: ctx.selection.from,
        to: ctx.selection.to,
        insert: `${spec.marker}${slice}${spec.marker}`
      },
      selection: {
        anchor: ctx.selection.from + markerLength,
        head: ctx.selection.to + markerLength
      }
    };
  }

  const emptyPair = findEnclosingEmptyPair(ctx, spec);
  if (emptyPair) {
    return {
      changes: { from: emptyPair.from, to: emptyPair.to, insert: "" },
      selection: { anchor: emptyPair.from, head: emptyPair.from }
    };
  }

  const cursor = ctx.selection.from;
  return {
    changes: { from: cursor, to: cursor, insert: `${spec.marker}${spec.marker}` },
    selection: { anchor: cursor + markerLength, head: cursor + markerLength }
  };
}

function findEnclosingContainer(
  activeBlock: SemanticContext["activeState"]["activeBlock"],
  selection: SemanticContext["selection"],
  type: "strong" | "emphasis"
): InlineContainerNode | null {
  if (!activeBlock || (activeBlock.type !== "heading" && activeBlock.type !== "paragraph")) {
    return null;
  }

  const inline = activeBlock.inline;
  if (!inline) {
    return null;
  }

  let found: InlineContainerNode | null = null;

  const walk = (node: InlineContainerNode | { children?: InlineContainerNode["children"]; type: string }) => {
    if ("children" in node && node.children) {
      for (const child of node.children) {
        if (
          (child.type === "strong" || child.type === "emphasis") &&
          child.type === type &&
          (child as InlineContainerNode).openMarker.endOffset === selection.from &&
          (child as InlineContainerNode).closeMarker.startOffset === selection.to
        ) {
          found = child as InlineContainerNode;
          return;
        }
        walk(child as InlineContainerNode);
        if (found) return;
      }
    }
  };

  walk(inline as unknown as InlineContainerNode);
  return found;
}

function findEnclosingEmptyPair(
  ctx: SemanticContext,
  spec: InlineToggleSpec
): { from: number; to: number } | null {
  const cursor = ctx.selection.from;
  const markerLength = spec.marker.length;
  const left = ctx.source.slice(Math.max(0, cursor - markerLength), cursor);
  const right = ctx.source.slice(cursor, cursor + markerLength);

  if (left === spec.marker && right === spec.marker) {
    return { from: cursor - markerLength, to: cursor + markerLength };
  }

  return null;
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeStrongToggle inline edit"
```

---

### Task 3: Inline edits — emphasis toggle

**Files:**
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 追加 emphasis 的失败测试**

在 `semantic-edits.test.ts` 末尾追加：

```typescript
import { computeEmphasisToggle } from "./semantic-edits";

describe("computeEmphasisToggle", () => {
  it("wraps a non-empty selection with single-asterisk markers", () => {
    const doc = "alpha word beta";
    const from = doc.indexOf("word");
    const to = from + 4;
    const result = computeEmphasisToggle(buildContext(doc, from, to));

    expect(result!.changes).toEqual({ from, to, insert: "*word*" });
    expect(result!.selection).toEqual({ anchor: from + 1, head: to + 1 });
  });

  it("inserts an empty pair and parks the cursor between markers", () => {
    const doc = "alpha ";
    const result = computeEmphasisToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: doc.length, to: doc.length, insert: "**" });
    expect(result!.selection).toEqual({ anchor: doc.length + 1, head: doc.length + 1 });
  });

  it("unwraps an emphasis selection when the selection covers the content exactly", () => {
    const doc = "alpha *word* beta";
    const contentFrom = doc.indexOf("word");
    const contentTo = contentFrom + 4;
    const result = computeEmphasisToggle(buildContext(doc, contentFrom, contentTo));

    expect(result!.changes).toEqual({ from: contentFrom - 1, to: contentTo + 1, insert: "word" });
    expect(result!.selection).toEqual({ anchor: contentFrom - 1, head: contentTo - 1 });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeEmphasisToggle is not a function`。

- [ ] **Step 3: 在 `semantic-edits.ts` 追加 emphasis 实现**

```typescript
export function computeEmphasisToggle(ctx: SemanticContext): SemanticEdit | null {
  return computeInlineToggle(ctx, { type: "emphasis", marker: "*" });
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeEmphasisToggle inline edit"
```

---

### Task 4: Block edits — heading toggle

**Files:**
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 追加 heading 失败测试**

```typescript
import { computeHeadingToggle } from "./semantic-edits";

describe("computeHeadingToggle", () => {
  it("turns a paragraph line into the requested heading level", () => {
    const doc = "Paragraph";
    const result = computeHeadingToggle(buildContext(doc, 0), 2);

    expect(result!.changes).toEqual({ from: 0, to: 0, insert: "## " });
    expect(result!.selection).toEqual({ anchor: 3, head: 3 });
  });

  it("removes the heading marker when toggling to the same level", () => {
    const doc = "## Title";
    const result = computeHeadingToggle(buildContext(doc, 5), 2);

    expect(result!.changes).toEqual({ from: 0, to: 3, insert: "" });
    expect(result!.selection).toEqual({ anchor: 2, head: 2 });
  });

  it("rewrites the heading marker when switching between levels", () => {
    const doc = "# Title";
    const result = computeHeadingToggle(buildContext(doc, 4), 3);

    expect(result!.changes).toEqual({ from: 0, to: 2, insert: "### " });
    expect(result!.selection).toEqual({ anchor: 6, head: 6 });
  });

  it("applies the heading level to every line covered by a multi-line selection", () => {
    const doc = ["alpha", "beta"].join("\n");
    const from = 0;
    const to = doc.length;
    const result = computeHeadingToggle(buildContext(doc, from, to), 2);

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "## alpha\n## beta"
    });
    expect(result!.selection).toEqual({ anchor: 0, head: doc.length + 6 });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeHeadingToggle is not a function`。

- [ ] **Step 3: 实现 `computeHeadingToggle`**

```typescript
const HEADING_LINE_PATTERN = /^(\s{0,3})(#{1,6})(?:\s+|$)(.*)$/;

export function computeHeadingToggle(ctx: SemanticContext, level: number): SemanticEdit | null {
  if (level < 1 || level > 6) {
    return null;
  }

  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);
  const targetMarker = "#".repeat(level);

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }

  const allMatchTarget = lines.every((text) => {
    const match = HEADING_LINE_PATTERN.exec(text);
    return match !== null && match[2] === targetMarker;
  });

  const rewritten = lines.map((text) => {
    const match = HEADING_LINE_PATTERN.exec(text);
    if (allMatchTarget && match) {
      return `${match[1] ?? ""}${match[3] ?? ""}`;
    }
    if (match) {
      const indent = match[1] ?? "";
      const content = match[3] ?? "";
      return `${indent}${targetMarker} ${content}`;
    }
    return `${targetMarker} ${text}`;
  });

  const insert = rewritten.join("\n");
  const oldHeadOffsetFromLineStart = ctx.selection.to - toLine.from;
  const newAnchor = fromLine.from;
  const lengthDelta = insert.length - (toLine.to - fromLine.from);
  const newHead = ctx.selection.to + lengthDelta - (oldHeadOffsetFromLineStart < 0 ? 0 : 0);

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: { anchor: newAnchor, head: Math.max(newAnchor, newHead) }
  };
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（11 tests）。如果某条断言因 selection 计算不一致失败，把 `computeHeadingToggle` 中的 selection 计算改为：单行场景 `anchor = head = fromLine.from + insert.length`；多行场景 `anchor = fromLine.from`、`head = fromLine.from + insert.length`。修正后再跑一次直到全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeHeadingToggle block edit"
```

---

### Task 5: Block edits — bullet list toggle

**Files:**
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 追加 bullet list 失败测试**

```typescript
import { computeBulletListToggle } from "./semantic-edits";

describe("computeBulletListToggle", () => {
  it("prefixes a paragraph line with `- `", () => {
    const doc = "alpha";
    const result = computeBulletListToggle(buildContext(doc, 2));

    expect(result!.changes).toEqual({ from: 0, to: doc.length, insert: "- alpha" });
    expect(result!.selection).toEqual({ anchor: 4, head: 4 });
  });

  it("removes the bullet marker when every covered line already starts with one", () => {
    const doc = ["- alpha", "- beta"].join("\n");
    const result = computeBulletListToggle(buildContext(doc, 0, doc.length));

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    });
  });

  it("preserves indent when adding a bullet to an indented paragraph line", () => {
    const doc = "  alpha";
    const result = computeBulletListToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: 0, to: doc.length, insert: "  - alpha" });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeBulletListToggle is not a function`。

- [ ] **Step 3: 实现 `computeBulletListToggle`**

```typescript
const BULLET_LINE_PATTERN = /^(\s*)([*+-])(?:[ \t]+|$)(.*)$/;
const INDENT_LINE_PATTERN = /^(\s*)(.*)$/;

export function computeBulletListToggle(ctx: SemanticContext): SemanticEdit | null {
  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }

  const allBullet = lines.every((text) => BULLET_LINE_PATTERN.test(text));
  const rewritten = lines.map((text) => {
    if (allBullet) {
      const match = BULLET_LINE_PATTERN.exec(text)!;
      return `${match[1] ?? ""}${match[3] ?? ""}`;
    }
    const indentMatch = INDENT_LINE_PATTERN.exec(text)!;
    const indent = indentMatch[1] ?? "";
    const rest = indentMatch[2] ?? "";
    return `${indent}- ${rest}`;
  });

  const insert = rewritten.join("\n");
  const lengthDelta = insert.length - (toLine.to - fromLine.from);

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: ctx.selection.from + (allBullet ? -2 : 2),
      head: ctx.selection.to + lengthDelta
    }
  };
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（14 tests）。如果某条断言因 selection 偏移不一致失败，按规则统一为：单光标场景 `anchor = head = ctx.selection.from + (allBullet ? -2 : 2)`，多行选区 `anchor = fromLine.from`、`head = fromLine.from + insert.length`。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeBulletListToggle block edit"
```

---

### Task 6: Block edits — blockquote toggle

**Files:**
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 追加 blockquote 失败测试**

```typescript
import { computeBlockquoteToggle } from "./semantic-edits";

describe("computeBlockquoteToggle", () => {
  it("prefixes a paragraph line with `> `", () => {
    const doc = "alpha";
    const result = computeBlockquoteToggle(buildContext(doc, 2));

    expect(result!.changes).toEqual({ from: 0, to: doc.length, insert: "> alpha" });
  });

  it("removes the blockquote marker when every covered line already starts with `> `", () => {
    const doc = ["> alpha", "> beta"].join("\n");
    const result = computeBlockquoteToggle(buildContext(doc, 0, doc.length));

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeBlockquoteToggle is not a function`。

- [ ] **Step 3: 实现 `computeBlockquoteToggle`**

```typescript
const BLOCKQUOTE_LINE_PATTERN = /^(\s{0,3})>[ \t]+(.*)$/;

export function computeBlockquoteToggle(ctx: SemanticContext): SemanticEdit | null {
  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }

  const allQuoted = lines.every((text) => BLOCKQUOTE_LINE_PATTERN.test(text));
  const rewritten = lines.map((text) => {
    if (allQuoted) {
      const match = BLOCKQUOTE_LINE_PATTERN.exec(text)!;
      return `${match[1] ?? ""}${match[2] ?? ""}`;
    }
    const indentMatch = INDENT_LINE_PATTERN.exec(text)!;
    const indent = indentMatch[1] ?? "";
    const rest = indentMatch[2] ?? "";
    return `${indent}> ${rest}`;
  });

  const insert = rewritten.join("\n");
  const lengthDelta = insert.length - (toLine.to - fromLine.from);

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: ctx.selection.from + (allQuoted ? -2 : 2),
      head: ctx.selection.to + lengthDelta
    }
  };
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（16 tests）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeBlockquoteToggle block edit"
```

---

### Task 7: Block edits — code fence toggle

**Files:**
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.test.ts`

- [ ] **Step 1: 追加 code fence 失败测试**

```typescript
import { computeCodeFenceToggle } from "./semantic-edits";

describe("computeCodeFenceToggle", () => {
  it("inserts an empty fenced block at the cursor when the selection is empty", () => {
    const doc = "alpha\n";
    const result = computeCodeFenceToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({
      from: doc.length,
      to: doc.length,
      insert: "```\n\n```"
    });
    expect(result!.selection).toEqual({ anchor: doc.length + 4, head: doc.length + 4 });
  });

  it("wraps the covered lines with a code fence", () => {
    const doc = ["alpha", "beta"].join("\n");
    const result = computeCodeFenceToggle(buildContext(doc, 0, doc.length));

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "```\nalpha\nbeta\n```"
    });
  });

  it("unwraps the active code fence when the cursor sits inside it", () => {
    const doc = "```\nalpha\nbeta\n```";
    const inner = doc.indexOf("alpha");
    const result = computeCodeFenceToggle(buildContext(doc, inner));

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    });
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: FAIL — `computeCodeFenceToggle is not a function`。

- [ ] **Step 3: 实现 `computeCodeFenceToggle`**

```typescript
export function computeCodeFenceToggle(ctx: SemanticContext): SemanticEdit | null {
  const activeBlock = ctx.activeState.activeBlock;
  if (activeBlock?.type === "codeFence") {
    return unwrapCodeFence(ctx, activeBlock);
  }

  if (ctx.selection.empty) {
    const cursor = ctx.selection.from;
    const insert = "```\n\n```";
    return {
      changes: { from: cursor, to: cursor, insert },
      selection: { anchor: cursor + 4, head: cursor + 4 }
    };
  }

  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);
  const inner = ctx.source.slice(fromLine.from, toLine.to);
  const insert = `\`\`\`\n${inner}\n\`\`\``;

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: fromLine.from + 4,
      head: fromLine.from + 4 + inner.length
    }
  };
}

function unwrapCodeFence(
  ctx: SemanticContext,
  block: Extract<SemanticContext["activeState"]["activeBlock"], { type: "codeFence" }>
): SemanticEdit | null {
  const blockSource = ctx.source.slice(block.startOffset, block.endOffset);
  const lines = blockSource.split("\n");
  if (lines.length < 2) {
    return null;
  }

  const inner = lines.slice(1, lines.length - 1).join("\n");
  return {
    changes: { from: block.startOffset, to: block.endOffset, insert: inner },
    selection: { anchor: block.startOffset, head: block.startOffset + inner.length }
  };
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/semantic-edits.test.ts`
Expected: PASS（19 tests）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/commands/semantic-edits.ts \
        packages/editor-core/src/commands/semantic-edits.test.ts
git commit -m "feat(editor-core): add computeCodeFenceToggle block edit"
```

---

### Task 8: Inline toggle commands

**Files:**
- Create: `packages/editor-core/src/commands/toggle-inline-commands.ts`
- Create: `packages/editor-core/src/commands/toggle-inline-commands.test.ts`
- Modify: `packages/editor-core/src/commands/index.ts`

- [ ] **Step 1: 写命令级失败测试**

```typescript
// packages/editor-core/src/commands/toggle-inline-commands.test.ts
// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { toggleEmphasis, toggleStrong } from "./toggle-inline-commands";

const createHarness = (init: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: init.doc,
    selection: { anchor: init.anchor, head: init.head ?? init.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });
  const activeState = () =>
    createActiveBlockStateFromMarkdownDocument(parseMarkdownDocument(view.state.doc.toString()), {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    });
  return {
    view,
    run: (fn: typeof toggleStrong) => fn(view, activeState()),
    text: () => view.state.doc.toString(),
    selection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    }),
    destroy: () => view.destroy()
  };
};

describe("toggleStrong", () => {
  it("wraps a non-empty selection with ** and keeps the selection on the content", () => {
    const harness = createHarness({ doc: "alpha bold beta", anchor: 6, head: 10 });

    expect(harness.run(toggleStrong)).toBe(true);
    expect(harness.text()).toBe("alpha **bold** beta");
    expect(harness.selection()).toEqual({ anchor: 8, head: 12 });

    harness.destroy();
  });

  it("inserts an empty pair when there is no selection", () => {
    const harness = createHarness({ doc: "alpha ", anchor: 6 });

    expect(harness.run(toggleStrong)).toBe(true);
    expect(harness.text()).toBe("alpha ****");
    expect(harness.selection()).toEqual({ anchor: 8, head: 8 });

    harness.destroy();
  });
});

describe("toggleEmphasis", () => {
  it("wraps a non-empty selection with single asterisks", () => {
    const harness = createHarness({ doc: "alpha word beta", anchor: 6, head: 10 });

    expect(harness.run(toggleEmphasis)).toBe(true);
    expect(harness.text()).toBe("alpha *word* beta");
    expect(harness.selection()).toEqual({ anchor: 7, head: 11 });

    harness.destroy();
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/toggle-inline-commands.test.ts`
Expected: FAIL — `Cannot find module './toggle-inline-commands'`。

- [ ] **Step 3: 实现 `toggle-inline-commands.ts`**

```typescript
// packages/editor-core/src/commands/toggle-inline-commands.ts
import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import {
  computeEmphasisToggle,
  computeStrongToggle,
  type SemanticEdit
} from "./semantic-edits";

export function toggleStrong(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeStrongToggle(readSemanticContext(view.state, activeState)));
}

export function toggleEmphasis(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeEmphasisToggle(readSemanticContext(view.state, activeState)));
}

function applySemanticEdit(view: EditorView, edit: SemanticEdit | null): boolean {
  if (!edit) {
    return false;
  }
  view.dispatch({ changes: edit.changes, selection: edit.selection });
  return true;
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/toggle-inline-commands.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: 在 `commands/index.ts` 导出**

```typescript
// packages/editor-core/src/commands/index.ts
export { runBlockquoteEnter } from "./blockquote-commands";
export { runCodeFenceBackspace, runCodeFenceEnter } from "./code-fence-commands";
export { runMarkdownBackspace, runMarkdownEnter, runMarkdownTab } from "./markdown-commands";
export { runListEnter, runListIndentOnTab } from "./list-commands";
export {
  buildContinuationPrefix,
  getBackspaceLineStart,
  getCodeFenceEditableAnchor,
  parseBlockquoteLine,
  parseCodeFenceLine,
  parseListLine,
  type ParsedListLine
} from "./line-parsers";
export { toggleEmphasis, toggleStrong } from "./toggle-inline-commands";
```

- [ ] **Step 6: 提交**

```bash
git add packages/editor-core/src/commands/toggle-inline-commands.ts \
        packages/editor-core/src/commands/toggle-inline-commands.test.ts \
        packages/editor-core/src/commands/index.ts
git commit -m "feat(editor-core): add toggleStrong and toggleEmphasis commands"
```

---

### Task 9: Block toggle commands

**Files:**
- Create: `packages/editor-core/src/commands/toggle-block-commands.ts`
- Create: `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- Modify: `packages/editor-core/src/commands/index.ts`

- [ ] **Step 1: 写命令级失败测试**

```typescript
// packages/editor-core/src/commands/toggle-block-commands.test.ts
// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading
} from "./toggle-block-commands";

const createHarness = (init: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: init.doc,
    selection: { anchor: init.anchor, head: init.head ?? init.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });
  const activeState = () =>
    createActiveBlockStateFromMarkdownDocument(parseMarkdownDocument(view.state.doc.toString()), {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    });
  return {
    view,
    runHeading: (level: 1 | 2 | 3 | 4) => toggleHeading(level)(view, activeState()),
    runBullet: () => toggleBulletList(view, activeState()),
    runQuote: () => toggleBlockquote(view, activeState()),
    runFence: () => toggleCodeFence(view, activeState()),
    text: () => view.state.doc.toString(),
    destroy: () => view.destroy()
  };
};

describe("toggleHeading", () => {
  it("turns a paragraph line into the requested level", () => {
    const harness = createHarness({ doc: "Paragraph", anchor: 0 });
    expect(harness.runHeading(2)).toBe(true);
    expect(harness.text()).toBe("## Paragraph");
    harness.destroy();
  });

  it("removes the heading marker when toggled to the same level", () => {
    const harness = createHarness({ doc: "## Title", anchor: 5 });
    expect(harness.runHeading(2)).toBe(true);
    expect(harness.text()).toBe("Title");
    harness.destroy();
  });
});

describe("toggleBulletList", () => {
  it("toggles a paragraph into a bullet list line", () => {
    const harness = createHarness({ doc: "alpha", anchor: 2 });
    expect(harness.runBullet()).toBe(true);
    expect(harness.text()).toBe("- alpha");
    harness.destroy();
  });
});

describe("toggleBlockquote", () => {
  it("toggles a paragraph into a blockquote line", () => {
    const harness = createHarness({ doc: "alpha", anchor: 2 });
    expect(harness.runQuote()).toBe(true);
    expect(harness.text()).toBe("> alpha");
    harness.destroy();
  });
});

describe("toggleCodeFence", () => {
  it("inserts an empty fence at the cursor", () => {
    const harness = createHarness({ doc: "alpha\n", anchor: 6 });
    expect(harness.runFence()).toBe(true);
    expect(harness.text()).toBe("alpha\n```\n\n```");
    harness.destroy();
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/commands/toggle-block-commands.test.ts`
Expected: FAIL — `Cannot find module './toggle-block-commands'`。

- [ ] **Step 3: 实现 `toggle-block-commands.ts`**

```typescript
// packages/editor-core/src/commands/toggle-block-commands.ts
import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import {
  computeBlockquoteToggle,
  computeBulletListToggle,
  computeCodeFenceToggle,
  computeHeadingToggle,
  type SemanticEdit
} from "./semantic-edits";

export function toggleHeading(level: 1 | 2 | 3 | 4) {
  return (view: EditorView, activeState: ActiveBlockState): boolean =>
    applySemanticEdit(view, computeHeadingToggle(readSemanticContext(view.state, activeState), level));
}

export function toggleBulletList(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeBulletListToggle(readSemanticContext(view.state, activeState)));
}

export function toggleBlockquote(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeBlockquoteToggle(readSemanticContext(view.state, activeState)));
}

export function toggleCodeFence(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeCodeFenceToggle(readSemanticContext(view.state, activeState)));
}

function applySemanticEdit(view: EditorView, edit: SemanticEdit | null): boolean {
  if (!edit) {
    return false;
  }
  view.dispatch({ changes: edit.changes, selection: edit.selection });
  return true;
}
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/commands/toggle-block-commands.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: 在 `commands/index.ts` 导出**

```typescript
export {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading
} from "./toggle-block-commands";
```

- [ ] **Step 6: 提交**

```bash
git add packages/editor-core/src/commands/toggle-block-commands.ts \
        packages/editor-core/src/commands/toggle-block-commands.test.ts \
        packages/editor-core/src/commands/index.ts
git commit -m "feat(editor-core): add heading/list/blockquote/codeFence toggles"
```

---

### Task 10: Wire default keymap in markdown extension

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/extensions/markdown.test.ts`

- [ ] **Step 1: 写 keymap 失败测试**

在 `markdown.test.ts` 的 `describe("createYuloraMarkdownExtensions", ...)` 内追加：

```typescript
it("toggles strong on Mod-b", () => {
  const source = "alpha bold beta";
  const { view, destroy } = createHarness({ source });
  view.dispatch({ selection: { anchor: 6, head: 10 } });

  const keyEvent = new KeyboardEvent("keydown", {
    key: "b",
    code: "KeyB",
    bubbles: true,
    cancelable: true,
    ctrlKey: true
  });
  view.contentDOM.dispatchEvent(keyEvent);

  expect(view.state.doc.toString()).toBe("alpha **bold** beta");

  destroy();
});

it("toggles a heading on Mod-2", () => {
  const source = "Paragraph";
  const { view, destroy } = createHarness({ source });
  view.dispatch({ selection: { anchor: 0 } });

  const keyEvent = new KeyboardEvent("keydown", {
    key: "2",
    code: "Digit2",
    bubbles: true,
    cancelable: true,
    ctrlKey: true
  });
  view.contentDOM.dispatchEvent(keyEvent);

  expect(view.state.doc.toString()).toBe("## Paragraph");

  destroy();
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `npx vitest run packages/editor-core/src/extensions/markdown.test.ts`
Expected: FAIL — keymap 还未注册，文本不变。

- [ ] **Step 3: 在 `markdown.ts` keymap 中接入新命令**

在 `runtime` 已经存在的前提下，把 keymap 段替换为：

```typescript
import {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading,
  toggleEmphasis,
  toggleStrong
} from "../commands/toggle-block-commands";
// 顶部已有 import；toggle-inline-commands 单独 import：
import { toggleEmphasis as toggleEmphasisInline, toggleStrong as toggleStrongInline } from "../commands/toggle-inline-commands";
```

调整为只从两个文件分别导入对应符号（不要重复名）。然后在 `keymap.of([...])` 中、在 `historyKeymap` 之前追加：

```typescript
{ key: "Mod-b", run: (view) => toggleStrongInline(view, runtime.activeBlockState) },
{ key: "Mod-i", run: (view) => toggleEmphasisInline(view, runtime.activeBlockState) },
{ key: "Mod-1", run: (view) => toggleHeading(1)(view, runtime.activeBlockState) },
{ key: "Mod-2", run: (view) => toggleHeading(2)(view, runtime.activeBlockState) },
{ key: "Mod-3", run: (view) => toggleHeading(3)(view, runtime.activeBlockState) },
{ key: "Mod-4", run: (view) => toggleHeading(4)(view, runtime.activeBlockState) },
{ key: "Mod-Shift-7", run: (view) => toggleBulletList(view, runtime.activeBlockState) },
{ key: "Mod-Shift-9", run: (view) => toggleBlockquote(view, runtime.activeBlockState) },
{ key: "Mod-Alt-Shift-c", run: (view) => toggleCodeFence(view, runtime.activeBlockState) },
```

- [ ] **Step 4: 跑测试看到通过**

Run: `npx vitest run packages/editor-core/src/extensions/markdown.test.ts`
Expected: PASS（包含原有 4 条 + 新增 2 条）。

- [ ] **Step 5: 提交**

```bash
git add packages/editor-core/src/extensions/markdown.ts \
        packages/editor-core/src/extensions/markdown.test.ts
git commit -m "feat(editor-core): wire default toggle shortcuts in markdown keymap"
```

---

### Task 11: Renderer integration test

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

- [ ] **Step 1: 追加 renderer 集成的失败测试**

在 `code-editor.test.ts` 中追加：

```typescript
it("toggles strong via Mod-b without breaking onChange propagation", () => {
  const host = document.createElement("div");
  const onChange = vi.fn();
  const controller = createCodeEditorController({
    parent: host,
    initialContent: "alpha bold beta",
    onChange
  });

  const view = getEditorView(host);
  expect(view).not.toBeNull();

  view!.dispatch({ selection: { anchor: 6, head: 10 } });

  view!.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "b",
      code: "KeyB",
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    })
  );

  expect(controller.getContent()).toBe("alpha **bold** beta");
  expect(onChange).toHaveBeenCalledWith("alpha **bold** beta");

  controller.destroy();
});
```

- [ ] **Step 2: 跑测试看到通过**

Run: `npx vitest run src/renderer/code-editor.test.ts`
Expected: PASS（原有用例 + 新增 1 条）。说明：扩展层 keymap 已在 Task 10 注册，这条 renderer 测试只是回归性确认 controller 链路（onChange、destroy）未被打断。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/code-editor.test.ts
git commit -m "test(renderer): cover Mod-b strong toggle through code-editor controller"
```

---

### Task 12: Repository verification

**Files:**
- Modify: `MVP_BACKLOG.md`
- Modify: `docs/progress.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Optional create: `reports/task-summaries/<TASK-ID>.md`（任务编号从 backlog 决定，没有就跳过此文件）

- [ ] **Step 1: 跑本任务相关测试**

Run:

```bash
npx vitest run packages/editor-core/src/commands/semantic-context.test.ts \
              packages/editor-core/src/commands/semantic-edits.test.ts \
              packages/editor-core/src/commands/toggle-inline-commands.test.ts \
              packages/editor-core/src/commands/toggle-block-commands.test.ts \
              packages/editor-core/src/extensions/markdown.test.ts \
              src/renderer/code-editor.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 2: 跑仓库门禁**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: 全部成功；如有报错，先回到对应 Task 修复，再回到此步骤。

- [ ] **Step 3: 更新 backlog / progress / decision log / test report**

- 在 `MVP_BACKLOG.md` 标记或追加“默认 Markdown 切换型快捷键”相关条目为已完成。
- 在 `docs/progress.md` 追加一条本日条目，列出新增命令、keymap 与覆盖测试。
- 在 `docs/decision-log.md` 追加一条决定，记录“采用语义切换器 (semantic toggler)”路径与依据。
- 在 `docs/test-report.md` 追加本批新增测试与门禁结果。
- 如果 backlog 中已经有对应的 TASK-ID，则在 `reports/task-summaries/` 下新增对应总结文件。

- [ ] **Step 4: 提交文档变更**

```bash
git add MVP_BACKLOG.md docs/progress.md docs/decision-log.md docs/test-report.md
git commit -m "docs: record default markdown shortcut commands"
```

---

## Self-Review

- 设计 → 计划覆盖：
  - 默认快捷键（设计 §Default Shortcuts）→ Task 10。
  - 语义命令层（设计 §Architecture / 2）→ Task 8、Task 9。
  - 语义上下文（设计 §Architecture / 3）→ Task 1。
  - edits 计算（设计 §Architecture / 3）→ Task 2~7。
  - 行内规则 strong / emphasis（设计 §Semantic Rules）→ Task 2、Task 3、Task 8。
  - 块级规则 heading / bulletList / blockquote / codeFence（设计 §Semantic Rules）→ Task 4~7、Task 9。
  - keymap 接入（设计 §Architecture / 1、§Execution Flow）→ Task 10。
  - editor-core 测试（设计 §Tests / editor-core）→ Task 1~9。
  - renderer 集成测试（设计 §Tests / renderer）→ Task 11。
  - 验收条件 1~7（设计 §Acceptance）→ Task 8~11 中的测试 + Task 12 门禁。
- 占位符扫描：未出现 TBD / TODO / “similar to Task N” / 未指明的错误处理；每条 step 含具体代码或具体命令。
- 类型一致性：所有 toggle 命令统一签名 `(view, activeState) => boolean`，`toggleHeading(level)` 是工厂；`SemanticEdit = { changes, selection }`；`computeXxxToggle` 统一返回 `SemanticEdit | null`；`readSemanticContext` 输入 `(EditorState, ActiveBlockState)`；`applySemanticEdit` 在两个 commands 文件中行为一致。
- 风险覆盖：单次 dispatch（每个 toggle 只调用一次 `view.dispatch`，对应 risks 第 2 点）；不绕开 composition guard（命令仍走 keymap，markdown.ts 的 lifecyclePlugin 不变，对应 risks 第 1 点）；只改 marker（`computeXxxToggle` 不重写正文，除 codeFence 包裹/解包，对应 risks 第 3 点）；测试同时断言文本与选区（对应 risks 第 4 点）。

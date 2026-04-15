# TASK-008 Micromark Block Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `micromark`-backed Markdown block-map parser under `packages/markdown-engine/` that emits stable top-level `heading`, `paragraph`, `list`, and `blockquote` blocks with exact source ranges.

**Architecture:** Keep `TASK-008` strictly inside `packages/markdown-engine/` plus the smallest repo-gate updates needed to test and typecheck that directory. Expose one narrow `parseBlockMap()` entrypoint, define only the minimal block metadata needed by downstream tasks, and drive the implementation with failing unit tests before integrating parser details.

**Tech Stack:** TypeScript, micromark, Vitest, Vite, ESLint

---

### Task 1: Put `packages/markdown-engine` under real repo gates

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.vitest.json`
- Modify: `tsconfig.renderer.json` or create a dedicated shared/package tsconfig if that is the smaller change
- Modify: `vite.config.ts` only if test discovery for `packages/markdown-engine` requires it

**Step 1: Write the failing gate expectation**

Add a placeholder test file path in the plan target and confirm current repo config does not include `packages/markdown-engine/src/**/*.test.ts` in Vitest or `packages/markdown-engine/src` in TypeScript checks.

**Step 2: Run the targeted command to prove the gap exists**

Run: `npm run typecheck`
Expected: PASS today without checking any `packages/markdown-engine` source because that directory is outside the current TypeScript include set.

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: FAIL because the test file does not exist yet and the package path is not yet part of the normal task flow.

**Step 3: Write the minimal config changes**

Update config so:
- `micromark` is available as a dependency
- `packages/markdown-engine/src` is included in typecheck
- `packages/markdown-engine/src/**/*.test.ts` is included in Vitest discovery
- no unrelated package/workspace refactor is introduced

**Step 4: Re-run the gating command**

Run: `npm run typecheck`
Expected: PASS with `packages/markdown-engine` now included in the checked graph.

### Task 2: Define the minimal block-map types

**Files:**
- Create: `packages/markdown-engine/src/block-map.ts`
- Create: `packages/markdown-engine/src/index.ts`

**Step 1: Write the failing type-focused test scaffold**

Create the parser test file with expectations that the parsed result has:
- `blocks`
- deterministic block `id`
- `startOffset` / `endOffset`
- `startLine` / `endLine`
- `heading.depth`
- `list.ordered`

Example expectation:

```ts
expect(result.blocks[0]).toMatchObject({
  type: "heading",
  depth: 1,
  startOffset: 0
});
```

**Step 2: Run the targeted test to verify it fails**

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: FAIL because the block-map types and parser entrypoint do not exist yet.

**Step 3: Write the minimal type surface**

Add:
- a `BlockMap` interface
- union types for `HeadingBlock`, `ParagraphBlock`, `ListBlock`, and `BlockquoteBlock`
- a narrow `MarkdownBlock` union export
- an `index.ts` export barrel

Keep the model intentionally small and avoid adding nested item data.

**Step 4: Re-run the targeted test**

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: still FAIL, but now for the missing parser implementation rather than missing types.

### Task 3: Write failing parser tests for the supported block set

**Files:**
- Create: `packages/markdown-engine/src/parse-block-map.test.ts`
- Reference: `packages/markdown-engine/src/block-map.ts`

**Step 1: Add the first failing test for mixed block order**

Use a Markdown fixture such as:

```md
# Title

Paragraph line 1
Paragraph line 2

- one
- two

> quote
> more
```

Expect:
- 4 blocks in source order
- `heading`, `paragraph`, `list`, `blockquote`

**Step 2: Add focused failing tests for metadata**

Add tests for:
- heading `depth`
- ordered list vs unordered list
- empty/whitespace-only input returns no blocks
- `source.slice(startOffset, endOffset)` matches the original block text

**Step 3: Run the targeted tests**

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: FAIL because `parseBlockMap()` still returns nothing or is undefined.

### Task 4: Implement `parseBlockMap()` with the smallest `micromark` conversion layer

**Files:**
- Create: `packages/markdown-engine/src/parse-block-map.ts`
- Modify: `packages/markdown-engine/src/index.ts`

**Step 1: Add the parser entrypoint**

Create:

```ts
export function parseBlockMap(source: string): BlockMap {
  return { blocks: [] };
}
```

then wire exports through `index.ts`.

**Step 2: Replace the stub with real `micromark`-backed parsing**

Implement the smallest conversion layer that:
- reads `micromark` parse structure
- identifies top-level supported blocks only
- computes deterministic `id`
- computes half-open offsets
- computes 1-based line numbers
- emits block entries in source order

Ignore unsupported block types instead of inventing partial semantics.

**Step 3: Run the targeted tests**

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: PASS

### Task 5: Tighten edge-case coverage before broad verification

**Files:**
- Modify: `packages/markdown-engine/src/parse-block-map.test.ts`
- Modify: `packages/markdown-engine/src/parse-block-map.ts` only if edge cases reveal off-by-one bugs

**Step 1: Add regression assertions for block boundaries**

Add or tighten checks for:
- multi-line paragraph end offsets
- contiguous blockquote grouping
- ordered list metadata
- exact source slice recovery for every supported block

**Step 2: Run the focused parser test again**

Run: `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
Expected: PASS

### Task 6: Update records and run repo gates

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Modify: `docs/progress.md`
- Create: `reports/task-summaries/TASK-008.md`

**Step 1: Record the parser boundary decision**

Document that:
- `micromark` is now the Markdown-engine parser authority
- `TASK-008` intentionally exports only a minimal top-level block map
- renderer integration is deferred to later tasks

**Step 2: Run verification**

Run:
- `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Expected:
- all commands pass

**Step 3: Update project records**

Write:
- fresh verification evidence in `docs/test-report.md`
- `TASK-008` status movement in `docs/progress.md`
- a short summary in `reports/task-summaries/TASK-008.md`

**Step 4: Manual spot check**

Manually inspect one mixed Markdown fixture in test code and confirm the emitted offsets map back to the original source slices without rewriting the text.

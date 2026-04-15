# TASK-010 Heading Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add minimal heading source/render switching so inactive headings dim their `#` markers and gain depth-based styling, while active headings stay fully editable in Markdown source form.

**Architecture:** Keep all heading-rendering state inside `src/renderer/code-editor.ts`, extending the existing derived-state pipeline that already owns block-map parsing, active-block tracking, and IME composition guards. Use CodeMirror decorations only; do not replace heading DOM with widgets or move Markdown parsing into React.

**Tech Stack:** TypeScript, React, CodeMirror 6, Vitest, CSS

---

### Task 1: Add failing tests for inactive heading decorations

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: Write the first failing test**

Add a test that creates a controller from:

```ts
const source = ["# Title", "", "Paragraph"].join("\n");
```

Move the selection into `Paragraph` and assert:
- the heading line has `.cm-inactive-heading`
- the heading line has `.cm-inactive-heading-depth-1`
- the leading `#` is wrapped with `.cm-inactive-heading-marker`

**Step 2: Run the targeted test to verify failure**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL because no heading decoration exists yet

**Step 3: Write the second failing test**

Add a test that starts from the same document, moves the selection into `Paragraph`, then back to the heading, and asserts the inactive-heading classes disappear once the heading becomes active again.

**Step 4: Run the targeted test again**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL with missing decoration assertions for both inactive and re-activated heading cases

### Task 2: Implement the minimal decoration plumbing in the editor controller

**Files:**
- Modify: `src/renderer/code-editor.ts`

**Step 1: Add the decoration infrastructure**

Create:
- a `StateEffect<DecorationSet>` that replaces current heading decorations
- a `StateField<DecorationSet>` exposed through `EditorView.decorations`
- a helper that derives inactive-heading decorations from `ActiveBlockState`

The helper should:
- iterate `blockMap.blocks`
- keep only `heading` blocks whose `id` is not the active block id
- emit `Decoration.line` with classes:

```ts
`cm-inactive-heading cm-inactive-heading-depth-${block.depth}`
```

- emit `Decoration.mark` over:

```ts
{ from: block.startOffset, to: block.startOffset + block.depth }
```

with class:

```ts
"cm-inactive-heading-marker"
```

**Step 2: Wire decoration updates into the existing derived-state pipeline**

Whenever derived state recomputes successfully:
- recompute `blockMap`
- recompute `activeBlockState`
- derive the next heading decoration set
- dispatch the decoration effect only when the new set differs semantically from the previous set

Also:
- apply the initial decoration set after creating the editor view
- reset and re-apply decorations inside `replaceDocument()`

**Step 3: Keep composition semantics unchanged**

Reuse the existing composition guard:
- do not update heading decorations during guarded composition
- flush them once from final `view.state` on `compositionend`

**Step 4: Run the targeted tests**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS for the new inactive/active heading toggle tests
- Existing active-block and IME guard tests remain green

### Task 3: Add heading rendering styles

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Add minimal marker styling**

Add styles for:

```css
.document-editor .cm-inactive-heading-marker
```

Use a dimmed color and lower opacity so `#` remains visible but recedes.

**Step 2: Add depth-based heading line styling**

Add styles for:
- `.document-editor .cm-inactive-heading`
- `.document-editor .cm-inactive-heading-depth-1`
- `.document-editor .cm-inactive-heading-depth-2`
- `.document-editor .cm-inactive-heading-depth-3`
- `.document-editor .cm-inactive-heading-depth-4`
- `.document-editor .cm-inactive-heading-depth-5`
- `.document-editor .cm-inactive-heading-depth-6`

Keep them intentionally restrained:
- depth 1-3 can vary font size/weight slightly
- depth 4-6 should not become visually noisy

**Step 3: Verify tests still pass**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS, since DOM classes remain stable after styling changes

### Task 4: Add composition regression coverage for heading decorations

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: Write the failing regression test**

Create a document with heading + paragraph, move the selection into the paragraph so the heading becomes inactive, then:
- dispatch `compositionstart`
- make a paragraph text change
- assert the inactive heading decoration remains stable during composition
- dispatch `compositionend`
- assert decorations are still present and only flushed once from final state

**Step 2: Run the targeted test to verify failure**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL if decoration recomputation is not synchronized with the composition guard

**Step 3: Apply the minimal controller fix if needed**

If the test fails because decoration dispatch is not guarded, fix only the decoration flush path in `src/renderer/code-editor.ts`. Do not alter save/autosave behavior.

**Step 4: Re-run the targeted tests**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS for the new regression plus all existing controller tests

### Task 5: Update task records after implementation

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Modify: `docs/progress.md`
- Modify: `MVP_BACKLOG.md`
- Create: `reports/task-summaries/TASK-010.md`

**Step 1: Record the rendering boundary**

In `docs/decision-log.md`, capture that `TASK-010`:
- keeps heading rendering inside CodeMirror decorations
- weakens markers instead of replacing heading DOM
- reuses the `TASK-035` composition guard boundary

**Step 2: Record verification evidence**

In `docs/test-report.md`, record the exact commands and outcomes used for `TASK-010`.

**Step 3: Update task status**

If implementation and verification are complete:
- mark `TASK-010` execution slices complete in `MVP_BACKLOG.md`
- advance `TASK-010` status in `docs/progress.md`

**Step 4: Write the task summary**

Create `reports/task-summaries/TASK-010.md` with:
- what changed
- what was verified
- residual risks for `TASK-011` to `TASK-013`

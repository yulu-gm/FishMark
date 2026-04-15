# TASK-011 Paragraph Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add minimal paragraph rendering so inactive top-level paragraphs gain light reading-oriented line styling while active paragraphs remain fully editable in Markdown source form.

**Architecture:** Extend the existing decoration pipeline in `src/renderer/code-editor.ts` so heading and paragraph inactive-state styling are derived from the same `blockMap + activeBlockState + composition guard` boundary. Use `Decoration.line` only; do not add widget replacement, text hiding, or React-side Markdown parsing.

**Tech Stack:** TypeScript, CodeMirror 6, React, Vitest, CSS

---

### Task 1: Add failing tests for inactive paragraph decorations

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: Write the first failing test**

Add a test from:

```ts
const source = ["Paragraph one", "", "Paragraph two"].join("\n");
```

Move the selection into `Paragraph two` and assert:
- the first paragraph line has `.cm-inactive-paragraph`
- the first paragraph line has `.cm-inactive-paragraph-leading`

**Step 2: Run the targeted test to verify failure**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL because paragraph decorations do not exist yet

**Step 3: Write the second failing test**

Add a test that moves selection out of the first paragraph and then back into it, asserting that the inactive paragraph classes disappear once that paragraph becomes active again.

**Step 4: Run the targeted test again**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL with missing paragraph decoration assertions

### Task 2: Unify heading and paragraph decoration derivation

**Files:**
- Modify: `src/renderer/code-editor.ts`

**Step 1: Refactor the decoration helper into a general block-decoration helper**

Replace the heading-only helper with one that derives a single `DecorationSet` plus a semantic signature from `ActiveBlockState`.

Rules:
- non-active `heading` blocks still emit the existing line + mark decorations
- non-active `paragraph` blocks emit:

```ts
Decoration.line({
  attributes: {
    class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
  }
}).range(block.startOffset)
```

**Step 2: Keep one effect / one state field**

Continue using the same `StateEffect<DecorationSet>` and `StateField<DecorationSet>` so heading and paragraph decorations are updated atomically.

**Step 3: Preserve existing guard semantics**

Make sure:
- selection changes recompute decorations
- document replacement recomputes decorations
- composition still delays all decoration changes until final flush

**Step 4: Run the targeted tests**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS for new paragraph decoration tests
- existing heading and IME tests stay green

### Task 3: Add paragraph rendering styles

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Add the base inactive paragraph style**

Add styles for:

```css
.document-editor .cm-inactive-paragraph
```

Use restrained reading-oriented styling:
- slightly softer color
- slightly more generous vertical rhythm

**Step 2: Add the leading emphasis variant**

Add styles for:

```css
.document-editor .cm-inactive-paragraph-leading
```

Keep it subtle; no box, no heavy card UI, no fake prose layout.

**Step 3: Re-run the targeted tests**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS

### Task 4: Add coexistence and composition regression coverage

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: Write the coexistence failing test**

Create a mixed document with heading + paragraph and assert:
- when paragraph is active, heading is inactive-rendered and paragraph is source-mode
- when selection moves away from paragraph, paragraph becomes inactive-rendered too

**Step 2: Write the composition regression failing test**

Start with two paragraphs, make the first inactive, then:
- dispatch `compositionstart`
- type into the active second paragraph
- assert inactive paragraph decoration stays stable during composition
- dispatch `compositionend`
- assert decoration flush count remains exactly one

**Step 3: Run the targeted test to verify failure**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- FAIL if paragraph decorations are not synchronized with the current guard path

**Step 4: Apply the minimal fix if needed**

If the regression fails, fix only the unified decoration recompute path in `src/renderer/code-editor.ts`.

**Step 5: Re-run the targeted tests**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected:
- PASS for coexistence, paragraph toggle, and composition regression coverage

### Task 5: Update task records after implementation

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Modify: `docs/progress.md`
- Modify: `MVP_BACKLOG.md`
- Create: `reports/task-summaries/TASK-011.md`

**Step 1: Record the paragraph rendering boundary**

In `docs/decision-log.md`, capture that `TASK-011`:
- keeps paragraph rendering in the shared CodeMirror decoration pipeline
- uses line-level styling only
- does not replace text or create fake rendered prose blocks

**Step 2: Record verification evidence**

In `docs/test-report.md`, record the exact commands and outcomes used for `TASK-011`.

**Step 3: Update task status**

If implementation and verification are complete:
- mark `TASK-011` execution slices complete in `MVP_BACKLOG.md`
- advance `TASK-011` status in `docs/progress.md`

**Step 4: Write the task summary**

Create `reports/task-summaries/TASK-011.md` with:
- what changed
- what was verified
- residual risks for `TASK-012` to `TASK-014`

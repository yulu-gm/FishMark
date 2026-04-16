# Yulora Editor Extension Factory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the remaining CodeMirror extension assembly glue out of `src/renderer/code-editor.ts` and into a reusable `packages/editor-core` factory that returns `Extension[]`.

**Architecture:** Extract the current renderer-owned CodeMirror setup into `packages/editor-core/src/extensions/markdown.ts`. The new factory should own the decorations `StateField` / `StateEffect`, markdown keymap registration, content attributes, update listener, IME composition guard, and focus/blur-driven derived-state recomputation. The renderer should keep only host concerns: creating `EditorView`, maintaining imperative controller methods, and wiring app-level callbacks.

**Tech Stack:** TypeScript 5.9, CodeMirror 6, React 19, Electron, Vitest

---

## Scope Decisions

- Do introduce `createYuloraMarkdownExtensions(...)` in `packages/editor-core`.
- Do inject `parseBlockMap` into the factory rather than importing it internally, to keep `editor-core` loosely coupled and testable.
- Do keep `runMarkdownEnter` / `runMarkdownBackspace` as explicit exports for imperative controller methods.
- Do preserve the current controller API in `src/renderer/code-editor.ts`.
- Do add focused tests around the new factory and keep the existing renderer controller regression suite green.
- Do **not** combine this slice with additional preload/workbench work.
- Do **not** redesign the controller API or add split-view/preview features in this slice.

### Task 1: Extract `createYuloraMarkdownExtensions(...)` Into `editor-core`

**Recommended Model:** `gpt-5.4`

**Files:**
- Create: `packages/editor-core/src/extensions/markdown.ts`
- Create: `packages/editor-core/src/extensions/markdown.test.ts`
- Create: `packages/editor-core/src/extensions/index.ts`
- Modify: `packages/editor-core/src/index.ts`
- Optional Modify: `packages/editor-core/src/derived-state/inactive-block-decorations.ts`

**Step 1: Write focused extension-factory tests first**

Create `packages/editor-core/src/extensions/markdown.test.ts` covering:

- `onContentChange` fires when the document changes
- `onActiveBlockChange` fires on initial mount and selection changes
- composition guard defers derived-state recompute until `compositionend`
- blur/focus transitions force derived-state refresh and invoke `onBlur`

Recommended harness pattern:

```ts
const state = EditorState.create({
  doc: source,
  extensions: createYuloraMarkdownExtensions({
    parseBlockMap,
    onContentChange,
    onActiveBlockChange,
    onBlur
  })
});

const view = new EditorView({ state, parent: host });
```

Use DOM event dispatch on `view.dom` for:

```ts
new FocusEvent("focusin", { bubbles: true })
new FocusEvent("focusout", { bubbles: true })
new CompositionEvent("compositionstart", { bubbles: true, data: "x" })
```

**Step 2: Run the new test before implementation**

Run: `npm run test -- packages/editor-core/src/extensions/markdown.test.ts`

Expected: FAIL because the extension factory does not exist yet.

**Step 3: Implement the extension factory**

Add `packages/editor-core/src/extensions/markdown.ts` with a public API like:

```ts
export type CreateYuloraMarkdownExtensionsOptions = {
  parseBlockMap: ParseBlockMap;
  onContentChange: (doc: string) => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  onBlur?: () => void;
};

export function createYuloraMarkdownExtensions(
  options: CreateYuloraMarkdownExtensionsOptions
): Extension[] { ... }
```

Implementation should own:

- `setBlockDecorationsEffect`
- `blockDecorationsField`
- `history()`
- markdown keymap using `runMarkdownEnter` / `runMarkdownBackspace`
- `EditorView.lineWrapping`
- `EditorView.contentAttributes`
- `EditorView.updateListener`
- DOM listeners for composition start/end and focus in/out
- block-map cache + inactive-decoration recompute

Recommended approach:

- keep closure-owned mutable state inside the factory:
  - `activeBlockState`
  - `hasEditorFocus`
  - `isCompositionGuardActive`
  - `hasPendingDerivedStateFlush`
  - `blockDecorationSignature`
- use `ViewPlugin.fromClass(...)` to attach DOM listeners and coordinate recompute with the update listener
- dispatch decoration changes through the internal `StateEffect`

`onActiveBlockChange` should still receive the same semantic updates as today.

**Step 4: Re-run focused verification**

Run:
- `npm run test -- packages/editor-core/src/extensions/markdown.test.ts`
- `npm run typecheck`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/editor-core/src/extensions packages/editor-core/src/index.ts packages/editor-core/src/derived-state/inactive-block-decorations.ts
git commit -m "refactor: add editor markdown extension factory"
```

### Task 2: Shrink `src/renderer/code-editor.ts` To A Host Controller

**Recommended Model:** `gpt-5.4`

**Files:**
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor.test.ts`
- Optional Modify: `packages/editor-core/src/index.ts`

**Step 1: Refactor the controller to consume the factory**

Replace the local extension assembly in `src/renderer/code-editor.ts` with:

```ts
const createState = (content: string) =>
  EditorState.create({
    doc: content,
    extensions: createYuloraMarkdownExtensions({
      parseBlockMap,
      onContentChange: options.onChange,
      onActiveBlockChange: (state) => {
        activeBlockState = state;
        options.onActiveBlockChange?.(state);
      },
      onBlur: options.onBlur
    })
  });
```

After this change, `code-editor.ts` should no longer define:

- `setBlockDecorationsEffect`
- `blockDecorationsField`
- the inline markdown keymap
- the inline update listener
- DOM composition/focus listeners

The file should primarily own:

- `EditorView` creation
- `replaceDocument`
- `insertText`
- `setSelection`
- `pressEnter`
- `pressBackspace`
- `destroy`

**Step 2: Add one focused structural regression assertion**

Update `src/renderer/code-editor.test.ts` with at least one assertion that exercises behavior still owned by the new extension factory, for example:

- `onBlur` still fires after the refactor
- composition flush still only dispatches one decoration update

Reuse existing tests where possible; avoid gratuitous new surface area.

**Step 3: Re-run renderer verification**

Run:
- `npm run test -- src/renderer/code-editor.test.ts`
- `npm run typecheck`

Expected: PASS

**Step 4: Re-run lint**

Run: `npm run lint`

Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/code-editor.ts src/renderer/code-editor.test.ts packages/editor-core/src/index.ts
git commit -m "refactor: consume editor extension factory in renderer"
```

### Task 3: Final API Tightening And Full Validation

**Recommended Model:** `gpt-5.4-mini` or `gpt-5.3-codex-spark`

**Files:**
- Modify: `packages/editor-core/src/index.ts`
- Optional Modify: internal tests under `packages/editor-core/src/*`

**Step 1: Remove stale public exports that the renderer no longer needs**

After Task 2, confirm whether these still need to be public:

- `createBlockMapCache`
- `deriveInactiveBlockDecorationsState`

If they are now only consumed by the extension factory, drop them from the root barrel and update any internal tests to import directly from their module paths.

**Step 2: Run full project verification**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected:

- `src/renderer/code-editor.ts` no longer owns CodeMirror extension glue
- `packages/editor-core` exports `createYuloraMarkdownExtensions(...)`
- all existing editor behavior remains green

**Step 3: Commit**

```bash
git add packages/editor-core/src/index.ts packages/editor-core/src/derived-state packages/editor-core/src/extensions
git commit -m "refactor: tighten editor core extension surface"
```

## Verification Notes

- `packages/editor-core/src/extensions/markdown.test.ts` should become the focused home for composition/focus/blur lifecycle behavior that used to be implicitly tested only via the renderer controller.
- `src/renderer/code-editor.test.ts` should remain the regression harness for user-visible editing behavior.
- If any Vitest command hits the known Windows sandbox `spawn EPERM` issue, rerun the same command with escalation and record that it was an environment limitation rather than a code failure.

## Recommended Execution Order

1. Task 1 first, because the factory shape determines how much glue can leave the renderer.
2. Task 2 second, because it proves the factory works under the real controller host.
3. Task 3 last, because API tightening should happen only after imports settle.

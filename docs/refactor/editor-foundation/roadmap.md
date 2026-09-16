# FishMark Editor Foundation Refactor Roadmap

> **For agentic workers:** execute one `RF-xxx` task at a time with `$fishmark-task-execution`; after implementation, use `$fishmark-architecture-acceptance` and `$fishmark-task-acceptance` before changing its status in `progress.md`. Do not combine multiple tasks into one uncontrolled diff.

**Goal:** rebuild FishMark around a revisioned main-process `DocumentSession`, a recursive Markdown structure model, incremental document caches, pure semantic editing commands, and a thin CodeMirror adapter so complex nested Markdown remains fast, round-trip safe, and consistent to edit.

**Architecture:** main owns the only writable business document state. Renderer-side CodeMirror is an optimistic input surface that submits revisioned edit batches; all renderer caches are derived, disposable, and tied to a document revision. Markdown parsing, semantic editing, CodeMirror integration, presentation, persistence, and React composition become explicit modules with one-way dependencies.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, micromark, Vite, Vitest, Playwright.

---

## 1. Program contract

**Program:** `REFACTOR-EDITOR-FOUNDATION`

**Status source:** `docs/refactor/editor-foundation/progress.md`

**Goal:** deliver a production-grade local-first Markdown editing foundation that supports recursive containers and predictable structural editing without retaining the current dual-state, duplicate-parser, duplicate-renderer, or React-owned business workflows.

### In scope

- A main-process canonical `DocumentSession` with monotonic revisions.
- Incremental edit batches instead of renderer-to-main full-document draft replacement.
- Per-document disk identity, external-change detection, save preconditions, autosave, close coordination, and crash recovery.
- A recursive Markdown document tree for nested lists, nested blockquotes, and mixed containers.
- Blockquote children that use the same paragraph, list, code fence, math, Mermaid, table, footnote, and inline semantics as top-level content.
- Incremental structure caching with safe invalidation, checkpointed reparsing, stable node identity, and full-parse fallback.
- A pure semantic editor model for Enter, Backspace, Delete, Tab, Shift+Tab, arrow navigation, formatting, tables, code fences, and selection normalization.
- A CodeMirror adapter that owns browser input, IME, selection mapping, decorations, widgets, viewport rendering, and editor lifecycle only.
- A shared semantic render plan consumed by editor presentation and HTML export.
- Renderer application clients/stores that keep React components presentation-only.
- Real Electron Playwright coverage for data-safety and editing-critical workflows.
- Security hardening, dead-code removal, documentation alignment, and architectural dependency gates.

### Out of scope

- Replacing Electron, React, CodeMirror, micromark, Vite, Vitest, or Playwright.
- Cloud synchronization, collaboration, accounts, plugin marketplace, or a proprietary document format.
- A utility-process parser or editor host. The incremental synchronous model must be measured before adding another process boundary.
- CRDT/OT collaboration semantics. Revision conflicts here protect local multi-window ownership and stale renderer messages.
- Adding new Markdown syntaxes while the foundation is being replaced, except syntax required to prove recursive container parity.
- Reformatting whole Markdown documents during save or structural edits.

### Primary risks

- IME composition, selection mapping, undo/redo grouping, and cursor geometry.
- Data loss during save, autosave, external changes, window close, process crash, and revision mismatch.
- Round-trip changes caused by normalizing list, quote, table, or fence syntax.
- Parser cache invalidation returning a structurally stale tree.
- Long-document input latency and repeated full-document work.
- Temporary migration paths becoming permanent compatibility code.

### Required verification classes

- Pure parser/editor-model tests for every semantic rule.
- Differential tests comparing incremental parse results with a fresh full parse.
- CodeMirror integration tests for transactions, selection, history, IME guards, and decorations.
- Main/application tests for revision, persistence, watch, conflict, recovery, and close flows.
- Playwright Electron scenarios for real open/edit/save/reload/close processes.
- Visual and geometry probes for cursor, list, blockquote, table, code, and hidden marker behavior.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` at every code task acceptance.

## 2. Non-negotiable architecture decisions

### 2.1 One writable document truth

The main-process application owns `DocumentSession`. React state, workspace projections, CodeMirror wrappers, outline state, metrics, caches, and render plans must not become independently writable document models.

CodeMirror may display unacknowledged local input so typing remains synchronous. Those changes are represented only as an ordered `PendingEditQueue`; they are commands awaiting acknowledgement, not a second workspace snapshot. Save, autosave, move-tab, detach-tab, reload, and close operations must first cross an explicit `flushEdits()` barrier.

### 2.2 Revisioned incremental editing

The shared edit contract is based on repository-owned plain data types:

```ts
export type DocumentRevision = number;

export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export type ApplyDocumentEditsInput = {
  tabId: string;
  clientId: string;
  clientSequence: number;
  baseRevision: DocumentRevision;
  changes: readonly TextChange[];
};

export type ApplyDocumentEditsResult =
  | {
      kind: "applied";
      revision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "revision-conflict";
      canonicalRevision: DocumentRevision;
      canonicalText: string;
    }
  | {
      kind: "error";
      error: { code: string; message: string };
    };
```

Rules:

- Changes are sorted, non-overlapping, and expressed against `baseRevision`.
- A session increments its revision once per accepted batch.
- Duplicate `clientSequence` values are idempotent.
- A stale batch is never silently applied to newer text.
- Revision-conflict recovery preserves the unacknowledged local batch, reloads canonical text, remaps the pending changes, and either reapplies safely or opens an explicit recovery document. It never discards input silently.
- Normal edit acknowledgements do not send the full document back to renderer.

### 2.3 Reusable text buffer without domain leakage

`workspace-domain` defines a `TextBuffer` interface but does not expose CodeMirror types. The infrastructure implementation wraps the persistent `Text` implementation from `@codemirror/state`; this avoids inventing a rope while keeping CodeMirror-specific types outside the domain API.

```ts
export interface TextBuffer {
  readonly length: number;
  apply(changes: readonly TextChange[]): TextBuffer;
  slice(from: number, to?: number): string;
  toString(): string;
}
```

`@codemirror/state` becomes an explicit runtime dependency because main uses its persistent text data structure. Only `workspace-infrastructure` imports `Text`; all other layers depend on `TextBuffer`.

### 2.4 Derived caches are not document truth

Every cache key includes `tabId`, `revision`, parser dialect, and relevant subtree hash. Cache values are immutable. A cache can be dropped and rebuilt from canonical text without changing behavior.

No cache may:

- accept arbitrary content writes outside an edit transaction;
- be used as the save source;
- survive a revision mismatch without validation;
- hide a parser inconsistency;
- create a second dirty/save state.

### 2.5 No permanent compatibility structure

- A migration adapter may exist only inside its owning milestone.
- The milestone cannot be marked complete until the previous API, implementation, tests, exports, aliases, and documentation are deleted.
- No `legacy`, `compat`, `v2`, `new-*`, dual parser flag, dual command router, or fallback-to-old-engine module may remain at program completion.
- Parser fallback means a fresh parse in the new parser, not a call to the old parser.
- `progress.md` records every required deletion explicitly.

## 3. Target dependency graph

```text
workspace-domain             markdown-engine
       ▲                           ▲
       │                           │
workspace-application        editor-model
       ▲                           ▲
       │                           │
main infrastructure      markdown-presentation
       ▲                           ▲
       │                           │
shared IPC contracts      codemirror-adapter
       ▲                           ▲
       └──────── renderer application client ────────┐
                                                     ▼
                                              React presentation
```

Allowed dependencies:

- `workspace-domain` depends only on TypeScript/runtime-neutral utilities.
- `workspace-application` depends on `workspace-domain` and declared ports.
- `markdown-engine` is independent of React, Electron, DOM, and CodeMirror.
- `editor-model` depends on `markdown-engine` and runtime-neutral utilities.
- `markdown-presentation` depends on `markdown-engine`, not CodeMirror or React.
- `codemirror-adapter` depends on `editor-model`, `markdown-presentation`, and CodeMirror.
- `src/main` depends on workspace application/domain and platform infrastructure.
- `src/preload` depends only on shared contracts and Electron bridge primitives.
- `src/renderer` depends on shared contracts, application clients, presentation, and the CodeMirror adapter.

Forbidden dependencies:

- React/Electron/DOM imports in `workspace-domain`, `workspace-application`, `markdown-engine`, or `editor-model`.
- Direct filesystem, dialog, watcher, or IPC calls from React components.
- Direct CodeMirror `EditorView` access from application controllers.
- Renderer imports from `src/main` or `src/preload`.
- HTML export reparsing syntax independently of the canonical Markdown tree.
- Editor commands scanning Markdown with feature-specific regular expressions when the structure exists in `EditorSemanticContext`.

## 4. Target file structure

Public package names are fixed as:

- `@fishmark/workspace-domain`
- `@fishmark/workspace-application`
- `@fishmark/workspace-infrastructure`
- `@fishmark/markdown-engine`
- `@fishmark/editor-model`
- `@fishmark/markdown-presentation`
- `@fishmark/codemirror-adapter`

Each package exposes only `src/index.ts`; consumers cannot import package internals.

```text
packages/
  workspace-domain/src/
    document-session.ts
    document-revision.ts
    disk-version.ts
    text-buffer.ts
    workspace-state.ts
    index.ts
  workspace-application/src/
    ports.ts
    workspace-application.ts
    apply-document-edits.ts
    save-document.ts
    resolve-external-change.ts
    close-workspace.ts
    recovery.ts
    index.ts
  workspace-infrastructure/src/
    codemirror-text-buffer.ts
    index.ts
  markdown-engine/src/
    model/source-range.ts
    model/markdown-node.ts
    model/container-path.ts
    model/document-tree.ts
    parse/full-document-parser.ts
    parse/micromark-event-adapter.ts
    parse/parse-checkpoint.ts
    cache/document-structure-cache.ts
    cache/invalidation-range.ts
    cache/incremental-document-parser.ts
    index/reference-index.ts
    index/footnote-index.ts
    index.ts
  editor-model/src/
    physical-lines/physical-editing-document.ts
    physical-lines/prefix-segment.ts
    context/editor-semantic-context.ts
    context/selection-context.ts
    transactions/edit-transaction-plan.ts
    commands/enter.ts
    commands/backspace.ts
    commands/delete.ts
    commands/indent.ts
    commands/navigation.ts
    commands/formatting.ts
    commands/table.ts
    commands/code-fence.ts
    derived/editor-derived-snapshot.ts
    index.ts
  markdown-presentation/src/
    render-plan.ts
    build-render-plan.ts
    inline-render-plan.ts
    html/render-html.ts
    html/render-html-document.ts
    index.ts
  codemirror-adapter/src/
    create-editor.ts
    transaction-adapter.ts
    pending-edit-queue.ts
    selection-mapper.ts
    composition-controller.ts
    derived-state-field.ts
    decorations/block-decorations.ts
    decorations/inline-decorations.ts
    decorations/viewport-render-plan.ts
    interactions/interaction-registry.ts
    interactions/table-interaction.ts
    interactions/code-fence-interaction.ts
    index.ts
src/
  shared/
    document-edit.ts
    document-projection.ts
    workspace-command.ts
    product-bridge.ts
  main/
    infrastructure/document-repository.ts
    infrastructure/file-watch-registry.ts
    infrastructure/recovery-journal.ts
    infrastructure/workspace-persistence.ts
    ipc/register-workspace-handlers.ts
    ipc/register-preference-handlers.ts
    ipc/register-theme-handlers.ts
    main.ts
  preload/
    product-api.ts
    test-api.ts
    preload.ts
  renderer/
    application/workspace-client.ts
    application/workspace-store.ts
    application/editor-command-gateway.ts
    editor/CodeEditorHost.tsx
    editor/App.tsx
    editor/WorkspaceShell.tsx
    editor/components/
    export-html.ts
tests/
  e2e/
    fixtures/
    editing/
    persistence/
    performance/
```

Existing filenames may move only through the tasks below. Do not create empty package scaffolds that are not consumed in the same task.

## 5. Canonical data models

### 5.1 Document session

```ts
export type DocumentSession = {
  tabId: string;
  windowId: string;
  path: string | null;
  name: string;
  text: TextBuffer;
  revision: DocumentRevision;
  savedRevision: DocumentRevision;
  savedTextHash: string;
  diskVersion: DiskVersion | null;
  saveState: "idle" | "manual-saving" | "autosaving";
  externalState: ExternalDocumentState;
  recoveryState: RecoveryState;
};
```

`isDirty` is always derived as `revision !== savedRevision`; it is not independently assigned.

### 5.2 Disk version

```ts
export type DiskVersion = {
  normalizedPath: string;
  mtimeMs: number;
  size: number;
  contentHash: string;
};
```

Stat changes trigger a content hash comparison. Save checks the current disk version immediately before writing. A mismatch transitions the session to an external-conflict state and returns a typed result; it never proceeds as an ordinary save.

### 5.3 Recursive Markdown tree

```ts
export type MarkdownNode =
  | DocumentNode
  | BlockquoteNode
  | ListNode
  | ListItemNode
  | ParagraphNode
  | HeadingNode
  | CodeFenceNode
  | IndentedCodeNode
  | TableNode
  | BlockMathNode
  | MermaidNode
  | FootnoteDefinitionNode
  | ThematicBreakNode
  | HtmlImageNode;

export type MarkdownNodeBase = {
  nodeId: string;
  type: MarkdownNode["type"];
  sourceRange: SourceRange;
  contentRange: SourceRange;
  lineRange: { from: number; to: number };
  containerPath: ContainerPath;
  contentHash: string;
};
```

Containers own `children`. Leaf nodes never re-scan parent source to discover nested blocks. Offsets always refer to the original Markdown source.

### 5.4 Container path and prefix map

```ts
export type ContainerPathEntry =
  | { kind: "blockquote"; nodeId: string; depth: number }
  | { kind: "list"; nodeId: string; ordered: boolean; depth: number }
  | { kind: "list-item"; nodeId: string; index: number }
  | { kind: "code-fence"; nodeId: string; language: string | null }
  | { kind: "table"; nodeId: string };

export type PrefixSegment = {
  kind: "quote" | "indent" | "list-marker" | "task-marker" | "spacing";
  sourceRange: SourceRange;
  visibleWidth: number;
};
```

The same prefix map drives semantic edits, hidden markers, cursor mapping, soft-wrap geometry, and rendering classes.

### 5.5 Derived snapshot

```ts
export type EditorDerivedSnapshot = {
  tabId: string;
  revision: DocumentRevision;
  documentTree: MarkdownDocumentTree;
  physicalDocument: PhysicalEditingDocument;
  referenceIndex: ReferenceIndex;
  footnoteIndex: FootnoteIndex;
  outline: readonly OutlineHeading[];
  metrics: DocumentMetrics;
};
```

There is one derived snapshot per confirmed revision plus one optimistic snapshot for the ordered pending batch. Outline, metrics, decorations, commands, and export consume this snapshot instead of reparsing.

## 6. Incremental document structure cache

### 6.1 Cache layers

1. `TextBuffer`: persistent text storage in main.
2. `LineIndex`: line starts and line-break forms mapped through changes.
3. `ParseCheckpointIndex`: parser state at safe block boundaries.
4. `DocumentTreeCache`: immutable recursive nodes with stable IDs and hashes.
5. `InlineAstCache`: leaf inline trees keyed by node ID, content hash, and dialect.
6. `GlobalDefinitionIndex`: references and footnotes with reverse dependencies.
7. `EditorDerivedSnapshot`: physical lines, outline, metrics, and semantic lookup indexes.
8. `RenderPlanCache`: viewport-scoped presentation plan.

### 6.2 Invalidation algorithm

For each accepted `TextChange[]`:

1. Map the smallest changed source range into the previous revision.
2. Expand backward to the nearest stable checkpoint outside an open fence/container continuation.
3. Expand forward while parser checkpoint state or subtree hashes differ.
4. Reparse that source window with the same micromark dialect.
5. Reuse unchanged nodes before and after the window.
6. Map reused offsets through the change set.
7. Rebuild only affected container ancestors, physical lines, definition dependencies, outline entries, metrics deltas, and render plans.
8. If a stable checkpoint cannot be proven, perform a fresh parse with the new parser and record the fallback reason.

### 6.3 Correctness gates

- Incremental and fresh parse outputs are normalized and compared in development/differential tests.
- Comparison includes node types, nesting, source/content ranges, markers, container paths, inline AST, references, footnotes, and table metadata.
- Fuzz-like deterministic edit sequences cover inserts, deletes, replacements, line joins, line splits, fence edits, marker edits, and edits at checkpoint boundaries.
- A cache mismatch is a test failure, never an accepted approximation.
- Production fallback counters are observable but contain no document content.

### 6.4 Performance rules

- Selection-only transactions do not parse Markdown.
- A typical single-line edit does not parse the whole document.
- Outline and metrics update from deltas or reused nodes.
- Decorations are built for the viewport, active node path, and required adjacent structural lines only.
- KaTeX, Mermaid, and language highlighters remain lazy and cannot block the synchronous input path.
- No background worker is introduced in this program. If the completed incremental model fails the performance gate, a separate measured decision is required rather than hiding a second document engine in a worker.

## 7. Editing behavior contract

Editing experience is the highest-priority acceptance area. A structural command is incomplete until source, selection, visible geometry, undo grouping, IME safety, and repeated-operation behavior are all proven.

### 7.1 Command boundary

Pure commands accept `EditorSemanticContext` and return an `EditTransactionPlan`. They do not access DOM, React, Electron, or `EditorView`.

```ts
export type EditTransactionPlan = {
  baseRevision: DocumentRevision;
  changes: readonly TextChange[];
  selection: { anchor: number; head: number };
  intent: EditIntent;
  affectedNodeIds: readonly string[];
  historyGroup: "input" | "structure" | "format";
};
```

### 7.2 Routing order

```text
composition guard
→ table interaction
→ fenced/indented code
→ list item
→ blockquote
→ heading/paragraph
→ plain physical line
```

The deepest applicable container handles the action first. Parent containers contribute prefixes and exit behavior but do not replace the leaf semantic rule.

### 7.3 Enter

- A non-empty list item continues the same list kind and preserves every parent quote prefix.
- An empty nested list item exits exactly one list level.
- An empty root list item exits the list into a paragraph inside its current parent container.
- Exiting a list inside a blockquote returns to blockquote text before it can exit the quote.
- Enter in blockquote text creates a structural quote separator and the next quote paragraph.
- Enter on an empty quote paragraph exits exactly one quote level.
- Enter inside a code fence follows code indentation/fence rules and preserves parent quote/list prefixes.
- Enter in a heading splits at the selection and creates a paragraph where appropriate without copying the heading marker.
- Every automatic marker/prefix insertion is one undoable history group.

### 7.4 Backspace and Delete

- Ordinary content deletion stays ordinary text deletion.
- At content start, structure degrades one explicit step: task marker, list marker, list indentation, quote layer, then plain paragraph.
- A nested item subtree moves together; the first line cannot detach from its children.
- Hidden marker selection maps to real source offsets before changes are planned.
- Deleting a range recomputes the destination `ContainerPath`; it cannot reuse stale semantic context.
- Joining blocks preserves the existing Markdown spelling unless the exact join requires a local marker change.

### 7.5 Tab and Shift+Tab

- Indent/outdent changes the selected list-item subtree, not only the active line.
- Quote prefixes are retained when a list moves inside a blockquote.
- Table and code-fence interactions have explicit adapters and do not fall through to list indentation.
- An invalid indent returns no transaction instead of manufacturing malformed Markdown.

### 7.6 Cursor, selection, and IME

- Arrow navigation uses visible physical lines and prefix maps.
- Pointer, structural arrow, printable input, and programmatic navigation have separate normalization policies.
- Printable input never triggers structural cursor movement.
- Composition updates do not rebuild geometry-changing decorations or run structural completion.
- `compositionend` applies one incremental structure update from the final text.
- Source/WYSIWYM switches preserve document revision, selection, scroll, history, and pending edit order.

### 7.7 Recursive parity matrix

Every command must cover at least these container paths:

```text
Document → Paragraph
Document → List → ListItem → Paragraph
Document → List → ListItem → List → ListItem → Paragraph
Document → Blockquote → Paragraph
Document → Blockquote → Blockquote → Paragraph
Document → Blockquote → List → ListItem → Paragraph
Document → Blockquote → List → ListItem → CodeFence
Document → List → ListItem → Blockquote → Paragraph
Document → List → ListItem → Blockquote → List → ListItem → Paragraph
Document → Blockquote → Blockquote → List → ListItem → BlockMath
```

Automated coverage uses depths 0 through 8, mixed ordered/unordered/task lists, empty/whitespace/content lines, line-start/middle/end selections, range selections, repeated keys, undo/redo, source mode, WYSIWYM, and save/reopen round trips.

## 8. Performance budgets

The performance fixture is a committed deterministic Markdown document, not a mutable file under `tmp/`.

| Scenario | Required budget |
| --- | --- |
| 5,000-line mixed document initial editor-ready time | ≤ 500 ms on the recorded baseline Windows machine |
| 20,000-line mixed document initial editor-ready time | ≤ 1,500 ms on the recorded baseline Windows machine |
| 20,000-line ordinary single-character edit synchronous semantic work | p95 ≤ 16 ms |
| 20,000-line Enter/Backspace structural edit synchronous semantic work | p95 ≤ 24 ms |
| Selection-only movement | zero full parses |
| Single-line ordinary edit | zero full parses after warm cache |
| Initial open | one full structure build maximum |
| Forced cache fallback during stable ordinary typing sequence | zero |
| Open-period forced decoration rebuilds | ≤ 2 |
| Outline/metrics | must not block first editor paint |

The baseline report records CPU, memory, Electron version, fixture hash, warm/cold status, median, p95, parse windows, reused nodes, invalidated nodes, and fallback reasons.

## 9. Delivery and deletion policy

- One `RF-xxx` task per implementation diff.
- Each task starts from the latest accepted task and ends with focused tests, full required gates, documentation, and a task summary.
- Every task that changes TypeScript, CSS, runtime configuration, build scripts, fixtures consumed by tests, or test code must run the task's focused commands followed by the complete project gate below. Focused commands never replace the complete gate.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

- A milestone may temporarily contain both paths while its tasks are in progress, but the final task in that milestone is always a hard cutover and deletion task.
- A milestone with remaining old exports/imports cannot be marked complete.
- Feature development that touches the migrating boundary pauses until the owning milestone completes.
- Existing user changes outside the active task remain untouched.
- No task pushes or merges unless explicitly requested for that execution session.

## 10. Milestone roadmap

### Milestone 0 — Freeze invariants and executable baselines

#### RF-001: Editing behavior baseline

**Outcome:** current intentional behavior is represented as source/selection/geometry/undo fixtures before the engine moves.

**Files:**

- Create: `fixtures/editor-behavior/manifest.ts`
- Create: `fixtures/editor-behavior/nested-containers.ts`
- Create: `fixtures/editor-behavior/execution-plan.ts`
- Create: `fixtures/editor-behavior/runner-protocol.ts`
- Create: `fixtures/editor-behavior/current-observations.ts`
- Create: `fixtures/editor-behavior/raw-cases.ts`
- Create: `packages/test-harness/src/scenarios/editor-behavior-matrix.ts`
- Create: `packages/test-harness/src/handlers/editor-behavior-batch.ts`
- Create: `src/renderer/editor-behavior-manifest-runner.ts`
- Create: `src/renderer/editor-behavior-observer.ts`
- Create: `scripts/probe-editor-behavior.mjs`
- Create: `scripts/editor-behavior-process-launcher.mjs`
- Create: `scripts/process-tree.cjs`
- Modify: `docs/test-cases.md`

**Steps:**

- [x] Convert existing Typora oracle cases and FishMark probes into typed behavior cases.
- [x] Add missing mixed-container cases from the recursive parity matrix.
- [x] Record expected source, selection, visible line roles, and undo result for every case.
- [x] Register one Electron batch runner that filters by exact case, command, or container path.
- [x] Run all 121 cases / 2,541 targets against the current implementation and store 2,007 explicit verified targets plus 534 exact target-level known-defect observations.
- [x] Bind calibration to independent execution/desired-contract hashes, the exact run ID, and sorted target/value sets through a deterministic calibration hash; require the two explicit target sets to be unique, disjoint, typed, and complete before persisting zero-gap evidence.
- [x] Route the public `electron-batch` scenario capability to the same atomic formal runner and verify exactly one real `BrowserWindow`.
- [x] Await cross-platform process-tree termination on launcher timeout, adapter failure/abort, and public CLI timeout/abort, including registered descendants whose root has already exited.
- [x] Read the Typora oracle catalog and capture JSON directly; validate every captured initial/action/final field and explicitly mark uncaptured checkpoint/aspect coverage.
- [x] Store no screenshots, raw reports, or generated artifacts in the manifest itself.

**Verification:**

```powershell
npm.cmd run test -- packages/test-harness src/renderer/editor-test-driver.test.ts
npm.cmd run test:editor-behavior
npm.cmd run test:scenario -- --id editor-behavior-matrix --step-timeout 180000 --no-artifacts
npm.cmd run test:editing-experience
```

**Exit:** every editing-critical behavior has an executable expectation; known defects are explicit and are not silently frozen as desired behavior.

#### RF-002: Architecture and performance guards

**Outcome:** dependency violations, duplicate parse entry points, and performance regressions become test failures.

**Files:**

- Create: `src/main/editor-foundation-architecture.test.ts`
- Create: `packages/editor-core/src/performance/editor-foundation-baseline.test.ts`
- Create: `fixtures/performance/complex-20000-lines.md`
- Modify: `scripts/analyze-renderer-bundle.mjs`

**Steps:**

- [x] Add import-boundary assertions for the target packages as they appear.
- [x] Add forbidden-symbol checks for retired APIs listed in each cutover task.
- [x] Move the stress document from `tmp/` into a deterministic fixture with a recorded hash.
- [x] Capture current open/edit/selection/derived-state counters as the comparison baseline.
- [x] Make reports distinguish full parse, incremental parse window, cache hit, invalidated nodes, and decoration rebuild.

**Verification:**

```powershell
npm.cmd run test -- src/main/editor-foundation-architecture.test.ts packages/editor-core/src/performance
npm.cmd run perf:baseline
```

**Exit:** future tasks cannot claim architectural or performance improvement without machine-readable evidence.

### Milestone 1 — Canonical workspace domain

#### RF-101: Extract workspace domain

**Status:** `COMPLETE` on 2026-07-28.

**Acceptance:** independent architecture acceptance `PASS` over `f5aa70b..003d4d5` with P0/P1/P2 all zero and no open questions; formal task acceptance `PASS` with fresh focused, full, static, build, editor-behavior, residue, and documentation gates recorded in `reports/task-summaries/RF-101.md`.

2026-07-28 formal architecture P1 closure: the first formal review found one remaining renderer compatibility owner in `editor-shell-state.ts`. Optional `currentEditorContent` / `preserveActiveDocumentDraft` inputs, `preserveCurrentActiveDocumentDraft()`, and an option-sensitive reload decision could reconcile text outside the application identity/outbox/FIFO; `getWorkspaceTabs()` was also a dead export. Repository scans confirmed no callers. All of these surfaces and their exclusive import are deleted. `applyWorkspaceSnapshot()` is now a canonical-only projector, and an architecture source guard prevents the obsolete tokens from returning. RED was 183/184 and GREEN 184/184; related focus is 4 files / 391 tests and renderer focus is 13 files / 677 tests, with typecheck, lint, and build green. At that execution checkpoint the task remained `DEV_DONE`; the later independent re-review and formal task acceptance passed.

2026-07-28 post-review renderer closure: active reload/close/detach/window-close cross a tokenized `sealing -> sealed -> releasing` barrier owned by `WorkspaceRendererApplication`. Destructive IPC cannot start until `CodeEditorView` has applied and acknowledged exact-token hard read-only; the acknowledgement boundary captures the last accepted input, invalidates the old binding, and drains the exact outbox. Release advances editor identity before edits resume, but only a real active canonical success installs a fresh CodeMirror state and clears undo/redo; cancel/stale/error and inactive-target operations preserve the current editor state/history. Reload retains one bounded operation-local sealed-content checkpoint until typed success, including when its outbox entry was already acknowledged. Admission plus post-await lifecycle fences ensure disposed work cannot create an unacknowledged barrier, accept late state, or continue into a later destructive/reconciliation side effect. Renderer tests consume an application-owned typed adapter and real editor gestures, with raw snapshot injection/mutation and dead owner APIs deleted. Post-review focus is 13 files / 677 tests. Fresh typecheck, lint, build, and escalated full Vitest pass at 163 files / 2,052 tests plus 1 explicit skip out of 2,053 total. This was development evidence; independent architecture and task acceptance later passed on 2026-07-28.

2026-07-28 closure: main now resolves separate canonical-location and filesystem-object identities (`dev + ino` when reliable, canonical-path fallback only when object IDs are explicitly unsupported or unreliable), and the domain enforces one editable session through both registries across all windows. Owner lookup is a total `none | owned | ambiguous` result, so a location/object split across different tabs fails closed. Open resolves a prospective canonical location before taking its location lease, then resolves the existing object inside the lease. Duplicate open validates `tab -> location -> object`, releases every lease, and sends a bounded typed activation request to the owner renderer. Renderer workspace transactions are now owned by one non-React `WorkspaceRendererApplication`: canonical state is explicitly known/unknown, all bridge mutations and saves share one FIFO, and per-tab outbox entries carry monotonic generations. CodeMirror may write only through an acknowledged `{ tabId, epoch, loadRevision }` identity consumed after exact document replacement. Same-tab canonical replacement and reload invalidate the old identity. Explicit reload makes the editor read-only while dispatched; only typed success discards drafts through the dispatch cutoff, while transport-failure reconciliation preserves and overlays the draft. Close/detach drain their target tab, native close drains every outbox entry, and all failures are fail-closed. Save captures the invocation tab and performs pre-save drain, exact-tab Save/Save As, post-save drain, and canonical reconciliation without releasing the FIFO. Unknown mutation completion must reconcile before any later structural/save/close command can dispatch. Renderer hooks now subscribe and map outcomes only; the previous hook-owned queue, canonical refs, draft retry lane, and split save orchestration are deleted. Main still reacquires the owner tab lease, revalidates typed ownership, the exact `BrowserWindow` object, and `activeTabId === requested tab` before focus. Save/Save As/reload use the same lock order, mixed location/object conflicts are checked independently, and native close-save can enter held-lease IO only with an opaque, active coordinator capability. Hard-link aliases, prospective-missing-to-existing materialization, open/close or open/move races, mixed-index migration, same-tab stale buffers, reload transport ambiguity, late draft responses, and save/open/activation interleavings cannot create two renderer truths. This closure was later accepted without a compatibility exception.

**Outcome:** workspace/tab/session rules are pure and no longer owned by `src/main/workspace-service.ts`.

**Files:**

- Create: the production `packages/workspace-domain/` package, with public-entry-only imports, revision/session/buffer/state modules, declarations, tests, and an emitted-runtime verifier.
- Create: `src/main/workspace-ipc-projection.ts` as the immutable domain projection to mutable shared IPC DTO boundary.
- Create: focused main use cases for reload, reorder, detach/transfer, live window registration, file operations, owner-aware mutation results, per-document IO coordination, native window-close leases, and a bounded close-request broker, each operating on the one injected `WorkspaceState` and coordinator where ownership or IO is involved. Reload exposes one explicit `success | revision-stale | error(code)` result from main through renderer instead of treating a newer draft or an identity/read failure as a successful snapshot or IPC rejection.
- Modify: package/build configuration, architecture guards, main composition, workspace application, and close coordination.
- Delete after cutover: `src/main/workspace-service.ts` and `src/main/workspace-service.test.ts`.

**Steps:**

- [x] Define immutable projections and internal mutable session ownership separately.
- [x] Derive dirty state from revision equality and retain an exact saved-text checkpoint.
- [x] Port create/open/activate/close/reorder/move/detach rules into pure domain operations.
- [x] Serialize renderer workspace snapshot writers through one per-window FIFO coordinator and preserve unsent text in a per-tab exact-ack draft outbox; activation transport ambiguity reconciles from main and committed activation failures never start a rollback race.
- [x] Hard-cut renderer orchestration to one non-React transaction service, generation-aware outbox lifecycle, explicit canonical unknown admission, epoch-bound CodeMirror load acknowledgement, reload read-only/cutoff semantics, drain-all native close, and invocation-bound save transactions; delete the hook-owned compatibility paths.
- [x] Update main callers to consume only the package public API and map projections at the main IPC boundary.
- [x] Bind Save, Save As, reload, and close IO/confirmation workflows to captured owner/revision and the relevant checkpoint so stale completion fails closed.
- [x] Serialize Save, Save As, reload, and individual close per tab through one main-owned FIFO coordinator while allowing unrelated tabs to proceed independently.
- [x] Keep each ordinary Save's watcher begin/write/commit/recent/complete/resync lifecycle inside that same per-tab lease, so a second save cannot open or write before the first watcher transaction is closed.
- [x] Make canonical session state the only file-identity authority: renderer/preload Save, Save As, and reload commands carry only `tabId`; main derives Save/reload targets and Save As default path from the lease-time checkpoint. Watch sync carries no renderer-selected tab/path and is serialized per window while deriving the latest canonical active path.
- [x] Separate persisted adapter documents (`path: string`) from nullable untitled workspace projections; validate adapter success objects at runtime and commit ordinary Save/reload identity only from the captured canonical checkpoint.
- [x] Make the watch application stateless and keep all watcher correctness in one per-`webContents` latest-intent state machine: track desired path/path epoch, exact latest sync admission, entry identity, monotonic observation identity, exact internal-write identity, and a destroy tombstone; run every stat outside state mutation, commit only through short exact-identity CAS, let begin-write follow superseding admissions without stale head-of-line blocking, silence every callback captured during an internal write, make only the latest normal callback baseline-producing, and update authoritative state before safe watcher close/rollback/destruction.
- [x] Make full-draft mutation an owner-aware compare-and-set: main derives `expectedWindowId` only from the invoking renderer, the domain returns a total applied/stale result, and a stale renderer cannot mutate or receive the new owner's projection.
- [x] Serialize cross-window move and ready-time detach transfer through the same per-tab coordinator used by document IO, with source ownership revalidated inside the lease; waiting for detach target readiness never holds the lease.
- [x] Make reorder an owner-aware total domain mutation and serialize it through that same per-tab coordinator. Main derives `expectedWindowId` from the invoking sender, so a delayed request from a previous owner fails without mutating or exposing the target window.
- [x] Treat owner/missing mutation results after Save, Save As, and reload as explicit failures instead of false success. A reload post-read revision race returns `revision-stale`; identity/read/conflict failures return a stable typed error; neither path carries a projection, updates recency, clears conflict, or unblocks autosave. Only an applied reload returns `success` and replaces renderer state.
- [x] Hold a stable multi-tab lease across the native window-close renderer handshake until the window is unregistered; carry the same `requestId` from REQUEST through renderer draft flush and CONFIRM, bind the immutable ordered owner/revision confirmation to that exact `{ windowId, requestId }` generation, permit only one confirmation scope per generation, and keep the lease until that scope drains after renderer abort/window destruction. The coordinator issues an opaque active capability for the exact owned tab set; held-lease Save/Save As validate it at runtime, and main composes one file-operations facade rather than a compatibility duplicate.
- [x] Split native-close liveness into two bounded phases: the transport timer ends at the first exact CONFIRM begin, active native UI has no timer, and an independent post-confirm watchdog begins only after the confirmation scope finishes while COMPLETE is still missing.
- [x] Make detach a ready-gated two-phase operation: keep the tab in the source before ready, revalidate source ownership at ready, then atomically move the latest canonical session. Timeout, load failure, or target close while transfer waits for its shared tab lease rejects both detach and ready, destroys the target, and cannot create a domain window or main binding; an executable registration application captures the live sender-owned `BrowserWindow` and ID before ready, revalidates the same live identity after ready, then registers, binds, and focuses in strict order.
- [x] Give every concurrent ready notification for one detach target the exact same in-flight Promise and settlement. No caller may pass registration before transfer completes; timeout, close, and load failure reject every caller with one authoritative lifecycle error and destroy the target once.
- [x] Delete the old service, test, types, imports, and exports in the same task.
- [x] Verify no renderer imports internal session types; preserve workspace snapshot DTOs, hard-cut reload to its single discriminated result, and hard-cut the native-close bridge to the single request-bearing protocol with no parameterless compatibility path.

**Verification:**

```powershell
npm.cmd run test -- packages/workspace-domain src/main/keyed-operation-coordinator.test.ts src/main/workspace-tab-reorder-application.test.ts src/main/workspace-tab-transfer-application.test.ts src/main/workspace-mutation-result.test.ts src/main/workspace-window-close-application.test.ts src/main/workspace-window-close-request-broker.test.ts src/main/workspace-window-registration-application.test.ts src/main/workspace-document-io.integration.test.ts src/main/workspace-application.test.ts src/main/workspace-reload-application.test.ts src/main/workspace-detach-application.test.ts src/main/workspace-close-coordinator.test.ts src/main/workspace-file-operations.test.ts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** accepted on 2026-07-28. The implementation has one pure workspace domain, one live main-owned `WorkspaceState`, immutable projections, sender-derived owner CAS, captured-revision save semantics, explicit reload staleness, one coordinated transaction order, bounded native-close leases, and no compatibility wrapper or obsolete service symbol. RF-102 subsequently completed the M1 application boundary on 2026-07-30.

#### RF-102: Extract workspace application ports and use cases

**Outcome:** main IPC handlers call explicit use cases instead of orchestrating workflows in `main.ts`.

**Files:**

- Create: `packages/workspace-application/src/ports.ts`
- Create: `packages/workspace-application/src/workspace-application.ts`
- Create: `packages/workspace-application/src/open-workspace.ts`
- Create: `packages/workspace-application/src/reload-document.ts`
- Create: `packages/workspace-application/src/tab-reorder.ts`
- Create: `packages/workspace-application/src/tab-transfer.ts`
- Create: `packages/workspace-application/src/detach-workspace.ts`
- Create: `packages/workspace-application/src/owner-activation.ts`
- Create: `packages/workspace-application/src/apply-document-edits.ts`
- Create: `packages/workspace-application/src/save-document.ts`
- Create: `packages/workspace-application/src/close-workspace.ts`
- Create: `packages/workspace-application/src/index.ts`
- Create: `packages/workspace-application/src/workspace-application.test.ts`
- Create: `packages/workspace-application/src/apply-document-edits.test.ts`
- Create: `packages/workspace-application/src/save-document.test.ts`
- Create: `packages/workspace-application/src/close-workspace.test.ts`
- Modify: `src/main/main.ts`
- Delete after cutover: `src/main/workspace-application.ts`
- Delete after cutover: `src/main/workspace-close-coordinator.ts`

**Steps:**

- [x] Define only the file, identity, dialog, watcher, lifecycle, and coordination ports consumed by RF-102 use cases.
- [x] Move open/create/activate/move/close/save orchestration into use cases.
- [x] Return typed results for success, cancellation, conflict, and error.
- [x] Make `main.ts` construct dependencies and register handlers only.
- [x] Delete the old main-local application/coordinator implementations and tests.

**Verification:**

```powershell
npm.cmd run test -- packages/workspace-application src/main/main.test.ts
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Acceptance (2026-07-30):** `PASS`. Fresh focus passed 23 files / 561 tests; editor-foundation passed 7 files / 267 tests; lint, typecheck, the 165-file / 2,066-pass + 1-skip full suite, build with both workspace runtime verifiers, formal 121/121-case behavior gate, forbidden-import and retired-path scans, and diff check passed. Independent architecture acceptance reported P0/P1/P2 = 0; final quality review reported Critical/Important/Minor = 0 and `Ready: Yes`.

**Exit:** accepted. Workspace business workflows are independently testable without Electron or React; M1 is 2/2 `COMPLETE`. This RF-102 checkpoint made RF-201 dependency-ready; RF-201 was later accepted as `COMPLETE` as recorded below.

### Milestone 2 — Revisioned edit transport

#### RF-201: Persistent text buffer and session revisions

**Outcome:** canonical sessions expose a revisioned small-change primitive while the existing full-draft IPC remains temporarily in place until RF-204.

**Files:**

- Create: `packages/workspace-infrastructure/src/codemirror-text-buffer.ts`
- Create: `packages/workspace-infrastructure/src/codemirror-text-buffer.test.ts`
- Create: `packages/workspace-infrastructure/src/index.ts`
- Modify: `package.json` dependency classification for `@codemirror/state`.
- Modify: `packages/workspace-domain/src/document-session.ts`

**Steps:**

- [x] Wrap CodeMirror `Text` behind `TextBuffer`.
- [x] Validate safe-integer, sorted, non-overlapping, in-range changes before applying.
- [x] Increment revision once per accepted non-empty batch, including same-text replacements.
- [x] Track one contiguous acknowledged sequence high-watermark per client for idempotence.
- [x] Prove Unicode, CRLF, large insertion, multiple changes, invalid-range, duplicate, gap, and conflict behavior.

**Verification:**

```powershell
npm.cmd run test -- packages/workspace-domain packages/workspace-infrastructure
npm.cmd run typecheck
npm.cmd run build
```

**Acceptance (2026-08-04):** `PASS`. Independent specification/architecture review finished P0/P1/P2 = 0 with no open questions after its initial progress-document P1 was corrected and re-reviewed. Final code-quality review finished Critical/Important/Minor = 0 and `Ready: Yes` after the malformed-insert Important and relative-import-containment Minor findings were repaired RED to GREEN. Fresh acceptance evidence passed post-fix domain/infrastructure 4 files / 163 tests, architecture 1 file / 209 tests, editor-foundation 7 files / 285 tests, lint with 0 errors / 8 existing warnings, typecheck, the 166-file / 2,162-pass + 1-skip full suite, build with all three workspace runtime verifiers, formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run in 24,614 ms, and the final acceptance-document diff check.

**Exit:** accepted. Main has a persistent canonical text representation with no public CodeMirror type leakage. RF-201 remains `COMPLETE`; RF-202 was subsequently accepted as recorded below.

#### RF-202: Shared edit contract and main handler

**Outcome:** the product bridge exposes revisioned edit batches and typed conflict results.

**Files:**

- Create: `src/shared/document-edit.ts`
- Create: `src/shared/document-projection.ts`
- Modify: `src/shared/product-bridge.ts`
- Create: `src/preload/product-api.ts`
- Modify: `src/preload/preload.ts`
- Create: `src/main/ipc/register-workspace-handlers.ts`
- Modify: `src/main/main.ts`
- Modify: preload contract tests.

**Steps:**

- [x] Define serializable edit/result/projection contracts.
- [x] Validate sender window, tab ownership, client identity, revision, and change bounds in main.
- [x] Add `applyDocumentEdits`, `flushDocumentEdits`, and projection subscription bridge methods.
- [x] Keep the existing full-draft channel only until RF-204 within this milestone.
- [x] Cover duplicate sequence and stale revision behavior.

**Verification:**

```powershell
npm.cmd run test -- src/preload src/main packages/workspace-application
npm.cmd run typecheck
```

**Acceptance (2026-08-04):** `PASS`. Fresh acceptance evidence passed the 24-file / 529-test RF-202 focus, editor-foundation 7 files / 307 tests, lint with 0 errors / 8 existing warnings, typecheck, full Vitest 172 files / 2,232 passed + 1 explicit skip out of 2,233, renderer/Electron/CLI build with all three workspace runtime verifiers, formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run, and diff check with line-ending warnings only. Independent architecture review reported P0/P1/P2 = 0 with no open questions. Final quality review reported Critical 0, Important 0, Minor 1 and `Ready: Yes`; the remaining direct-test coverage note is non-blocking.

**Exit:** accepted. Revisioned edits cross a typed, sender-validated IPC boundary; normal acknowledgements and projection events remain metadata-only, while canonical text crosses only for explicit revision conflict. RF-202 is `COMPLETE`; M2 is 2/4 `IN_PROGRESS`; RF-203 is dependency-ready but remains `PLANNED` and has not started. The old full-draft channel remains only as explicit RF-204 deletion debt.

#### RF-203: Renderer workspace client and pending edit queue

**Status:** `COMPLETE`; intake accepted on 2026-08-04; implementation and formal acceptance complete 2026-08-13.

**Outcome:** CodeMirror stays responsive while main remains authoritative.

**Files:**

- Create: `src/renderer/application/workspace-edit-client.ts`
- Create: `src/renderer/application/pending-edit-queue.ts`
- Create: `src/renderer/application/workspace-edit-client.test.ts`
- Create: `src/renderer/application/pending-edit-queue.test.ts`
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/editor/useWorkspaceController.ts`

**Steps:**

- [x] Serialize CodeMirror transactions into repository-owned `DocumentTextChange[]`.
- [x] Batch edits per animation frame without changing undo grouping.
- [x] Send batches in client-sequence order and retain unacknowledged changes.
- [x] Implement composition-aware edit barriers for save, switch, detach-to-new-window, reload,
  close, and every existing renderer ownership-transfer caller; do not claim a nonexistent
  cross-existing-window move UI.
- [x] On conflict, reload canonical text and remap pending changes; if remapping is ambiguous, create a recovery tab containing the local text.
- [x] Keep dirty UI derived from observed canonical dirty metadata plus non-empty pending/recovery
  work, without advancing the acknowledged text/revision transport baseline from projections.

**Verification:**

```powershell
npm.cmd run test -- src/renderer/application src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts
npm.cmd run typecheck
```

**Exit:** renderer has an ordered command queue, not a writable workspace content snapshot.

**Acceptance (2026-08-13):** `PASS`. Independent specification review passed all 9/9 Acceptance items with no FAIL/Critical. Independent code-quality review returned `Ready: No` initially with one Critical (non-conflict recovery sources — adapter discard, invalid frame, missing sequence — were captured but never materialized, so `getRecoveryPendingOutcome` permanently blocked window close); the Critical was fixed by auto-materializing recovery through the same coordinator as the conflict path, with two regression tests and three existing manual-retry tests updated. The review's Important/Minor items (apply/flush transport deadlines, blocked-queue UI retry, dormant full-draft test-driver cleanup) were recorded as RF-204-deferred robustness/cleanup. Fresh acceptance evidence passed the focused 6-file / 636-test gate, editor-foundation 7 files / 308 tests, lint with 0 errors / 8 existing warnings, typecheck, full Vitest 174 files / 2,413 passed + 1 skip, build exit 0 with all three workspace runtime verifiers, formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run on exclusive rerun, and `git diff --check` (line-ending warnings only). The architecture review subagent did not complete; the main process performed the architecture acceptance directly and reported P0/P1/P2 = 0.

#### RF-204: Hard cutover from full draft synchronization

**Status:** `COMPLETE` (2026-08-13).

**Outcome:** all document changes use revisioned edit batches.

**Files:**

- Delete: `UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL` and `UpdateWorkspaceTabDraftInput` from `src/shared/workspace.ts`.
- Delete: `updateWorkspaceTabDraft` from `src/shared/product-bridge.ts` and preload.
- Remove: renderer `pendingWorkspaceDraftRef`, `lastDraftSyncRequestRef`, and local workspace-content mutation.
- Modify: save/autosave/tab/window flows and tests.

**Steps:**

- [x] Route every edit, test driver operation, and programmatic insertion through the new queue.
- [x] Remove full draft synchronization and snapshot-preservation code.
- [x] Remove tests that mock the retired bridge and replace them with revision assertions.
- [x] Add an architecture test that forbids retired channel/symbol names.
- [x] Run open/edit/save/switch/detach/close scenarios with delayed IPC acknowledgements.

**Verification:**

```powershell
rg -n "UPDATE_WORKSPACE_TAB_DRAFT|updateWorkspaceTabDraft|pendingWorkspaceDraftRef|preserveCurrentActiveDocumentDraft" src packages
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** the search returns no retired runtime symbols; milestone 2 contains no dual state path.

### Milestone 3 — Data safety and recovery

#### RF-301: Per-document watch registry

**Outcome:** every open file-backed tab is monitored, including inactive tabs and tabs moved between windows.

**Status:** `COMPLETE` (2026-08-14). The registry keys entries by normalized path with a per-window subscriber set, syncs every open tab path (not just the active one), suppresses the app's own writes, and tears down shared watchers on the last unsubscription/destruction. Disk snapshot tracking is at the stat-metadata level (mtime+size); the content-hash `DiskVersion` and the save-time precondition land with RF-302.

**Files:**

- Create: `src/main/infrastructure/file-watch-registry.ts`
- Create: `src/main/infrastructure/file-watch-registry.test.ts`
- Modify: workspace application ports/use cases.
- Delete after cutover: `src/main/external-file-watch-service.ts`

**Steps:**

- [x] Key watches by normalized path and subscribed tab IDs, not webContents ID.
- [x] Record `DiskVersion` on open and successful save.
- [x] Recheck disk version on activation and immediately before save.
- [x] Deliver external state through canonical session projections.
- [x] Cover inactive-tab modification, rename/delete, multi-window same path, internal write suppression, and watcher teardown.
- [x] Delete the active-tab-only watcher implementation.

**Verification:**

```powershell
npm.cmd run test -- src/main/infrastructure packages/workspace-application
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** an inactive external edit cannot be adopted as a silent new baseline or overwritten by autosave.

#### RF-302: Conflict-aware safe save

**Outcome:** save is conditional on the expected disk version and writes through one repository adapter.

**Status:** `COMPLETE` (2026-08-14). The repository owns read+hash (`readDiskVersion`) and safe temp-write + atomic rename (`writeDocument`); `save-document.ts` rejects a normal save with `disk-version-conflict` when the on-disk `contentHash` diverges from the session version and commits the post-write `DiskVersion`; `DiskVersion` is recorded at open/reload/save. `saveMarkdownFileToPath` was deleted (only the Save As dialog remains).

**Files:**

- Create: `src/main/infrastructure/document-repository.ts`
- Create: `src/main/infrastructure/document-repository.test.ts`
- Modify: `packages/workspace-application/src/save-document.ts`
- Delete after cutover: direct write orchestration from `src/main/save-markdown-file.ts`.

**Steps:**

- [x] Read and hash the disk document when stat metadata differs.
- [x] Introduce clock and hash ports with the safe-save use cases that consume them.
- [x] Reject normal save when disk version differs from the session version.
- [x] Implement safe temporary-file write and platform-appropriate replace while preserving explicit error results.
- [x] Update saved revision/disk version only after durable success.
- [x] Ensure edits accepted during an in-flight save remain dirty after that save completes.
- [x] Make Save As create a new disk identity without overwriting the conflicted source.

**Verification:**

```powershell
npm.cmd run test -- src/main/infrastructure/document-repository.test.ts packages/workspace-application
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** stale disk content is never overwritten without an explicit conflict-resolution command.

#### RF-303: Recovery journal and session restore

**Outcome:** acknowledged unsaved changes survive renderer/main process crashes and normal restart.

**Status:** `COMPLETE` (2026-08-14). The main process journals every accepted edit batch, restores the snapshot and replays the journal on startup, and compacts to a checksummed snapshot on clean shutdown; corrupt files are quarantined and reported. The recovery flow is entirely main-owned (no renderer memory).

**Files:**

- Create: `src/main/infrastructure/recovery-journal.ts`
- Create: `src/main/infrastructure/recovery-journal.test.ts`
- Create: `src/main/infrastructure/workspace-persistence.ts`
- Create: `packages/workspace-application/src/recovery.ts`
- Modify: app startup and shutdown composition.

**Steps:**

- [x] Append accepted edit batches with tab/session/revision metadata.
- [x] Introduce the journal port with the recovery use cases that consume it; reuse the clock/hash contracts only where recovery needs them.
- [x] Compact journals into snapshots after a bounded number of batches.
- [x] Use checksums and atomic replacement for journal/snapshot files.
- [x] Mark clean shutdown and prune journals only after saved revisions are durable.
- [x] Restore file-backed and untitled sessions without modifying source files.
- [x] Quarantine corrupt recovery files and surface a typed notification.

**Verification:**

```powershell
npm.cmd run test -- src/main/infrastructure/recovery-journal.test.ts packages/workspace-application/src/recovery.test.ts
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** the recovery flow is main-owned and does not depend on renderer memory.

#### RF-304: Main-owned conflict and close workflows

**Outcome:** React only presents canonical conflict/close projections and sends user choices.

**Status:** `COMPLETE` (2026-08-14). The session carries `externalChange`; main marks it on watch events and projects it; the renderer sends typed keep-memory/reload/save-as/cancel commands via `resolveExternalChange`; the old `useExternalConflictController` and shell-state conflict reducers are deleted; autosave is blocked by the projected conflict.

**Files:**

- Create: `packages/workspace-application/src/resolve-external-change.ts`
- Modify: renderer application client and conflict banner.
- Delete: `src/renderer/editor/useExternalConflictController.ts`
- Remove: renderer-owned external conflict state from `editor-shell-state.ts`.

**Steps:**

- [x] Move keep-memory, reload, Save As, discard, and cancel decisions into typed application commands.
- [x] Make close-tab/window iterate canonical sessions after `flushEdits()`.
- [x] Ensure external conflict blocks autosave at the session level.
- [x] Replace renderer conflict state with projection rendering.
- [x] Delete the old controller and its state reducers.

**Verification:**

```powershell
npm.cmd run test -- packages/workspace-application src/renderer/editor
npm.cmd run test:scenario -- --id open-markdown-file-basic
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** save, conflict, and close decisions share one canonical session state.

### Milestone 4 — Recursive Markdown engine and incremental cache

#### RF-401: Recursive node model and source mapping

**Outcome:** the parser target can express arbitrary mixed container nesting with original offsets.

**Status:** `COMPLETE` (2026-08-14). The parser-agnostic recursive model (`src/model/`) defines container/leaf unions, source/content ranges, marker metadata, container paths, FNV-1a node identity from ancestry + subtree fingerprint, masked container-prefixed source mapping, and tree indexing/invariant checks. The legacy block-map parser stays authoritative until RF-405.

**Files:**

- Create: `packages/markdown-engine/src/model/source-range.ts`
- Create: `packages/markdown-engine/src/model/markdown-node.ts`
- Create: `packages/markdown-engine/src/model/container-path.ts`
- Create: `packages/markdown-engine/src/model/document-tree.ts`
- Create: `packages/markdown-engine/src/model/document-tree.test.ts`
- Modify: `packages/markdown-engine/src/index.ts`

**Steps:**

- [x] Define recursive container/leaf unions, source/content ranges, marker metadata, and container paths.
- [x] Define stable node ID generation from structural ancestry and subtree identity, not raw offsets alone.
- [x] Define source mapping helpers for masked/container-prefixed source.
- [x] Cover CRLF, tabs, Unicode, empty containers, lazy continuation, and depth 0–8.
- [x] Keep the existing parser runtime until RF-405, but prevent new consumers from depending on the new model before it is complete.

**Verification:**

```powershell
npm.cmd run test -- packages/markdown-engine/src/model
npm.cmd run typecheck
```

**Exit:** the model can represent every recursive parity path without top-level special cases.

#### RF-402: Full recursive parser

**Outcome:** one micromark-based parser builds the complete recursive document tree.

**Status:** `COMPLETE` (2026-08-14). `parseFullDocumentTree` drives one container stack from a flattened micromark event view, so blockquote/list/list-item children come from the event stream rather than source regex scanning; inline AST attaches only to leaf content ranges (through masked container prefixes); a `recursive-containers.md` fixture proves nested depth, containment, ordered top-level coverage, and lazy continuation.

**Files:**

- Create: `packages/markdown-engine/src/parse/full-document-parser.ts`
- Create: `packages/markdown-engine/src/parse/micromark-event-adapter.ts`
- Create: `packages/markdown-engine/src/parse/full-document-parser.test.ts`
- Create: `fixtures/markdown/recursive-containers.md`
- Modify: `packages/markdown-engine/src/index.ts`

**Steps:**

- [x] Convert micromark events into a container stack and recursive nodes.
- [x] Parse blockquote children with the same block rules as document children.
- [x] Parse list-item children recursively, including nested list, quote, code, math, Mermaid, table, and paragraphs.
- [x] Attach inline AST only to leaf content ranges.
- [x] Build reference/footnote indexes from the same tree.
- [x] Prove source ranges reconstruct the original Markdown exactly.
- [x] Compare supported top-level behavior against current parser fixtures.

**Verification:**

```powershell
npm.cmd run test -- packages/markdown-engine
npm.cmd run typecheck
```

**Exit:** no renderer/editor/export regex scan is required to discover container children.

#### RF-403: Physical line and prefix index

**Outcome:** every source line has a canonical container/prefix interpretation.

**Status:** `COMPLETE` (2026-08-14). New `@fishmark/editor-model` package with `physical-lines/`: `prefix-segment.ts` (ordered quote/indentation/list-marker/task-marker/spacing segments with tab-aware visible columns) and `physical-editing-document.ts` (lines built from source + recursive tree, structural-blank/separator/fence/content roles, and offset/line/node/visible-column queries). The package is path-aliased and registered active in the architecture guard; nothing consumes it yet.

**Files:**

- Create: `packages/editor-model/src/physical-lines/prefix-segment.ts`
- Create: `packages/editor-model/src/physical-lines/physical-editing-document.ts`
- Create: `packages/editor-model/src/physical-lines/physical-editing-document.test.ts`
- Modify: `packages/editor-model/src/index.ts`
- Retire equivalent helpers only in RF-506.

**Steps:**

- [x] Build physical lines from source plus recursive tree.
- [x] Emit ordered quote, indentation, list-marker, task-marker, and spacing segments.
- [x] Mark structural blank, separator, fence open/content/close, and ordinary content roles.
- [x] Provide offset-to-line, line-to-node, node-to-lines, and visible-column queries.
- [x] Verify soft-wrap indentation and hidden-prefix geometry inputs.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/physical-lines
npm.cmd run typecheck
```

**Exit:** commands and decorations can stop reconstructing prefixes independently.

#### RF-404: Incremental structure cache

**Outcome:** ordinary edits reuse unaffected document structure and derived indexes.

**Files:**

- Create: `packages/markdown-engine/src/parse/parse-checkpoint.ts`
- Create: `packages/markdown-engine/src/cache/invalidation-range.ts`
- Create: `packages/markdown-engine/src/cache/document-structure-cache.ts`
- Create: `packages/markdown-engine/src/cache/incremental-document-parser.ts`
- Create: `packages/markdown-engine/src/cache/incremental-document-parser.test.ts`
- Modify: `packages/markdown-engine/src/index.ts`

**Steps:**

- [ ] Define safe checkpoints containing open fence, container stack, line state, and dialect state.
- [ ] Map change ranges through revisions and choose backward/forward reparse bounds.
- [ ] Reuse immutable unaffected nodes and remap their offsets.
- [ ] Invalidate inline/global-definition dependents precisely.
- [ ] Record parse windows, reused/invalidated nodes, and fallback reasons.
- [ ] Add differential edit-sequence tests against `fullDocumentParser`.
- [ ] Prove selection-only changes perform no parse.

**Verification:**

```powershell
npm.cmd run test -- packages/markdown-engine/src/cache packages/markdown-engine/src/parse
npm.cmd run perf:baseline
```

**Exit:** incremental results are structurally identical to fresh parse results for the complete edit corpus.

#### RF-405: Parser hard cutover

**Outcome:** every consumer uses the recursive parser/cache public API and old block-map paths are deleted.

**Files:**

- Modify: editor-core consumers, outline, metrics, export, probes, and tests.
- Delete/replace: `parse-block-map.ts`, transitional rich-parser stitching, blockquote masked-source helpers, and duplicate parser exports once no longer used.

**Steps:**

- [ ] Migrate consumers one by one to `MarkdownDocumentTree` or `EditorDerivedSnapshot`.
- [ ] Remove direct `parseInlineAst` calls where the canonical leaf AST exists.
- [ ] Remove editor/export blockquote child rescans.
- [ ] Delete retired parser code, aliases, fixtures, and tests.
- [ ] Add forbidden-import/symbol assertions.
- [ ] Run round-trip and mixed-container differential suites.

**Verification:**

```powershell
rg -n "parseBlockMap|parseTopLevelBlocks|createBlockquoteInnerSource" src packages
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** one parser and one recursive tree remain; no old parser compatibility export survives.

### Milestone 5 — Pure semantic editing engine

#### RF-501: Editor semantic context and derived snapshot

**Outcome:** commands receive one immutable context containing tree, physical line, container path, selection, and indexes.

**Files:**

- Create: `packages/editor-model/src/context/editor-semantic-context.ts`
- Create: `packages/editor-model/src/context/selection-context.ts`
- Create: `packages/editor-model/src/context/editor-semantic-context.test.ts`
- Create: `packages/editor-model/src/derived/editor-derived-snapshot.ts`
- Create: `packages/editor-model/src/derived/editor-derived-snapshot.test.ts`
- Create: `packages/editor-model/src/transactions/edit-transaction-plan.ts`
- Modify: `packages/editor-model/src/index.ts`

**Steps:**

- [ ] Build snapshot queries from the incremental structure cache.
- [ ] Separate document-derived state from selection-derived state.
- [ ] Recompute only active line/path/table cursor on selection changes.
- [ ] Define the command registry and `EditTransactionPlan` contract.
- [ ] Verify stale revision/context rejection.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/context packages/editor-model/src/derived
npm.cmd run typecheck
```

**Exit:** commands need no parser calls and no CodeMirror state.

#### RF-502: Enter planner

**Outcome:** Enter behavior is recursive-container aware and consistent at every depth.

**Files:**

- Create: `packages/editor-model/src/commands/enter.ts`
- Create: `packages/editor-model/src/commands/enter.test.ts`
- Modify: `packages/editor-model/src/index.ts`

**Steps:**

- [ ] Implement plain, heading, list, quote, code-fence, table-boundary, and structural-blank Enter rules.
- [ ] Preserve parent prefixes while the deepest semantic handler edits the leaf.
- [ ] Implement one-level empty-container exit rules.
- [ ] Preserve selection and one-step undo intent.
- [ ] Pass the full Enter behavior matrix through depth 8 and repeated Enter sequences.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/commands/enter.test.ts fixtures/editor-behavior
```

**Exit:** no Enter behavior depends on DOM class names or feature-specific source rescans.

#### RF-503: Backspace and Delete planners

**Outcome:** deletion degrades structure one predictable step and preserves subtrees.

**Files:**

- Create: `packages/editor-model/src/commands/backspace.ts`
- Create: `packages/editor-model/src/commands/backspace.test.ts`
- Create: `packages/editor-model/src/commands/delete.ts`
- Create: `packages/editor-model/src/commands/delete.test.ts`
- Modify: `packages/editor-model/src/index.ts`

**Steps:**

- [ ] Implement ordinary deletion and range deletion.
- [ ] Implement content-start marker/indent/quote degradation.
- [ ] Move or outdent complete list-item subtrees.
- [ ] Recompute destination path after range deletion/join.
- [ ] Cover hidden markers, whitespace lines, repeated deletion, and undo/redo.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/commands/backspace.test.ts packages/editor-model/src/commands/delete.test.ts
```

**Exit:** Backspace/Delete behavior is source-minimal, subtree-safe, and depth-independent.

#### RF-504: Indent, navigation, and selection policies

**Outcome:** Tab/Shift+Tab/arrows/pointer/input use explicit, non-conflicting policies.

**Files:**

- Create: `packages/editor-model/src/commands/indent.ts`
- Create: `packages/editor-model/src/commands/indent.test.ts`
- Create: `packages/editor-model/src/commands/navigation.ts`
- Create: `packages/editor-model/src/commands/navigation.test.ts`
- Create: `packages/editor-model/src/context/selection-context.test.ts`
- Modify: `packages/editor-model/src/index.ts`

**Steps:**

- [ ] Implement list-subtree indent/outdent with preserved quote prefixes.
- [ ] Implement visible-line vertical navigation with preferred columns.
- [ ] Split pointer, structural arrow, printable input, and programmatic normalization.
- [ ] Prove printable input never moves selection structurally.
- [ ] Cover hidden marker and structural blank navigation at mixed depths.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/commands/indent.test.ts packages/editor-model/src/commands/navigation.test.ts packages/editor-model/src/context/selection-context.test.ts
```

**Exit:** selection policy is explicit and no global transaction filter guesses user intent.

#### RF-505: Formatting, table, and code-fence planners

**Outcome:** all remaining semantic edits share the same plan/context boundary.

**Files:**

- Create: `packages/editor-model/src/commands/formatting.ts`
- Create: `packages/editor-model/src/commands/formatting.test.ts`
- Create: `packages/editor-model/src/commands/table.ts`
- Create: `packages/editor-model/src/commands/table.test.ts`
- Create: `packages/editor-model/src/commands/code-fence.ts`
- Create: `packages/editor-model/src/commands/code-fence.test.ts`
- Modify: `packages/editor-model/src/index.ts`

**Steps:**

- [ ] Port inline/block toggles without CodeMirror imports.
- [ ] Port table selection/edit/row/column operations against canonical table nodes.
- [ ] Port code fence completion, indentation, and boundary Enter behavior.
- [ ] Preserve history groups and exact source spelling outside changed ranges.
- [ ] Cover each command inside list/quote combinations where syntax permits.

**Verification:**

```powershell
npm.cmd run test -- packages/editor-model/src/commands
```

**Exit:** semantic behavior is complete before CodeMirror integration switches.

#### RF-506: Semantic engine hard cutover

**Outcome:** old editor-core semantic commands, physical-line models, and parsing helpers are deleted.

**Files:**

- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/commands/codemirror-markdown-command-adapter.ts`
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/editor-test-driver.ts`
- Delete: superseded files under `packages/editor-core/src/commands/` after their callers use `@fishmark/editor-model`.
- Delete: superseded files under `packages/editor-core/src/context/` after their callers use `@fishmark/editor-model`.
- Delete: `packages/editor-core/src/physical-editing-document.ts`
- Delete: `packages/editor-core/src/structural-line-model.ts`

**Steps:**

- [ ] Route keyboard, menu, toolbar, table widget, and test driver commands through `editor-model`.
- [ ] Remove old command adapters and duplicate semantic context types.
- [ ] Remove old line/prefix/list parsing utilities.
- [ ] Replace tests with package-level behavioral tests plus focused adapter tests.
- [ ] Add forbidden imports for retired editor-core semantics.

**Verification:**

```powershell
rg -n "from .*editor-core/src/(commands|context)|list-utils|structural-line-model|physical-editing-document" src packages
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** one pure semantic engine remains.

### Milestone 6 — Thin CodeMirror adapter

#### RF-601: Transaction bridge, queue, history, and IME

**Outcome:** CodeMirror converts browser transactions to/from semantic plans without owning Markdown rules.

**Files:**

- Create: `packages/codemirror-adapter/src/transaction-adapter.ts`
- Create: `packages/codemirror-adapter/src/transaction-adapter.test.ts`
- Create: `packages/codemirror-adapter/src/pending-edit-queue.ts`
- Create: `packages/codemirror-adapter/src/pending-edit-queue.test.ts`
- Create: `packages/codemirror-adapter/src/selection-mapper.ts`
- Create: `packages/codemirror-adapter/src/selection-mapper.test.ts`
- Create: `packages/codemirror-adapter/src/composition-controller.ts`
- Create: `packages/codemirror-adapter/src/composition-controller.test.ts`
- Modify: `packages/codemirror-adapter/src/index.ts`

**Steps:**

- [ ] Convert CodeMirror change sets to repository `TextChange[]` and back.
- [ ] Apply semantic plans with correct history annotations.
- [ ] Integrate the workspace client acknowledgement queue.
- [ ] Freeze geometry-changing semantic refresh during composition.
- [ ] Recompute from final text on composition end.
- [ ] Prove undo/redo across automatic structure completion and delayed acknowledgements.

**Verification:**

```powershell
npm.cmd run test -- packages/codemirror-adapter/src/transaction-adapter.test.ts packages/codemirror-adapter/src/composition-controller.test.ts
```

**Exit:** IME and history are adapter concerns; Markdown semantics stay pure.

#### RF-602: Viewport-scoped decorations

**Outcome:** decorations consume render plans and update only affected visible structures.

**Files:** create the `codemirror-adapter/src/decorations/*` files listed in section 4.

**Steps:**

- [ ] Store `EditorDerivedSnapshot` in a state field keyed by revision.
- [ ] Build decorations for viewport, active path, and structural neighbors.
- [ ] Reuse unchanged decoration ranges by node ID/hash.
- [ ] Keep source mode as a presentation gate over the same document state.
- [ ] Cover viewport entry/exit, active-node changes, scrolling, and composition.

**Verification:**

```powershell
npm.cmd run test -- packages/codemirror-adapter/src/decorations
npm.cmd run perf:baseline
```

**Exit:** ordinary selection/input no longer rebuilds full-document decorations.

#### RF-603: Interaction adapters and widgets

**Outcome:** tables, links, images, math, Mermaid, and code highlighting are isolated adapters over canonical nodes.

**Files:** create `interactions/*` and migrate current widgets/renderers.

**Steps:**

- [ ] Define a typed interaction registry keyed by semantic node capability.
- [ ] Move table DOM focus/selection into its adapter.
- [ ] Move link opening and image preview into presentation interactions.
- [ ] Keep math/Mermaid/highlight loading lazy and cancel stale revision work.
- [ ] Ensure widgets submit semantic plans rather than editing source independently.

**Verification:**

```powershell
npm.cmd run test -- packages/codemirror-adapter/src/interactions packages/codemirror-adapter/src/decorations
npm.cmd run test:table-layout
npm.cmd run test:mermaid-footnote-render
```

**Exit:** every widget is revision-aware and cannot create an alternative edit path.

#### RF-604: CodeMirror adapter hard cutover

**Outcome:** the old mixed `editor-core` runtime is removed.

**Files:**

- Migrate: `src/renderer/code-editor.ts`, `code-editor-view.tsx`, probes, and tests.
- Delete: superseded `packages/editor-core/src/extensions`, `decorations`, `interactions`, caches, widgets, and public exports.
- Delete package directory if no valid code remains.

**Steps:**

- [ ] Switch the renderer editor factory to `@fishmark/codemirror-adapter`.
- [ ] Move remaining reusable pure code to its target package.
- [ ] Delete `packages/editor-core` after all imports are gone.
- [ ] Remove obsolete aliases, bundle groups, tests, and README claims.
- [ ] Run all geometry/editing probes and recursive behavior scenarios.

**Verification:**

```powershell
rg -n "@fishmark/editor-core|packages/editor-core" src packages vite.config.ts vitest.config.ts tsconfig*.json
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:editing-experience
```

**Exit:** `editor-core` no longer exists; semantic and CodeMirror responsibilities have clean package owners.

### Milestone 7 — Shared presentation and derived consumers

#### RF-701: Semantic render plan

**Outcome:** editor and export share one semantic presentation description without sharing DOM implementations.

**Files:**

- Create: `packages/markdown-presentation/src/render-plan.ts`
- Create: `packages/markdown-presentation/src/build-render-plan.ts`
- Create: `packages/markdown-presentation/src/inline-render-plan.ts`
- Create: `packages/markdown-presentation/src/build-render-plan.test.ts`
- Modify: `packages/markdown-presentation/src/index.ts`

**Steps:**

- [ ] Define block/inline/container presentation roles from canonical nodes.
- [ ] Include source ranges, hidden markers, classes/roles, preview capability, and fallback text.
- [ ] Reuse the same nested-container traversal for document and blockquote/list children.
- [ ] Keep app-owned layout and theme-owned styling outside the semantic plan.

**Verification:**

```powershell
npm.cmd run test -- packages/markdown-presentation
npm.cmd run typecheck
```

**Exit:** renderer/export no longer duplicate semantic traversal decisions.

#### RF-702: HTML export cutover

**Outcome:** HTML export consumes `MarkdownDocumentTree` plus render plan and contains no parser.

**Files:** create `markdown-presentation/src/html/*`; reduce or delete `src/renderer/export-html.ts` after moving orchestration.

**Steps:**

- [ ] Move pure HTML rendering into the presentation package.
- [ ] Render recursive containers, inline nodes, tables, math fallback, Mermaid fallback, and footnotes from canonical data.
- [ ] Keep theme/style collection in renderer orchestration only.
- [ ] Remove direct `parseInlineAst`, blockquote scans, and duplicate prefix helpers from export.
- [ ] Compare editor semantic plan and exported semantic roles in tests.

**Verification:**

```powershell
npm.cmd run test -- packages/markdown-presentation src/renderer/export-html.test.ts
npm.cmd run build
```

**Exit:** export has one semantic source and no duplicate Markdown parser logic.

#### RF-703: Outline and metrics cutover

**Outcome:** outline and document metrics update from `EditorDerivedSnapshot`.

**Files:** migrate `src/renderer/outline.ts`, `document-metrics.ts`, and `useDocumentDerivedDataController.ts`; delete redundant parsers/timers.

**Steps:**

- [ ] Expose outline and metric deltas from the derived snapshot.
- [ ] Make renderer subscribe by revision instead of content string.
- [ ] Remove standalone Markdown parsing from outline and metrics.
- [ ] Schedule noncritical presentation updates after first paint without duplicating structure work.

**Verification:**

```powershell
npm.cmd run test -- src/renderer/outline.test.ts src/renderer/document-metrics.test.ts src/renderer/editor/useDocumentDerivedDataController.test.tsx
npm.cmd run perf:baseline
```

**Exit:** one document structure build feeds editor, outline, metrics, and export.

### Milestone 8 — Renderer and main composition cleanup

#### RF-801: Non-React workspace client/store

**Outcome:** application workflows are callable without hooks or JSX.

**Files:**

- Create: `src/renderer/application/workspace-client.ts`
- Create: `src/renderer/application/workspace-client.test.ts`
- Create: `src/renderer/application/workspace-store.ts`
- Create: `src/renderer/application/workspace-store.test.ts`
- Create: `src/renderer/application/editor-command-gateway.ts`
- Create: `src/renderer/application/editor-command-gateway.test.ts`
- Modify: controllers under `src/renderer/editor/`.

**Steps:**

- [ ] Implement projection subscription with `useSyncExternalStore` compatibility.
- [ ] Centralize open/save/save-as/autosave/reload/close/move/detach commands.
- [ ] Centralize flush barriers and typed error/notification mapping.
- [ ] Route menu, shortcuts, buttons, drag/drop, and test driver through the command gateway.
- [ ] Remove direct bridge calls from components and settings views.

**Verification:**

```powershell
npm.cmd run test -- src/renderer/application src/renderer/editor
npm.cmd run typecheck
```

**Exit:** application behavior can be tested without rendering React.

#### RF-802: React shell decomposition

**Outcome:** `App.tsx` is a composition root and `WorkspaceShell` is focused presentation.

**Files:** split `src/renderer/editor/App.tsx`, `WorkspaceShell.tsx`, and `settings-view.tsx` into named components under `editor/components/`.

**Steps:**

- [ ] Keep bootstrapping, store subscription, and top-level error boundary in `App.tsx`.
- [ ] Extract tab strip, titlebar, status bar, conflict banner, outline, find/replace, settings drawer, notification host, and table toolbar.
- [ ] Give each component explicit view props and command callbacks.
- [ ] Remove business IPC and document synchronization effects from React.
- [ ] Keep component tests focused on projection-to-view behavior.

**Verification:**

```powershell
npm.cmd run test -- src/renderer/editor
npm.cmd run lint
npm.cmd run typecheck
```

**Exit:** no large React component owns document or workspace workflows.

#### RF-803: Main/preload composition split

**Outcome:** main and preload entry files are wiring roots with grouped handler/API modules.

**Files:** create `main/ipc/register-*.ts`, `preload/product-api.ts`, `preload/test-api.ts`; reduce `main.ts` and `preload.ts`.

**Steps:**

- [ ] Group IPC registration by workspace, preferences, themes, export, updates, and tests.
- [ ] Validate sender/runtime mode at every privileged handler.
- [ ] Keep product and test bridges physically and conditionally separate.
- [ ] Make entry files construct dependencies, register modules, and own lifecycle only.
- [ ] Remove duplicate channel wiring and re-export noise.

**Verification:**

```powershell
npm.cmd run test -- src/main src/preload
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

**Exit:** process entry points are understandable as composition roots.

### Milestone 9 — Performance, E2E, and security gates

#### RF-901: Final performance gate

**Outcome:** the completed cache/adapter architecture meets section 8 budgets with reproducible evidence.

**Files:** update performance probes, fixtures, reports, and budget scripts.

**Steps:**

- [ ] Measure cold/warm 5k and 20k opens.
- [ ] Measure ordinary input, structural input, selection, scroll, source-mode switch, and tab switch.
- [ ] Assert parse windows, reuse ratios, fallback counts, decoration rebuilds, and memory growth.
- [ ] Remove temporary performance logging and keep opt-in structured metrics only.
- [ ] Fail the task if any required budget is missed; optimize the owning layer before acceptance.

**Verification:**

```powershell
npm.cmd run perf:baseline
npm.cmd run test:editing-experience
```

**Exit:** performance claims are backed by committed fixture hashes and fresh reports.

#### RF-902: Playwright Electron data-safety and editing suite

**Outcome:** critical workflows are proven in real Electron windows and processes.

**Files:** add Playwright dependency/config and create tests under `tests/e2e/editing`, `persistence`, and `performance`.

**Steps:**

- [ ] Add Electron launch fixture and isolated user-data/temp directories.
- [ ] Cover open/edit/save/reopen and autosave.
- [ ] Cover inactive-tab external modification and blocked overwrite.
- [ ] Cover move/detach with pending edits and revision acknowledgements.
- [ ] Cover window close prompts and crash recovery.
- [ ] Cover nested Enter/Backspace/Tab/arrow/undo flows with source and selection assertions.
- [ ] Add platform-tagged IME smoke instructions where automation cannot synthesize a real OS IME.

**Verification:**

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

**Exit:** real process boundaries protect the highest-risk user workflows.

#### RF-903: Electron security hardening

**Outcome:** renderer compromise cannot freely expand to filesystem or privileged IPC access.

**Files:** modify runtime window config, renderer CSP, custom asset protocol, IPC registrars, packaging tests.

**Steps:**

- [ ] Enable renderer sandbox and adapt preload to supported sandbox APIs.
- [ ] Add a restrictive CSP compatible with bundled assets, lazy modules, themes, and required custom protocols.
- [ ] Restrict preview asset reads to registered document resource roots and registered theme roots.
- [ ] Validate IPC sender, window, runtime mode, tab ownership, and input bounds.
- [ ] Deny navigation/window creation and keep external links protocol-allowlisted.
- [ ] Add security contract tests for unauthorized paths/senders.

**Verification:**

```powershell
npm.cmd run test -- src/main src/preload
npm.cmd run build
npm.cmd run test:e2e
```

**Exit:** Electron security recommendations are applied without weakening local preview behavior.

### Milestone 10 — Final deletion and public truth

#### RF-1001: Dead code and compatibility purge

**Outcome:** only the target architecture remains.

**Files:** repository-wide deletion and dependency/config cleanup.

**Steps:**

- [ ] Remove retired packages, APIs, channels, aliases, feature flags, adapters, tests, probes, CSS selectors, and docs.
- [ ] Remove unused dependencies and move runtime dependencies to correct package sections.
- [ ] Run TypeScript unused checks, ESLint, bundle analysis, and architecture forbidden-symbol tests.
- [ ] Search for `legacy`, `compat`, retired parser/command symbols, old draft sync, old conflict state, and duplicate render helpers.
- [ ] Confirm every remaining public package export has a production consumer or documented public role.
- [ ] Confirm generated artifacts and `tmp/` diagnostics are not tracked as architecture inputs.

**Verification:**

```powershell
rg -n "legacy|compat|updateWorkspaceTabDraft|parseBlockMap|@fishmark/editor-core|useExternalConflictController|preserveCurrentActiveDocumentDraft" src packages tests vite.config.ts vitest.config.ts tsconfig*.json
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run perf:bundle
```

**Exit:** forbidden searches return no runtime compatibility/dead paths; all gates pass.

#### RF-1002: Architecture, behavior, and documentation acceptance

**Outcome:** code, public documentation, test evidence, and product behavior describe the same final system.

**Files:** update `docs/design.md`, `docs/decision-log.md`, `docs/test-cases.md`, `docs/test-report.md`, `docs/progress.md`, `MVP_BACKLOG.md`, package READMEs, and task summaries.

**Steps:**

- [ ] Document final ownership, dependencies, revision/edit flow, cache invalidation, recursive model, and recovery behavior.
- [ ] Update test cases for nested semantic matrices and data-safety workflows.
- [ ] Run architecture acceptance over the full program diff.
- [ ] Run task acceptance over every milestone and the final aggregate.
- [ ] Perform Windows manual IME/cursor/geometry acceptance and record macOS steps/evidence separately.
- [ ] Mark the program complete only after roadmap requirements and progress evidence agree.

**Verification:**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run perf:baseline
npm.cmd run test:e2e
npm.cmd run test:editing-experience
```

**Exit:** final verdict is `PASS`; no required work, compatibility structure, dead code, or contradictory documentation remains.

## 11. Milestone ordering and dependency rules

```text
M0 baselines
  → M1 workspace domain/application
  → M2 revisioned edit transport
  → M3 data safety/recovery
  → M4 recursive parser/cache
  → M5 semantic editor model
  → M6 CodeMirror adapter
  → M7 presentation/derived consumers
  → M8 renderer/main composition cleanup
  → M9 performance/E2E/security
  → M10 purge/final acceptance
```

Rules:

- M2 cannot start before workspace domain ownership is explicit.
- M3 cannot accept save/recovery work while full-draft sync still exists.
- M5 cannot migrate commands before the recursive parser/cache is accepted.
- M6 cannot delete old editor-core until all pure commands are in editor-model.
- M7 cannot delete export parsing until the semantic render plan covers all supported nodes.
- M9 measures the final architecture, not intermediate compatibility paths.
- M10 is deletion and acceptance, not a place to finish missing architecture.

## 12. Definition of program completion

The refactor is complete only when all statements below are true:

- Main owns canonical `DocumentSession` text, revision, saved revision, disk version, conflict state, and recovery state.
- Renderer has no writable workspace document copy outside ordered unacknowledged edit commands.
- Save/autosave/reload/close/move/detach all use an edit-flush barrier and canonical session.
- Every open file-backed tab is protected from external modifications.
- Crash recovery restores acknowledged unsaved edits.
- One recursive Markdown parser represents mixed nested containers with original offsets.
- Incremental cache results match fresh parse results.
- Selection-only and ordinary local edits avoid full-document parsing.
- One pure semantic editor model owns Enter, Backspace, Delete, indentation, navigation, formatting, table, and fence behavior.
- Nested list/blockquote combinations have the same supported leaf semantics as top-level content.
- IME, cursor, selection, undo/redo, source mode, WYSIWYM, and round-trip gates pass.
- CodeMirror adapter contains no Markdown business rules.
- React components contain no workspace/document workflow orchestration or direct privileged bridge calls.
- Editor, outline, metrics, and export consume shared canonical derived data/render plans.
- Required 5k/20k performance budgets pass.
- Playwright proves data-safety and editing-critical cross-process workflows.
- Renderer sandbox, CSP, IPC sender validation, and resource path allowlists are active.
- Old editor-core, old parser, full-draft sync, renderer conflict state, compatibility adapters, dead code, and stale tests/docs are deleted.
- Build, lint, typecheck, full tests, performance gates, E2E, architecture acceptance, and task acceptance all pass with fresh evidence.

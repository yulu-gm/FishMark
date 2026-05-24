# Typora-like Editing Alignment Design

Date: 2026-05-24
Status: Draft for review

## Goal

Define how FishMark will align its live Markdown editing behavior with Typora-style editing in a measurable, repeatable way, then redesign the editor pipeline so ordinary text input, whitespace input, caret movement, and Markdown rendering behave naturally without parser-driven special cases.

## Product Baseline

FishMark remains a local-first Markdown editor where Markdown source is the only truth. The editor may render Markdown in a Typora-like hybrid view, but it must not silently rewrite the whole document, normalize unrelated text, or store hidden editor-only state in saved Markdown.

The comparison target is:

- Typora 1.13.4 on Windows.
- Hybrid editing view.
- Default Whitespace / LineBreak settings unless a case explicitly states otherwise.
- A fixed viewport, font family, font size, zoom level, and theme recorded in each probe run.

Typora alignment means FishMark matches Typora's observable behavior for a defined behavior matrix. It does not mean copying Typora internals or matching every pixel of every theme.

## Current FishMark Pipeline

Current editing flow:

```text
CodeMirror input or keydown
-> FishMark keymap for Enter / Backspace / arrows / Tab
-> command chooses behavior from activeBlockState
-> transactionFilter may normalize lists and hidden or structural blank selections
-> parseMarkdownDocument(source)
-> create derived state: markdownDocument, activeBlock, tableCursor, outline
-> decorations render semantic Markdown blocks
```

Important current files:

- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/active-block.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/line-visibility.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/markdown-editing-experience-probe.ts`

The main weakness is that FishMark currently lets parsed Markdown blocks decide too much about editability. A whitespace-only line, an empty document, or a structural blank separator can lack a Markdown block, so later command, decoration, and selection logic has to add fragile exceptions.

The recent `materializeEditableWhitespaceDocument` direction is an example of the wrong abstraction. It makes a whitespace-only whole document look like a paragraph in the semantic Markdown document, but it does not solve whitespace lines inside mixed documents, and it can interfere with ordinary Markdown triggers such as typing `#`.

## Typora Behavior Model

Typora's public documentation states that, by default, editing view preserves sequential whitespace and line breaks, while print/export can ignore them. It also states that pressing `Enter` creates a new paragraph and source mode shows the corresponding paragraph-separating empty line.

The installed Typora 1.13.4 resources also show an editing model with explicit rendered editing surfaces:

- `.md-heading`, `.md-p`, and `.md-table` use `white-space: pre-wrap`.
- Empty heading and paragraph nodes use `content:'\200B'` pseudo content as an empty editable anchor.
- `.md-emptyline` exists as a block-level empty-line surface.

This supports the product model:

```text
source text is truth
-> every physical source line is an editable surface
-> Markdown block semantics decorate those surfaces
-> empty surfaces are still real caret targets
```

## Definition Of Alignment

FishMark is aligned with Typora for a behavior only when all of these match for the same initial source and same input sequence:

1. Saved Markdown source matches Typora byte-for-byte, including spaces, tabs, blank lines, and final line breaks.
2. Caret source offset matches, or the case defines an equivalent visible line and column when Typora hides Markdown markers.
3. Visual behavior matches within a documented tolerance: caret moves when typing visible-width whitespace, Enter places the caret on the expected row and column, and empty lines occupy the expected editing surface.
4. Repeating the action remains stable. A one-step pass is not sufficient if the second or third Enter, Backspace, or text input diverges.
5. Undo granularity is sane: a single user action should undo as one action unless CodeMirror or platform behavior makes this impossible and the exception is documented.

## Validation Strategy

### Typora Oracle

Create a black-box Typora oracle before changing FishMark behavior. The oracle should not depend on private Typora APIs.

For each case:

- Create a temporary Markdown file with exact source bytes.
- Open it in Typora under the fixed baseline settings.
- Place the caret using deterministic keyboard navigation from a known state.
- Execute the action sequence.
- Insert a unique sentinel token such as `FM_SENTINEL_001`.
- Save the file.
- Read the saved source bytes.
- Record screenshots after key steps when visual geometry matters.

The sentinel proves the final caret source location. Screenshots prove visual row and column behavior that source bytes alone cannot prove.

Automation may be partial. If Windows GUI automation is unreliable because of update dialogs or focus prompts, the oracle can be manually captured, but every captured case must include:

- Typora version.
- Settings snapshot.
- Initial source.
- Action sequence.
- Saved source after sentinel insertion.
- Screenshot path or written visual observation.
- Date and operator.

### FishMark Probe

FishMark should run the same behavior matrix in Electron. Unlike Typora, FishMark can also record precise internal metrics:

- `view.state.doc.toString()`.
- `view.state.selection.main.anchor/head`.
- `view.coordsAtPos(selection.head)`.
- `.cm-cursor` bounding rect.
- `.cm-line` text, class list, white-space style, height, and top/left.
- Relevant derived state: active line, active block, visual role.

FishMark passes a case only when source, caret, visual geometry, and repeat behavior match the Typora oracle.

## Behavior Matrix

The first alignment milestone focuses on whitespace, empty lines, Enter, Backspace, and Markdown block activation. These are the behaviors currently producing regressions.

### Empty Document

- Empty file, type `#`: FishMark must show `#`, keep source `#`, and place caret after `#`.
- Empty file, type one space: source becomes `" "`, caret moves one visible space width to the right.
- Empty file, type three spaces: source becomes `"   "`, caret moves three visible space widths to the right.
- Empty file, type spaces, press `Enter`: source and caret must match Typora; caret should land on the next editable row, not stay at document start or jump unexpectedly.
- Empty file, type spaces, press `Enter`, type `abc`: `abc` must appear at Typora's corresponding caret location.

### Paragraphs

- Paragraph end `Enter`: creates a new paragraph boundary like Typora.
- Paragraph middle `Enter`: splits into two Typora-style paragraphs with the caret at the new paragraph start.
- Paragraph start `Enter`: creates an empty paragraph before the current paragraph.
- Selection inside paragraph then `Enter`: replaces selection with Typora-style paragraph split behavior.
- `Shift+Enter`: inserts an inline hard break behavior, not a structural paragraph boundary.

### Headings

- Empty file, type `#`: marker is visible and editable.
- Type `# ` then text: heading activates naturally.
- Heading end `Enter`: creates a new editable paragraph surface after the heading.
- Heading end repeated `Enter`: every press produces the same kind of Typora-observable result for the same caret state.
- Heading-created empty paragraph, type space: source records the space and caret moves.
- Heading-created empty paragraph, Backspace at line start: returns according to Typora oracle in one action if Typora does so.

### Whitespace-only Lines

- Pure space line accepts additional spaces.
- Pure space line accepts normal text without caret jumps.
- Pure space line `Enter` creates a next editable line with caret at Typora's row and column.
- Backspace within a pure space line deletes one real whitespace character.
- Backspace at the start of a pure space line joins or removes the previous line according to Typora oracle.

### Blank Lines And Structural Separators

- A structural blank separator can be visually collapsed in inactive reading state.
- The active line under the caret must never be collapsed to zero height.
- Extra user-authored blank rows beyond the structural separator remain reachable and editable if Typora exposes them.
- Arrow navigation skips or lands on structural blank rows only as Typora does.

### Lists, Blockquotes, Code Fences, Tables

These areas should not be redesigned in the first milestone unless a behavior matrix case proves divergence. Existing special handlers remain, but they must consume the same physical line model so whitespace and caret behavior do not fork.

## Architecture Options

### Option A: Keep Parser-first And Add More Exceptions

Continue deriving active behavior from Markdown blocks and add targeted rules for empty documents, whitespace-only lines, heading-created blank blocks, and structural gaps.

Benefits:

- Smallest immediate diff.
- Fits current functions with limited new interfaces.

Costs:

- Continues the exact pattern that caused recent regressions.
- Whitespace behavior remains scattered across active-block, commands, decorations, and selection normalization.
- Each new Typora case likely needs another exception.

This option is rejected.

### Option B: Physical Editing Line Layer With Semantic Overlay

Add a dedicated physical line model derived directly from CodeMirror source. Every source line becomes an editable line surface. Markdown blocks are linked onto those lines as optional semantic overlays.

Benefits:

- Empty documents, blank lines, whitespace-only lines, and normal text lines share one editability model.
- Markdown parsing remains semantic and does not fake paragraphs for editor-only caret support.
- Enter, Backspace, arrows, and pointer selection can reason from line state first, then block semantics.
- Matches the observed Typora model closely.

Costs:

- Medium-sized refactor.
- Requires careful migration to avoid breaking lists, blockquotes, code fences, and tables.

This is the recommended option.

### Option C: Separate Source Editor And Rendered DOM Editor

Build a Typora-like contenteditable rendered DOM editor and sync it to Markdown source, using CodeMirror only as source mode.

Benefits:

- Closest conceptual match to Typora internals.
- Could eventually support richer WYSIWYG DOM editing.

Costs:

- Replaces the current CodeMirror-centered MVP architecture.
- Large risk for IME, selection, undo, accessibility, and Markdown round-tripping.
- Violates the current scope and would delay core editor stability.

This option is rejected for the MVP.

## Recommended Architecture

Introduce a new editor-derived line layer:

```text
CodeMirror doc
-> PhysicalEditingDocument
   -> EditingLine[]
      every source line, including empty and whitespace-only lines
-> MarkdownDocument
   parsed semantic blocks only
-> SemanticLineMap
   optional links from each EditingLine to Markdown block/item/role
-> EditorInteractionState
   activeLine + activeBlock + tableCursor
-> decorations and commands
```

### New Concepts

`EditingLine`:

- `number`
- `from`
- `to`
- `text`
- `lineBreakTo`
- `kind`: `empty`, `whitespace`, `text`
- `isDocumentStart`
- `isDocumentEnd`

`SemanticLineRole`:

- `paragraph`
- `heading`
- `list-item`
- `list-continuation`
- `blockquote`
- `code-fence-boundary`
- `code-fence-content`
- `table-source`
- `thematic-break`
- `definition`
- `html-image`
- `structural-separator`
- `extra-blank`
- `unparsed-text`

`EditorInteractionState`:

- `source`
- `selection`
- `activeLine`
- `activeBlock`
- `semanticLine`
- `tableCursor`
- `hasEditorFocus`

`activeLine` must always exist for non-null editor documents, including empty documents. `activeBlock` may be null.

### Ownership Rules

- Markdown parser owns semantic blocks only.
- Physical editing layer owns line existence, blankness, whitespace-only classification, and source offsets.
- Decorations own visual rendering of active and inactive line surfaces.
- Commands own input transformations and must be able to handle line-first behavior before semantic block-specific behavior.
- Selection normalization owns only hidden Markdown marker boundaries and explicit structural navigation, never ordinary text insertion caret movement.

## Command Design

### Enter

Enter command order should become:

1. If table cell interaction owns the selection, run table behavior.
2. If code fence content owns the selection, run code fence behavior.
3. If list item behavior owns the line, run list behavior.
4. If blockquote behavior owns the line, run blockquote behavior.
5. If thematic break owns the line, run thematic break exit behavior.
6. If heading owns the line and Typora oracle says heading Enter creates a following paragraph, do that.
7. Use physical line paragraph behavior for paragraph, whitespace, empty, and unparsed text lines.

The generic physical line behavior should not require `activeBlock?.type === "paragraph"`.

### Backspace

Backspace command order should become:

1. If selection is non-empty, let CodeMirror delete selection unless a semantic handler has an explicit reason to transform it.
2. If caret is inside a whitespace-only line and not at line start, delete one real character.
3. If semantic handler owns a marker boundary, run list / blockquote / code fence behavior.
4. If caret is at physical line start, join or remove the preceding line according to Typora oracle.
5. If caret is at a collapsed structural separator boundary, apply the oracle-defined structural deletion.
6. Otherwise use CodeMirror native `deleteCharBackward`.

Whitespace is content. A space should not be treated as absence of content by command routing.

### Space And Text Input

FishMark should not intercept normal printable text input to create fake Markdown blocks. After text input:

- Source change is accepted.
- CodeMirror selection after insertion is preserved.
- Derived state refreshes.
- Selection normalization may only adjust if the resulting anchor is inside a hidden Markdown marker range created by transformed presentation.

If the inserted character turns a line into Markdown syntax, such as `#`, the semantic overlay may update after parsing, but the character must remain visible and the caret must remain after the typed character.

## Decoration Design

Every visible CodeMirror line should receive a stable editing surface class based on `EditingLine` and optional semantic role.

Examples:

- `cm-fm-line`
- `cm-fm-line-empty`
- `cm-fm-line-whitespace`
- `cm-fm-line-active`
- `cm-fm-line-structural-separator`
- `cm-fm-line-extra-blank`
- `cm-active-heading`
- `cm-inactive-heading`
- `cm-active-paragraph`
- `cm-inactive-paragraph`

Active empty and whitespace lines must not be hidden with `height: 0`. Inactive structural separators may be collapsed only when they are not the active line and when the oracle or existing product rule says they are reading-only separators.

For empty active lines, prefer a visible line surface and caret anchor that does not modify source. A CSS pseudo-element or CodeMirror widget can provide geometry, but it must not introduce saved characters.

For whitespace-only active lines, preserve actual spaces with `white-space: pre-wrap`; do not replace the line with an empty placeholder.

## Selection Normalization Design

Current structural blank normalization is too broad for ordinary input. It should be split:

- `normalizeHiddenMarkerSelection`: allowed after navigation, mouse selection, and commands that intentionally expose or hide Markdown markers.
- `normalizeStructuralNavigationSelection`: allowed for ArrowUp, ArrowDown, pointer selection, and explicit block-boundary commands.
- No structural normalization after ordinary printable text input, including spaces.

The transaction filter should inspect user event type and transaction shape. A transaction that inserts printable text into an empty or whitespace-only line should not have its selection changed by structural blank logic.

## Test And Probe Design

### Typora Oracle Artifacts

Store oracle captures under:

```text
docs/plans/typora-like-editor/oracle/
```

Each capture should include:

- `case-id.md`: initial source and expected saved source snippets.
- `case-id.json`: version, settings, actions, sentinel, source result, visual notes.
- optional screenshots in `images/`.

### FishMark Probe Artifacts

Extend `src/renderer/markdown-editing-experience-probe.ts` to support named cases. It should return JSON with:

- `caseId`
- `initialSource`
- `actions`
- `content`
- `selection`
- `lineSnapshots`
- `caretRect`
- `cursorRect`
- `activeLine`
- `activeBlock`
- `pass`
- `diffAgainstOracle`

Named cases should be runnable through `scripts/probe-markdown-editing-experience.mjs`.

### Unit Tests

Add tests for:

- Physical line model creation.
- Semantic line mapping.
- active line resolution on empty, whitespace-only, blank, text, heading, list, and code fence lines.
- Enter and Backspace command behavior using a command target that exposes physical line state.
- Selection normalization not firing after printable text insertion.

### Renderer And Electron Tests

Add or extend:

- `src/renderer/code-editor.test.ts` for source and selection.
- Electron editing-experience probes for caret geometry.
- CSS contract tests for active empty and whitespace-only line visibility.

## Implementation Phases

### Phase 1: Oracle And Baseline

Create the behavior matrix and capture Typora oracle results for the whitespace and Enter / Backspace cases listed above. No FishMark behavior changes should be made in this phase except probe infrastructure.

Deliverables:

- Oracle cases in `docs/plans/typora-like-editor/oracle/`.
- FishMark probe cases that currently fail where behavior diverges.
- A short baseline report listing pass/fail per case.

### Phase 2: Physical Editing Line Layer

Add physical line model and semantic line mapping. Wire it into derived state without changing commands yet. Existing rendering should remain behaviorally stable except for exposing diagnostics in tests.

Deliverables:

- New editor-core module for physical lines.
- Derived state includes `editingDocument` and `activeLine`.
- Unit tests prove every source line is represented.

### Phase 3: Decoration Surfaces

Move active empty and whitespace-only line rendering to the physical line layer. Remove fake whitespace paragraph materialization.

Deliverables:

- Active empty line is visible and editable.
- Active whitespace-only line preserves spaces and caret movement.
- Inactive structural separator collapse still works.
- CSS and Electron geometry tests pass for empty and whitespace cases.

### Phase 4: Command Routing

Refactor Enter and Backspace to route through line-first behavior and semantic handlers second.

Deliverables:

- Empty document, whitespace-only line, paragraph, and heading Enter behavior match oracle.
- Backspace inside and at the start of whitespace-only lines matches oracle.
- Existing list, blockquote, code fence, and table command tests continue to pass.

### Phase 5: Selection Normalization Boundaries

Split hidden marker normalization from structural navigation normalization. Prevent ordinary printable input from being moved by structural blank logic.

Deliverables:

- Typing spaces never moves the caret backward.
- Typing `#` in an empty document remains visible and can become heading syntax normally.
- Arrow and mouse behavior around hidden markers remains covered by tests.

### Phase 6: Full Alignment Gate

Run all Typora oracle cases against FishMark and publish the pass/fail report. Only after this phase should the project claim Typora-like alignment for this behavior subset.

## Acceptance Criteria

- No semantic Markdown parser fake blocks are used to make whitespace editable.
- Every physical source line has an editable surface in FishMark derived state.
- Empty document typing `#`, space, multiple spaces, and normal text behaves according to Typora oracle.
- Pure whitespace lines treat whitespace as content for input, caret movement, Enter, and Backspace.
- Active empty lines and active whitespace-only lines are visible and have measurable caret geometry.
- Inactive structural separators may still collapse visually without collapsing active lines.
- Enter and Backspace behavior is consistent from headings, paragraphs, empty lines, whitespace-only lines, and repeated operations.
- FishMark probe output compares source, selection, and geometry against Typora oracle records.
- Existing list, blockquote, code fence, table, image, and inline rendering tests do not regress.

## Risks

- Typora GUI automation may be unreliable on Windows because focus, update dialogs, and save prompts can interfere. Manual oracle capture is acceptable only when it records enough evidence for repeatability.
- Refactoring command routing can affect lists and tables. These must stay behind semantic handlers with focused regression tests.
- Collapsed structural separators and active empty surfaces can conflict. The active physical line must always win.
- IME behavior must be watched carefully. Composition transactions should defer derived-state refresh as the current extension already does.
- CodeMirror decorations that insert widgets for empty lines can affect selection mapping. Prefer line decorations and CSS first; use widgets only when measured geometry requires them.

## Review Questions

- Should the first oracle milestone target only Windows Typora 1.13.4, or should macOS Typora be captured before implementation begins?
- Should FishMark match Typora default whitespace settings only, or support an explicit future setting for alternative whitespace / line-break modes?
- Should exact pixel geometry be required, or is same row/column plus stable caret movement enough for this milestone?

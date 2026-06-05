# Editing Region and Structural Line Model Design

Status: design draft for review.

## Context

FishMark currently implements Markdown editing behavior through a chain of block-specific commands and selection normalizers. This has worked for individual features, but recent blockquote fixes exposed a structural gap:

- body paragraphs already treat the first blank line between blocks as a non-editable structural separator;
- blockquote inner content now has the same logical separator, represented in source as a bare quote line such as `>`;
- Arrow keys, Backspace, Enter, mouse selection, and marker hiding do not all consume one shared separator model.

The result is patchy behavior: one command path may skip a quote-internal separator while another path still lets the caret enter it. The editor needs a shared editing model that can apply the same core experience across body text, blockquote inner flow, list items, code fences, table cells, and future specialized regions.

## Goals

- Make the body editing experience the reusable baseline for all flow-like Markdown regions.
- Prevent structural separators from being editable regardless of whether they are plain blank lines or quote-internal bare marker lines.
- Route keyboard and selection behavior through explicit editing regions instead of scattered block-type special cases.
- Allow future code-block-specific behavior such as Tab indentation, Shift+Tab outdent, and Ctrl+/ comment toggling.
- Preserve Markdown source as the only truth and keep all changes round-trip safe.
- Keep the first implementation slice incremental; do not replace CodeMirror or rewrite the parser.

## Non-Goals

- No full virtual document engine in the first slice.
- No change to the saved Markdown format.
- No automatic reformatting of existing documents.
- No table editing redesign beyond defining how it fits into the model.
- No complete code-editor feature set for code fences in the first slice.

## Baseline Body Editing Contract

The body editor already defines the baseline product feel. Every flow-like nested region should match this contract unless the region deliberately overrides a command.

Directional movement:

- `ArrowUp` / `ArrowDown`: preserve the visual goal column and skip non-editable structural separator lines.
- `ArrowLeft` / `ArrowRight`: use normal character movement first, then normalize away from hidden Markdown markers and structural separators.
- Mouse selection and programmatic selection: never leave the caret inside hidden markers or non-editable structural lines.

`Enter`:

- In normal paragraph flow, create a new peer block by inserting the source separation needed by Markdown.
- In block flow, one structural separator line is the boundary between blocks.
- In special regions, the innermost region handles first: lists create sibling items, code fences insert literal newlines, tables keep table-specific behavior.
- On an empty structural line that represents container exit, `Enter` should move one level outward, not collapse all parents at once.

`Backspace`:

- With a non-empty selection, delete the selection.
- At visible line start, first remove the structural separator or hidden marker boundary before joining visible content.
- Inside lists, list semantics take precedence over plain text deletion: empty child items promote, empty top-level items exit, and non-empty items detach or join according to the same rules used in body lists.
- Inside transformed Markdown surfaces, Backspace must affect the source construct that produced the visible caret location, not a hidden decoration artifact.

## Proposed Architecture

Introduce two related concepts:

1. `StructuralLineModel`
2. `EditingRegion`

`StructuralLineModel` answers whether a physical source line is editable, structural, hidden, extra blank, or visible content. It must be parser-owned where possible. For example:

- body structural separator: an empty physical line between two blocks;
- blockquote structural separator: a blockquote line with no inner content, such as `>`, between two parser-owned `innerBlocks`;
- extra blank line: an additional empty line beyond the first separator, if product rules allow it to be editable;
- editable empty quote line: a trailing `> ` line created as the active editing surface, not a separator between two inner blocks.

`EditingRegion` describes the command behavior at the current selection. The editor resolves a region stack from outermost to innermost, then routes commands from the innermost region outward.

Example stacks:

```text
RootFlowRegion
```

```text
RootFlowRegion
  QuoteFlowRegion(depth=1)
    ListRegion
      ListItemRegion
```

```text
RootFlowRegion
  QuoteFlowRegion(depth=1)
    CodeFenceRegion(language=ts)
```

The command router should ask each region whether it can handle a command. If the innermost region declines, the command bubbles to its parent region, and eventually to CodeMirror's default behavior.

## Core Regions

### RootFlowRegion

Owns standard Markdown body flow:

- `Enter`: create a new Markdown block boundary using structural separator rules.
- `Backspace`: at visible line start, delete the preceding structural separator before joining content.
- `ArrowUp` / `ArrowDown`: skip non-editable structural separators while preserving visual goal column.
- `ArrowLeft` / `ArrowRight`: use CodeMirror movement, then normalize away from hidden markers and structural separators.
- mouse / programmatic selection: normalize away from hidden markers and non-editable structural separators.

### QuoteFlowRegion

Reuses RootFlow semantics inside a blockquote while mapping between inner flow coordinates and source coordinates.

Its responsibilities:

- identify quote-internal structural separators from parser-owned blockquote line metadata;
- preserve, insert, or remove quote prefixes when RootFlow operations edit inner content;
- support nested quote depth without treating raw prefix width as layout geometry;
- distinguish quote-internal separator lines from active editable quote lines.
- keep draft quote markers as raw source text until committed by typing, pressing Enter, or moving selection away; after commit, place the caret inside the quote content surface.

Example:

```md
> 11
>
> > 1
```

The middle `>` is a structural separator between inner blocks. The caret must not enter it. Backspace from the visible start of `1` removes that separator and produces:

```md
> 11
> > 1
```

Nested quote levels follow the same rule one level at a time. On an empty innermost quote line, `Enter` exits to the parent quote level; only an empty top-level quote line exits the quote container.

### ListRegion

Owns list-specific semantics independent of whether the list is in body flow or quote flow:

- non-empty item `Enter`: create sibling item;
- empty child item `Enter`: promote to parent list level;
- empty top-level item `Enter`: exit list into the parent Flow region;
- `Backspace` at content start: remove marker or detach item using parent Flow structural rules;
- `Tab` / `Shift+Tab`: indent or outdent inside the current parent region.

Inside blockquotes, ListRegion should not implement a separate quote-list behavior. It should operate on inner list semantics, while QuoteFlowRegion handles source prefix preservation.

### CodeFenceRegion

Owns literal code editing behavior:

- `Enter`: insert literal newline inside the code block.
- `Tab`: indent current line or selected lines.
- `Shift+Tab`: outdent current line or selected lines.
- `Ctrl+/`: toggle line comments using the fence language when supported.
- `Backspace`: edit code text normally; only bubble to parent region at code fence boundaries.
- Arrow keys: move inside code text normally; bubble only when crossing code fence boundaries.

When nested inside a quote, QuoteFlowRegion handles quote prefix mapping for every changed code line.

### TableRegion and TableCellRegion

Own table navigation and cell-level behavior:

- `Tab` / `Shift+Tab`: move across cells.
- Arrow keys: move inside cell content first, cross cell boundaries only at edges.
- `Enter`: table-specific behavior, to be defined separately.
- Backspace at table-adjacent blank lines continues to use parent Flow structural rules.

## Behavior Matrix

| Command | Root flow | Quote flow | List | Code fence | Table cell |
| --- | --- | --- | --- | --- | --- |
| `Enter` | Create peer block / structural separator | Same as root after quote-prefix mapping | Non-empty: sibling; empty child: promote; empty top-level: exit to parent flow | Literal newline | Cell-specific behavior |
| `Backspace` | Delete selection; at line start remove structural boundary before joining | Same as root after quote-prefix mapping | Same as body list behavior, regardless of quote nesting | Normal code deletion; bubble only at fence boundary | Cell deletion first, parent flow at table boundary |
| `ArrowUp` / `ArrowDown` | Skip structural separators, preserve goal column | Same, including bare `>` separator lines | Same visual navigation through list content | Move inside code; bubble at fence edge | Move inside cell, cross cells only by table rules |
| `ArrowLeft` / `ArrowRight` | Normal movement plus normalization | Same, with quote markers hidden from editable geometry | Same as body list | Normal code movement | Cell movement first |
| `Tab` / `Shift+Tab` | Default or parent command | Parent command unless child handles | Indent / outdent list item | Indent / outdent code lines | Move previous / next cell |
| `Ctrl+/` | Optional parent command | Parent command unless child handles | Optional list-aware parent command | Toggle line comment by language | Cell-local command if supported |

## Command Routing

The editor should replace the current command chain with a region-aware dispatcher in stages.

Conceptual API:

```ts
type EditingCommand =
  | "enter"
  | "backspace"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "tab"
  | "shiftTab"
  | "toggleComment";

type EditingRegion = {
  kind: string;
  parent: EditingRegion | null;
  handleCommand(command: EditingCommand, context: EditingCommandContext): CommandResult;
};
```

Command resolution:

1. Build a region stack from parser metadata and selection.
2. Ask the innermost region to handle the command.
3. If it returns `notHandled`, ask the parent region.
4. If all regions decline, fall back to CodeMirror default behavior.
5. After command execution, run one shared selection normalization pass.

## Selection Normalization

Selection normalization should consume `StructuralLineModel`, not block-specific CSS classes.

It must prevent caret placement inside:

- hidden Markdown markers;
- body structural separators;
- quote-internal structural separators;
- rendered widgets or transformed inactive block surfaces where the raw source is hidden.

It must allow caret placement inside:

- active editable blank lines;
- extra blank lines that are intentionally editable;
- active quote draft markers before commit;
- active code fence content;
- active table cells.

Normalization should be applied after keyboard navigation, mouse selection, programmatic selection, and non-typing transactions. Printable input and IME composition must not be moved unexpectedly.

## StructuralLineModel

`StructuralLineModel` should be a small, explicit module that can answer:

- `getLineRole(lineNumber | offset)`;
- `findPreviousEditableLine(offset, goalColumn?)`;
- `findNextEditableLine(offset, goalColumn?)`;
- `findSeparatorBeforeLine(lineStartOffset)`;
- `normalizeSelectionAnchor(anchor, direction)`;
- `deleteSeparatorBeforeLine(lineStartOffset)`;

Line roles should include at least:

```ts
type StructuralLineRole =
  | "editable-content"
  | "editable-empty"
  | "structural-separator"
  | "extra-blank"
  | "hidden-marker-line";
```

For blockquotes, the model must use blockquote `lines` and `innerBlocks` metadata rather than regex-only detection.

## Data Flow

1. Parser produces `MarkdownDocument`, including blockquote `lines` and `innerBlocks`.
2. Derived state builds active block state and editing region stack.
3. `StructuralLineModel` is built from the same parser-owned metadata and physical editing document.
4. Keymaps call the editing command router.
5. The router dispatches through regions and produces source changes or selection updates.
6. Selection normalization runs once after command application.
7. Decorations render active and inactive lines from the same metadata.

## Error Handling and Safety

- If a region cannot confidently map a command back to source offsets, it must return `notHandled`.
- If parser metadata is missing or stale, fall back to existing CodeMirror behavior rather than rewriting source.
- Command results must preserve undo granularity.
- IME composition and printable input must not be intercepted by structural navigation normalization.
- Source mode must bypass transformed region behavior and expose raw Markdown.

## Incremental Rollout

### Phase 1: Shared StructuralLineModel

- Move body structural blank and quote-internal separator detection into one module.
- Make ArrowUp, ArrowDown, Backspace, pointer selection, and selection normalization consume this model.
- Keep existing command functions but replace duplicated separator checks.

### Phase 2: Region Stack and Router

- Add region stack resolution for RootFlow, QuoteFlow, List, CodeFence, Table.
- Route Enter, Backspace, ArrowUp, ArrowDown, Tab, and Shift+Tab through regions.
- Keep behavior equivalent to current passing tests.

### Phase 3: QuoteFlow Source Mapping

- Replace quote-specific list and blockquote command branches with parent Flow operations plus quote prefix mapping.
- Confirm quote-internal paragraph, list, nested quote, code fence, math, and Mermaid blocks share body editing semantics.

### Phase 4: CodeFenceRegion Enhancements

- Add Tab / Shift+Tab indentation.
- Add Ctrl+/ line comment toggling for supported languages.
- Add tests for code fences inside and outside blockquotes.

## Testing Strategy

Structural tests:

- parser-owned body and quote-internal separator line roles;
- line model previous / next editable line resolution;
- deletion ranges for body and quote separators;
- source mapping for quote-prefixed edits.

Editor command tests:

- ArrowUp / ArrowDown skip body and quote separators;
- Backspace deletes separators instead of entering them;
- Enter creates structural separators in body and quote flow;
- ListRegion behavior is identical inside and outside quotes;
- CodeFenceRegion Tab / Shift+Tab behavior does not affect surrounding Markdown.

Renderer / browser probes:

- caret geometry for skipped separators;
- no active line class on non-editable separators;
- quote rail continuity while separator source remains hidden;
- code fence indentation inside quote preserves visible text columns.

Regression gates:

- focused editor-core command tests;
- renderer `code-editor.test.ts`;
- blockquote editing-experience probe group;
- list editing-experience probe group;
- typecheck, lint, build, and `git diff --check`.

## Acceptance Examples

Quote structural separator:

```md
> 1
>
> 222
```

From the visible start of `222`, `ArrowUp` must land on the visible `1` line, not the bare `>` line. `Backspace` must delete the bare `>` separator before joining or moving through content.

Nested quote exit:

```md
> 11
> > 222
> > >
```

Pressing `Enter` on the empty innermost line exits to `> >`; pressing `Enter` again exits to `>`; only an empty top-level quote line exits the quote container.

List parity inside quotes:

```md
> 1. 111
> 2. 333
>    1. 222
>       1. 1.1
>       2.
```

Pressing `Enter` on the empty deepest item must produce the same promoted numbering that the body list editor produces, with quote prefixes preserved but not changing list semantics.

Draft quote marker:

```md
>
```

While the marker is uncommitted, it renders as raw `>` text. Typing content, pressing `Enter`, or moving selection away commits it into a quote block and places the caret in the quote editing surface.

## Open Questions

- Should mouse clicking a quote-internal separator always move to the previous editable block end, or should click vertical position decide previous vs next block?
- Should `ArrowLeft` / `ArrowRight` have explicit region routing, or is post-move normalization enough?
- For code fences, should Tab insert spaces by default or respect a configurable indent width immediately?
- Should table cell multiline editing be supported before or after CodeFenceRegion shortcuts?

## Recommended Next Step

Start with Phase 1. It directly addresses the current blockquote structural separator regressions while creating the shared foundation needed for region routing.

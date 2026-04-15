# TASK-008 Micromark Block Map Design

## Scope

Task: `TASK-008`
Goal: Generate a stable Markdown block map from source text inside `packages/markdown-engine/` so later tasks can identify the active block and render blocks without treating rendered output as the source of truth.

In scope:
- Add the first real Markdown-engine implementation under `packages/markdown-engine/`
- Integrate `micromark` as the parsing backend
- Define a minimal block-map data model for top-level Markdown blocks
- Produce block entries for `heading`, `paragraph`, `list`, and `blockquote`
- Preserve source offsets and line ranges so later tasks can recover exact Markdown slices
- Add unit tests for normal and boundary inputs
- Extend the repo test/typecheck coverage so `packages/markdown-engine` is actually gated

Out of scope:
- Renderer integration
- Active-block tracking
- Rendered block UI
- List item / task list decomposition
- Code fence, table, image, link, or inline token mapping
- Round-trip transforms beyond exposing exact source ranges

## Current Constraints

- Markdown text remains the only source of truth
- The work must stay focused on `packages/markdown-engine/`
- This task must not widen into monorepo/package-manager refactoring
- Future tasks need stable offsets and source slices more than rich rendering metadata
- Current repo gates only cover `src/**`, so `TASK-008` needs a minimal gate extension to stay meaningful

## Approaches Considered

### Option 1: Parse with `micromark` events and build a minimal top-level block map

Use `micromark` as the source of Markdown structure, walk its parse output, and emit only the block types required by the backlog with stable source ranges.

Pros:
- Matches the backlog and design docs directly
- Keeps `TASK-008` tightly scoped to parsing
- Produces the right primitive for `TASK-009`, `TASK-010`, `TASK-011`, `TASK-012`, `TASK-013`, and `TASK-017`
- Minimizes future migration risk because the parser boundary already lives in `packages/markdown-engine/`

Cons:
- Requires a small repo-config update so tests and typecheck include `packages/markdown-engine`
- Needs careful handling of offsets/lines to avoid unstable mappings

### Option 2: Hand-roll a temporary line-based parser first

Implement a custom parser for headings, paragraphs, lists, and blockquotes without `micromark`, then swap to `micromark` later.

Pros:
- No new dependency right away
- Could be faster to prototype

Cons:
- Explicitly conflicts with the backlog goal
- Creates throwaway parsing logic
- Increases future risk around CommonMark edge cases and block boundaries

### Option 3: Build a full rich AST now

Use `micromark` to emit a more complete internal AST including nested list items, inline spans, and future render metadata.

Pros:
- Richer long-term model

Cons:
- Clearly overshoots `TASK-008`
- Adds design surface before downstream tasks prove they need it
- Raises risk around premature abstractions and unstable types

Recommendation: choose Option 1.

## Recommended Architecture

Implement the first Markdown-engine surface as a narrow parsing module with three responsibilities:

1. Define the stable block-map types.
2. Parse Markdown with `micromark`.
3. Convert parser structure into a minimal ordered list of top-level blocks.

Suggested file layout:

- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/markdown-engine/src/index.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`

The exported API should stay intentionally small:

```ts
export interface BlockMap {
  blocks: MarkdownBlock[];
}

export function parseBlockMap(source: string): BlockMap;
```

This keeps future renderer/editor tasks dependent on a stable engine entrypoint instead of parser internals.

## Data Model

Every block should include the minimum information later tasks actually need:

- `id`
- `type`
- `startOffset`
- `endOffset`
- `startLine`
- `endLine`

Type-specific fields:

- `heading.depth`
- `list.ordered`

Recommended shape:

```ts
type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | BlockquoteBlock;
```

Rules:

- `id` should be deterministic for identical input, for example `heading:0-12`
- ranges are half-open: `startOffset` inclusive, `endOffset` exclusive
- `source.slice(startOffset, endOffset)` must return the original Markdown for that block
- block order must match source order
- multi-line paragraphs, contiguous lists, and contiguous blockquotes each map to one block entry

## Parsing Strategy

`micromark` remains the parser authority. The conversion layer should only normalize its result into the task-specific block map.

This task should emit only top-level block entries:

- `heading`
- `paragraph`
- `list`
- `blockquote`

It should ignore unsupported top-level constructs for now rather than inventing partial semantics. That means unsupported blocks can be skipped until a later task explicitly expands coverage.

## Testing Strategy

Start with failing tests in `packages/markdown-engine/src/parse-block-map.test.ts`.

Required coverage:

- mixed input returns block entries in source order
- headings expose the correct `depth`
- ordered vs unordered lists set `ordered` correctly
- multi-line paragraphs collapse into one paragraph block
- contiguous blockquote lines collapse into one blockquote block
- empty input and whitespace-only input return `[]`
- exact source slices can be recovered from offsets

Repo gates for this task:

- `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Risks

- If offsets or line numbers are off by one, later active-block mapping will be unreliable
- If the block model includes too much structure now, downstream tasks will inherit accidental constraints
- If `packages/markdown-engine` is not added to gates, this task can appear complete without actually being verified

## Docs Expected To Update During Implementation

- `docs/decision-log.md`
- `docs/test-report.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-008.md`

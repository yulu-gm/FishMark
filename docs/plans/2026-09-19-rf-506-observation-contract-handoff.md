# RF-506 observation contract review and migration

## Decision

Markdown remains the source of truth. Do not invent inline task-container syntax or empty Paragraph AST nodes to satisfy an old fixture. GFM §5.3 defines a task marker as the beginning of the first paragraph in a list item: https://github.github.io/gfm/#task-list-items-extension-.

FishMark already has a two-space list/empty-item continuation editing dialect. In `> - List1\n>   - `, plain micromark chooses a setext heading, while the established production Tab behavior and canonical editor model intentionally retain an empty nested list item. That behavior predates this migration. Tests explicitly assert both interpretations; this document does not claim that every FishMark editing node is a CommonMark AST node. Empty editing items still do not need invented Paragraph children.

The independent installed micromark renders `> - [ ] > - [ ] > leaf` as one blockquote/list/item containing literal greater-than signs. Conversely, `- - alpha` really contains two lists; the latter parser/command failures are not excused by this migration.

## Exact fixture changes

- `mixed-container-depth-5-selection`: source is now `> - [ ] task\n>   > - [ ] task\n>   >   > leaf`. The leaf selection moves to offsets 40–44. Depth stays 5; all three checkpoints still select the same leaf. Per-line depth/content/marker columns are `(2,8,2)`, `(4,12,6)`, `(5,10,8)`.
- `mixed-container-depth-8-selection`: source is now `> - [ ] task\n>   > - [ ] task\n>   >   > - [ ] task\n>   >   >   > - [ ] leaf`. Depth stays 8 and all four task markers remain. Per-line depth/content/marker columns are `(2,8,2)`, `(4,12,6)`, `(6,16,10)`, `(8,20,14)`; selection follows the actual `leaf` range.
- `nested-quote-list-repeated-enter-exit`: primary path ends at the outer ListItem; undo retains the actual inner List/ListItem and has no Paragraph. Last-line geometry becomes depth/content/marker `(3,5,4)` for primary and `(4,7,6)` for undo. No DOM visibility expectation changed.
- `blockquote-bare-list-marker-tab`: primary/repeat/undo paths end at their actual ListItem. Undo last-line geometry becomes `(3,5,4)`.
- `blockquote-padded-empty-list-item-tab`: primary/repeat/undo paths end at their actual ListItem.
- `blockquote-list-exit-trailing-separator-cleanup`: undo path ends at ListItem.

Initial semantic paths for those empty items also describe the real containers. Source, selection and commands in the four empty-item cases remain unchanged.

The next formal run exposed ten more targets of the same clarified contract:

- Bare-marker Tab primary/repeat, padded Tab primary/repeat/undo, and trailing-separator cleanup undo: the last physical line is editable marker `content`, not a structural separator (six role targets). Its active-line DOM visibility remains visible.
- Deep ordered-list repeated Enter primary: the final empty item has no Paragraph child and its marker line is `content` (two targets). This uses the established FishMark list indentation dialect.
- List-blockquote Enter primary: the last empty quote resolves to Blockquote, without an invented Paragraph. Independent micromark events show the only paragraph ends at source offset 9.
- List-blockquote Enter repeat: in `- > quote\n  \n`, the list/quote/paragraph all end at offset 9. The whitespace-only second line at offsets 10–12 has depth/content column 0/0, rather than inheriting a departed list. Its exact two spaces and visible DOM contract remain unchanged.

## Calibration safety

`current-observations.ts` remains the immutable RF-001 historical record with its original hashes, run ID, values and reasons. The bootstrap migration removed evidence only for 74 enumerated checkpoint/aspect targets: 42 for the two changed task sources, 9 initial empty-item semantic revisions, 3 marker geometries, the ten additional empty-container targets above, and ten quote-authoring targets below.

The migration is explicit, hashed and target-specific. Pending targets cannot carry old verified or known-defect evidence. Unknown/duplicate targets, unlisted missing evidence and tampered migration hashes fail closed. Pending targets retain `gap`; formal comparison still requires exact desired behavior and cannot excuse old known values. The immutable historical baseline is not recaptured from current failures.

Bootstrap migration identity: manifest `fnv1a32-c3f2d4a4`, contract `fnv1a32-c680cf8b`, calibration `fnv1a32-0ace5e57`. This is a contract-migration identity, not a claimed Electron run. Fresh formal evidence must replace pending evidence before final acceptance; do not mark RF-506 complete with permanent gaps.

That bootstrap is now retired from the active data. The complete fresh Electron report `.artifacts/rf506-parent-contract-final.json` has run ID `d46d7078-8ac3-4cf3-9a0f-0ac89953a320`: 121/121 cases, 363 checkpoint observations, 2,541 target verdicts, 79 verified-existing + 2,355 verified-runner + 107 exact historical-known, zero unexpected and zero not-run. All 74 migrated targets passed their exact desired values.

The final active calibration hash is `fnv1a32-12fd6881`, with the same execution/contract hashes above and that real fresh run ID. It contains 2,434 verified targets, 107 remaining historical defects, and no pending targets. Generation checked target uniqueness/completeness and deep equality between every remaining known observation and its immutable historical value. Fixed historical defects are removed from the active known set; no new known observations were introduced. The original RF-001 file, values, reasons, run ID and hashes remain unchanged. All current runner provenance legitimately references the fresh run because every target was actually observed again.

## Quote source authoring correction

The final three unexpected geometry objects combined an already-fixed separator visibility field with old source mismatches. Read-only inspection established an incorrect fixture derivation, not a new source behavior:

- `matrix-enter-path-4` primary/repeat: the generic wrapper prefixed every blank with `> `, but the pre-refactor production test “continues a non-empty blockquote line on Enter” explicitly required `> quote\n>\n> `. The old `buildBlockquoteStructuralSeparatorPrefix` also trimmed a single quote separator. Roadmap §7.7 specifies recursive coverage, not padded source. Primary is now `> al\n>\n> pha`, selection 9; repeat is `> al\n>\n> \n>\n> pha`, selection 14. The source, selection and geometry targets for both checkpoints are recalibrated; every inactive separator still must collapse.
- `nested-blockquote-marker-commits-after-enter` repeat: the named probe and controller test only captured the first Enter; the probe then typed `nested`. The old `exitTrailingBlockquoteSeparatorPair` and its test explicitly outdented an entire pair of empty quoted lines. Repeat therefore yields `>\n> `, selection 4, with a collapsed separator and visible active line. Source, selection, roles and geometry are recalibrated.

Neither case has Typora exact-source capture provenance. New independent authoring assertions encode the pre-refactor contracts without running the new model to derive expectations. No known baseline value or comparator rule was broadened.

## Development evidence

Independent micromark block-event tests prove the task sources retain the requested leaf ancestor path; exact source and physical-column assertions supplement the parser-independent check. Installed micromark HTML also demonstrates why the original same-line task source was invalid for that path.

Final fixture/model-quality/matrix/execution-plan/calibration/runner/formal-port tests: 7 files, 72 tests passed. Complete-coverage assertions again require zero gaps. They also assert 2,434 verified + 107 known and object identity with the immutable historical known records. The reusable explicit pending migration API remains fail-closed and has tests rejecting overlap, unknown/duplicate targets, missing unrelated evidence and hash tampering; the delivered active calibration does not use it. Parent owns repository gates and progress documents.

Manual acceptance: open both multiline task samples, select `leaf`, verify quoted/list indentation and caret mapping; exercise nested empty-item Enter/Tab/undo and verify list depth and marker visibility. No application code was changed in this contract slice.

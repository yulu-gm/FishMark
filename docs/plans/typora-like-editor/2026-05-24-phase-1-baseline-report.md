# Phase 1 Typora Oracle And FishMark Baseline Report

Date: 2026-05-24
Task: TASK-053
Status: DEV_DONE

## Purpose

This report tracks the first alignment milestone from `2026-05-24-typora-editing-alignment-design.md`: build a Typora oracle before changing FishMark's editing architecture.

FishMark must not claim Typora-like alignment for this behavior subset until each case in `oracle/case-matrix.json` has both:

- Typora evidence captured under `oracle/`
- FishMark probe output with source, selection, and geometry evidence where required

TASK-053 is complete as a baseline/oracle setup task. It does not claim Typora-like alignment: the four blocked GUI-placement cases remain excluded from oracle expectations and pass/fail scoring until a future manual capture or stronger automation proves their intended caret placement.

## Current Setup

- Backlog split is registered as TASK-053 through TASK-058.
- Oracle protocol is defined in `oracle/README.md`.
- Initial case matrix is defined in `oracle/case-matrix.json`.
- Typora executable is present at `C:\Program Files\Typora\Typora.exe`.
- Typora file version and product version are both `1.13.4`.
- Current FishMark probe infrastructure already exists:
  - `scripts/probe-markdown-editing-experience.mjs`
  - `src/renderer/markdown-editing-experience-probe.ts`
  - named probe cases can now run by oracle `caseId`
  - legacy aliases `empty-document-space-caret` and `heading-enter-space-caret` still map to the corresponding oracle `caseId`

## Current Case Status

Current matrix totals:

- Captured: 12
- Blocked: 4
- Pending capture: 0

The first capture batch should prioritize:

| Case | Typora status | Evidence |
| --- | --- | --- |
| `empty-type-hash` | captured | `oracle/empty-type-hash.json`, `oracle/images/empty-type-hash.png`; saved source after sentinel: `#FM_SENTINEL_EMPTY_HASH` |
| `empty-type-one-space` | captured | `oracle/empty-type-one-space.json`, `oracle/images/empty-type-one-space.png`; saved source after sentinel: ` FM_SENTINEL_EMPTY_SPACE_1` |
| `empty-type-three-spaces` | captured | `oracle/empty-type-three-spaces.json`, `oracle/images/empty-type-three-spaces.png`; saved source after sentinel: `   FM_SENTINEL_EMPTY_SPACE_3` |
| `empty-spaces-enter-text` | captured | `oracle/empty-spaces-enter-text.json`, `oracle/images/empty-spaces-enter-text.png`; saved source after sentinel: `   \r\n\r\nabcFM_SENTINEL_EMPTY_SPACES_ENTER_TEXT` |
| `paragraph-end-enter` | captured | `oracle/paragraph-end-enter.json`, `oracle/images/paragraph-end-enter.png`; saved source after sentinel: `Paragraph\r\n\r\nFM_SENTINEL_P_END_ENTER` |
| `paragraph-middle-enter` | captured | `oracle/paragraph-middle-enter.json`, `oracle/images/paragraph-middle-enter.png`; saved source after sentinel: `Alpha\r\n\r\nFM_SENTINEL_P_MID_ENTERBeta` |
| `paragraph-start-enter` | captured | `oracle/paragraph-start-enter.json`, `oracle/images/paragraph-start-enter.png`; saved source after sentinel: `\r\n\r\nFM_SENTINEL_P_START_ENTERParagraph` |
| `heading-end-enter` | captured | `oracle/heading-end-enter.json`, `oracle/images/heading-end-enter.png`; saved source after sentinel: `# Title\r\n\r\nFM_SENTINEL_H_END_ENTER` |
| `heading-end-repeated-enter` | captured | `oracle/heading-end-repeated-enter.json`, `oracle/images/heading-end-repeated-enter.png`; saved source after sentinel: `# Title\r\n\r\n\r\n\r\n\r\n\r\nFM_SENTINEL_H_REPEAT_ENTER` |
| `heading-empty-paragraph-space` | captured | `oracle/heading-empty-paragraph-space.json`, `oracle/images/heading-empty-paragraph-space.png`; saved source after sentinel: `# Title\r\n\r\n FM_SENTINEL_H_EMPTY_P_SPACE` |
| `heading-empty-paragraph-backspace` | captured | `oracle/heading-empty-paragraph-backspace.json`, `oracle/images/heading-empty-paragraph-backspace.png`; saved source after sentinel: `# TitleFM_SENTINEL_H_EMPTY_P_BACKSPACE` |
| `whitespace-line-type-text` | blocked | GUI automation landed in the following visible word, not on the whitespace-only source line. Retained as failed capture evidence only. |
| `whitespace-line-enter` | blocked | GUI automation using a visual click between rendered lines landed in the following visible word, not on the whitespace-only source line. Retained as failed capture evidence only. |
| `whitespace-line-backspace-inside` | blocked | GUI automation landed in the following visible word, not inside the whitespace-only source line. Retained as failed capture evidence only. |
| `structural-blank-arrow-down` | captured | `oracle/structural-blank-arrow-down.json`, `oracle/images/structural-blank-arrow-down.png`; saved source after sentinel: `Paragraph one\n\nParagraph twoFM_SENTINEL_STRUCT_ARROW_DOWN` |
| `structural-blank-backspace-at-next-block` | blocked | GUI automation landed after the first visible character of the next paragraph, not at the block start. Retained as failed capture evidence only. |

No cases are still pending capture. Blocked cases require manual capture or a stronger GUI automation approach before they can become oracle expectations.

## Blocked Case Review

Second implementation-worker review on 2026-05-24 rechecked the four blocked records against the matrix offsets, saved sentinel sources, screenshots, and available `tmp/typora-oracle-*` scratch files. None of the four records satisfies the upgrade criteria for a captured oracle: the evidence does not prove that Typora's caret was at the intended source offset before the action, and in each saved source the sentinel proves the action happened in adjacent visible text or lacks the required visual proof.

| Case | Review conclusion | Evidence and attempted methods | Next manual step |
| --- | --- | --- | --- |
| `whitespace-line-type-text` | blocked | Matrix target is offset 10 inside `Before\n   \nAfter`, but saved source is `Before\n\nAftabcFM_SENTINEL_WS_TYPE_TEXTer`; screenshot shows insertion inside the visible `After` line. Rechecked JSON, fixture bytes, PNG, and `tmp/typora-oracle-capture/whitespace-line-type-text.md`. | Manually place the caret on the three-space source line, type `abc`, insert `FM_SENTINEL_WS_TYPE_TEXT`, save, and promote only if sentinel bytes remain on that whitespace line. |
| `whitespace-line-enter` | blocked | Failed visual click source is `Before\n\nA\n\nFM_SENTINEL_CLICK_WS_ENTERfter`, so Enter happened after `A` in `After`; no screenshot exists, and the failed run used a click-test sentinel rather than the matrix sentinel. Rechecked JSON and `tmp/typora-oracle-click-test/whitespace-click-test.md`. | Capture with screenshot before Enter, then use the matrix sentinel `FM_SENTINEL_WS_ENTER`; promote only if source and screenshot both prove the whitespace-line start. |
| `whitespace-line-backspace-inside` | blocked | Matrix target is offset 9 inside the whitespace-only line, but saved source is `Before\n\nAFM_SENTINEL_WS_BACKSPACE_INSIDEter`; screenshot shows caret in `After`. Rechecked JSON, fixture bytes, PNG, and `tmp/typora-oracle-capture/whitespace-line-backspace-inside.md`. | Manually confirm caret inside the three-space source line before Backspace, then save sentinel evidence proving deletion and final caret stayed on that line. |
| `structural-blank-backspace-at-next-block` | blocked | Matrix target is offset 15 at the start of `Paragraph two`, but saved source is `Paragraph one\n\nFM_SENTINEL_STRUCT_BACKSPACEaragraph two`; screenshot shows `P` was deleted before sentinel insertion, so Backspace started after the first visible character. Rechecked JSON, fixture bytes, PNG, and `tmp/typora-oracle-capture/structural-blank-backspace-at-next-block.md`. | Manually place the caret at the visual start of `Paragraph two`, screenshot before Backspace, then save sentinel evidence proving the action began at offset 15. |

## Known FishMark Context

Two local 2026-05-24 handoffs already describe short-term fixes:

- `docs/plans/2026-05-24-heading-enter-backspace-handoff.md`
- `docs/plans/2026-05-24-editable-whitespace-document-handoff.md`

Those fixes are useful regression context, but the alignment design treats parser-first whitespace materialization as transitional. TASK-055 must replace that direction with physical editing line surfaces.

## Pending Work

- Manually capture or improve GUI automation for the four still-blocked whitespace / structural blank cases; second-worker review found no existing evidence strong enough to promote them.
- Keep the blocked whitespace-only cases out of pass/fail alignment scoring until they have reliable FishMark probe placement.
- Record any case that needs manual visual observation because source bytes alone are insufficient.
- Feed the two FishMark baseline failures below into TASK-054 through TASK-058; TASK-053 intentionally does not change editing behavior.

## FishMark Baseline So Far

The first 12 captured oracle cases are mapped to FishMark probe `caseId` values and can be run individually with:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='<caseId>'; npm.cmd run test:editing-experience
```

They can also be run together with:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience
```

Group run result on 2026-05-24: **10 pass / 2 fail**. The command exited non-zero because the two fail rows below are real FishMark-vs-oracle baseline gaps.

For mapped oracle cases, `pass` now means the probe matched expected source bytes, expected selection, and mapped visual assertions. The generic oracle runner records those visual checks under `details.visualAssertions`; they currently cover finite caret geometry, expected line text, expected active/inactive heading or paragraph classes, blank-line classes, and `white-space: break-spaces`. The legacy custom probes for `empty-type-one-space` and `heading-empty-paragraph-space` keep their existing visual caret and whitespace-line assertions.

| FishMark caseId | Command | Result | Evidence summary |
| --- | --- | --- | --- |
| `empty-type-hash` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"#"`; selection `{ anchor: 1, head: 1 }`; visual assertions passed for finite caret geometry and active heading line `"#"` with `cm-active-heading-depth-1`. |
| `empty-type-one-space` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-one-space'; npm.cmd run test:editing-experience` | pass | `actualContent` was `" "`; selection `{ anchor: 1, head: 1 }`; caret left delta was `3.859375`; active whitespace line had `cm-active-paragraph`. |
| `empty-type-three-spaces` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-three-spaces'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"   "`; selection `{ anchor: 3, head: 3 }`; visual assertions passed for finite caret geometry and active paragraph line preserving all three spaces. |
| `empty-spaces-enter-text` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"   \n\nabc"`; selection `{ anchor: 8, head: 8 }`; visual assertions passed for whitespace line, blank line, active `abc` paragraph, and finite caret geometry. |
| `paragraph-end-enter` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='paragraph-end-enter'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"Paragraph\n\n"`; selection `{ anchor: 11, head: 11 }`; visual assertions passed for inactive paragraph, inactive blank line, editable blank line, and finite caret geometry. |
| `paragraph-middle-enter` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='paragraph-middle-enter'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"Alpha\n\nBeta"`; selection `{ anchor: 7, head: 7 }`; visual assertions passed for inactive `Alpha`, inactive blank line, active `Beta`, and finite caret geometry. |
| `paragraph-start-enter` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"\n\nParagraph"`; selection `{ anchor: 2, head: 2 }`; visual assertions passed for leading blank editing surface and active `Paragraph` line. |
| `heading-end-enter` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='heading-end-enter'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"# Title\n\n"`; selection `{ anchor: 9, head: 9 }`; visual assertions passed for inactive heading, inactive blank line, editable blank line, and finite caret geometry. |
| `heading-end-repeated-enter` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | fail | FishMark produced `actualContent` `"# Title\n\n\n\n"` and selection `{ anchor: 11, head: 11 }`; oracle expected `"# Title\n\n\n\n\n\n"` and selection `{ anchor: 13, head: 13 }`. Visual assertions for the current rendered heading/blank surfaces passed, so the failure remains source/selection alignment. |
| `heading-empty-paragraph-space` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"# Title\n\n "`; selection `{ anchor: 10, head: 10 }`; caret left delta after inserting the space was `3.859375`. |
| `heading-empty-paragraph-backspace` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | pass | `actualContent` was `"# Title"`; selection `{ anchor: 7, head: 7 }`; visual assertions passed for active heading `"# Title"` and finite caret geometry. |
| `structural-blank-arrow-down` | `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | fail | Source stayed `"Paragraph one\n\nParagraph two"`, but FishMark selection was `{ anchor: 15, head: 15 }`; oracle expected selection `{ anchor: 28, head: 28 }` after crossing the structural blank line. Visual assertions for the current paragraph/blank/paragraph surfaces passed, so the failure remains selection alignment. |

Blocked matrix rows `whitespace-line-type-text`, `whitespace-line-enter`, `whitespace-line-backspace-inside`, and `structural-blank-backspace-at-next-block` remain blocked/pending mapping. They were not counted as FishMark pass rows.

## Verification Notes

RED/GREEN evidence for the code-bearing TASK-053 slice:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; npm.cmd run test:editing-experience
```

Before implementation this did not execute a stable `empty-type-hash` case result and timed out after 124 seconds while falling through the old runner. After implementation the same command exited `0` with `caseId: "empty-type-hash"`, `actualContent: "#"`, selection `{ anchor: 1, head: 1 }`, and `pass: true`.

RED/GREEN evidence for the visual assertion quality fix:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; $output = npm.cmd run test:editing-experience 2>&1; $text = $output -join "`n"; $start = $text.IndexOf('{'); if ($start -lt 0) { Write-Error 'Probe JSON not found'; exit 1 }; $json = $text.Substring($start) | ConvertFrom-Json; $visualAssertions = $json.cases[0].details.visualAssertions; if ($null -eq $visualAssertions -or $visualAssertions.Count -eq 0) { Write-Error 'RED: empty-type-hash has no visualAssertions'; exit 1 }; if (@($visualAssertions | Where-Object { -not $_.pass }).Count -gt 0) { Write-Error 'RED: visualAssertions contains failures'; exit 1 }; Write-Output 'visual assertions present and passing'
```

Before the fix this failed with `RED: empty-type-hash has no visualAssertions`. After the fix it exited `0` with `visual assertions present and passing`.

Commands run during this code-bearing TASK-053 slice:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-three-spaces'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='paragraph-end-enter'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-one-space'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='heading-end-enter'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='paragraph-middle-enter'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience
npm.cmd run typecheck
```

The `oracle-captured` group command exited `1` because the baseline intentionally reports two FishMark failures against oracle expectations.

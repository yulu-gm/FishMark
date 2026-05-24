# TASK-053 Typora Oracle Baseline Setup Handoff

Date: 2026-05-24
Task: TASK-053
Status: DEV_DONE

## What Changed

- Split the Typora-like editing alignment design into numbered backlog tasks:
  - TASK-053 Typora oracle and FishMark baseline
  - TASK-054 physical editing line model
  - TASK-055 physical-line decoration surfaces
  - TASK-056 line-first Enter / Backspace routing
  - TASK-057 selection normalization boundaries
  - TASK-058 alignment gate
- Added progress rows for TASK-053 through TASK-058.
- Created the TASK-053 intake file.
- Created the Typora oracle artifact protocol.
- Created the first oracle case matrix.
- Created the Phase 1 baseline report skeleton.
- Confirmed installed Typora version `1.13.4`.
- Captured 12 Typora oracle cases for empty-document, paragraph, heading, and structural ArrowDown behavior.
- Recorded 4 GUI automation blocked cases where caret placement did not land on the intended whitespace or structural blank source position.
- Ran existing FishMark named probes for `empty-document-space-caret` and `heading-enter-space-caret`.
- Added FishMark probe `caseId` output for all probe results.
- Added a named FishMark oracle case registry covering the first 12 captured case IDs:
  - `empty-type-hash`
  - `empty-type-one-space`
  - `empty-type-three-spaces`
  - `empty-spaces-enter-text`
  - `paragraph-end-enter`
  - `paragraph-middle-enter`
  - `paragraph-start-enter`
  - `heading-end-enter`
  - `heading-end-repeated-enter`
  - `heading-empty-paragraph-space`
  - `heading-empty-paragraph-backspace`
  - `structural-blank-arrow-down`
- Added `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=oracle-captured` support for the first mapped FishMark baseline batch.
- Published the FishMark baseline result in the Phase 1 report: 10 pass, 2 fail.
- Added mapped visual assertions to the generic oracle runner. For those cases, `pass` now requires source bytes, selection, finite caret geometry, expected line text, expected active/inactive heading or paragraph classes, blank-line classes, and `white-space: break-spaces`.
- Preserved the existing custom visual assertions for `empty-type-one-space` and `heading-empty-paragraph-space`.
- Second implementation-worker review rechecked the 4 blocked whitespace / structural cases against their matrix offsets, sentinel saved sources, screenshots, and `tmp/typora-oracle-*` scratch evidence. All 4 remain blocked because the evidence proves adjacent visible-text placement or lacks required visual proof.
- Closed TASK-053 as baseline setup only: the blocked rows are documented as failed capture evidence and remain excluded from oracle expectations and FishMark pass/fail scoring.

## Landing Files

- `MVP_BACKLOG.md`
- `docs/progress.md`
- `scripts/probe-markdown-editing-experience.mjs`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/plans/2026-05-24-task-053-typora-oracle-baseline-intake.md`
- `docs/plans/2026-05-24-task-053-typora-oracle-baseline-handoff.md`
- `docs/plans/typora-like-editor/README.md`
- `docs/plans/typora-like-editor/oracle/README.md`
- `docs/plans/typora-like-editor/oracle/case-matrix.json`
- `docs/plans/typora-like-editor/oracle/*.json`
- `docs/plans/typora-like-editor/oracle/*.md`
- `docs/plans/typora-like-editor/oracle/images/*.png`
- `docs/plans/typora-like-editor/2026-05-24-phase-1-baseline-report.md`

## Recommended Next Steps

1. Manually capture or improve GUI automation for the blocked whitespace / structural blank cases.
2. Treat the 4 blocked records as non-oracle evidence until manually confirmed.
3. Feed `heading-end-repeated-enter` and `structural-blank-arrow-down` into the TASK-054 through TASK-058 implementation plan as known FishMark-vs-oracle gaps.
4. Do not treat blocked whitespace-only rows as pass until they have reliable oracle and FishMark probe placement.

Second-worker blocked case results:

| Case | Status after review | Reason |
| --- | --- | --- |
| `whitespace-line-type-text` | blocked | Saved sentinel source and screenshot show typing landed in `After`, not on the whitespace-only line at matrix offset 10. |
| `whitespace-line-enter` | blocked | Failed click-test source shows Enter and sentinel landed after `A` in `After`; no screenshot exists and the failed run used a click-test sentinel. |
| `whitespace-line-backspace-inside` | blocked | Saved sentinel source and screenshot show Backspace/sentinel evidence in `After`, not inside the whitespace-only line at matrix offset 9. |
| `structural-blank-backspace-at-next-block` | blocked | Saved sentinel source and screenshot show Backspace started after the first `P` of `Paragraph two`, not at next-block-start offset 15. |

## Recommended Verification

Already run in this TASK-053 code-bearing slice:

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

The `oracle-captured` group command exited `1` by design because it reports the current FishMark baseline failures for `heading-end-repeated-enter` and `structural-blank-arrow-down`.

Quality-fix RED/GREEN:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; $output = npm.cmd run test:editing-experience 2>&1; $text = $output -join "`n"; $start = $text.IndexOf('{'); if ($start -lt 0) { Write-Error 'Probe JSON not found'; exit 1 }; $json = $text.Substring($start) | ConvertFrom-Json; $visualAssertions = $json.cases[0].details.visualAssertions; if ($null -eq $visualAssertions -or $visualAssertions.Count -eq 0) { Write-Error 'RED: empty-type-hash has no visualAssertions'; exit 1 }; if (@($visualAssertions | Where-Object { -not $_.pass }).Count -gt 0) { Write-Error 'RED: visualAssertions contains failures'; exit 1 }; Write-Output 'visual assertions present and passing'
```

Before the quality fix this failed with `RED: empty-type-hash has no visualAssertions`; after the fix it exited `0`.

## Known Risks Or Notes

- Existing local changes already touch editor command/probe files. Continue preserving those changes.
- TASK-053 probe mapping and the first FishMark baseline evidence are now published.
- Worktree remains dirty with unrelated user/agent changes in editor-core, branding, packaging, tmp, and other files; this slice did not revert or edit those files.
- TASK-055 should replace the current whitespace-only materialization direction with physical editing line surfaces.
- Typora GUI automation can type and save reliably after explicit menu Save, but source-offset caret placement in rendered whitespace / structural blank cases was not reliable enough to produce oracle expectations.
- The baseline still has blocked rows for whitespace-only source-line placement and structural next-block Backspace; they were not counted as passing FishMark cases.

## Manual Acceptance Draft

1. Open `MVP_BACKLOG.md` and confirm TASK-053 through TASK-058 exist under Typora-like editing alignment.
2. Open `docs/plans/typora-like-editor/oracle/case-matrix.json` and confirm P0 empty-document, heading, whitespace-line, and structural-blank cases have stable `caseId` values.
3. Run `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; npm.cmd run test:editing-experience` and confirm the output contains `caseId: "empty-type-hash"`.
4. Run `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` and confirm the output reports 12 cases, with failures limited to `heading-end-repeated-enter` and `structural-blank-arrow-down`.
5. Open `docs/plans/typora-like-editor/2026-05-24-phase-1-baseline-report.md` and confirm it lists the 12 FishMark caseId results plus blocked/pending rows.

# Phase 1 Typora-Like Alignment Gate Report

Date: 2026-05-24
Task: TASK-058
Status: DEV_DONE
Result: PASS for captured oracle rows; blocked rows remain not scored.

## Scope

This gate reruns the TASK-053 Phase 1 Typora oracle subset against FishMark after TASK-054 through TASK-057. It does not modify editor behavior and does not promote blocked Typora oracle rows without new Typora evidence.

Artifact:

- `.artifacts/test-runs/2026-05-24-task-058-oracle-captured-probe.json`

Command:

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience
```

Result: exit `0`, `pass: true`, `failures: []`.

## Gate Totals

| Bucket | Count | Result |
| --- | ---: | --- |
| Captured TASK-053 oracle rows | 12 | 12 PASS / 0 FAIL |
| Blocked oracle rows | 4 | Blocked / not scored |
| Pending capture rows | 0 | None |

The captured subset is aligned for the evidence currently covered by the probe: source bytes, selection offsets, visual assertions, and recorded action behavior. Undo granularity is not currently emitted by the TASK-053 oracle artifacts or FishMark probe output, so there were no available undo notes to score in this gate.

## Captured Case Results

| Case | Source | Selection | Visual evidence | Repeated/action evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `empty-type-hash` | PASS, `"#"` | PASS, `1/1` | PASS | Type action log captured | PASS |
| `empty-type-one-space` | PASS, `" "` | PASS, `1/1` | PASS, caret moved after space on editable whitespace surface | Custom space/caret action log captured | PASS |
| `empty-type-three-spaces` | PASS, `"   "` | PASS, `3/3` | PASS | Type action log captured | PASS |
| `empty-spaces-enter-text` | PASS, `"   \n\nabc"` | PASS, `8/8` | PASS | Type, Enter, type action log captured | PASS |
| `paragraph-end-enter` | PASS, `"Paragraph\n\n"` | PASS, `11/11` | PASS | Enter action log captured | PASS |
| `paragraph-middle-enter` | PASS, `"Alpha\n\nBeta"` | PASS, `7/7` | PASS | Enter action log captured | PASS |
| `paragraph-start-enter` | PASS, `"\n\nParagraph"` | PASS, `2/2` | PASS | Enter action log captured | PASS |
| `heading-end-enter` | PASS, `"# Title\n\n"` | PASS, `9/9` | PASS | Enter action log captured | PASS |
| `heading-end-repeated-enter` | PASS, `"# Title\n\n\n\n\n\n"` | PASS, `13/13` | PASS | Three Enter actions captured; repeated blank paragraphs match Typora oracle | PASS |
| `heading-empty-paragraph-space` | PASS, `"# Title\n\n "` | PASS, `10/10` | PASS, caret moved after inserted space on editable whitespace surface | Enter then space action log captured | PASS |
| `heading-empty-paragraph-backspace` | PASS, `"# Title"` | PASS, `7/7` | PASS | Enter then Backspace action log captured | PASS |
| `structural-blank-arrow-down` | PASS, `"Paragraph one\n\nParagraph two"` | PASS, `28/28` | PASS | ArrowDown action log captured; caret lands at next paragraph end | PASS |

## Blocked Rows

These rows remain blocked and are not counted in the 12-row PASS result. They must not be described as aligned until fresh Typora evidence proves the intended source offset and final state.

| Case | Status | Why blocked | Next capture step |
| --- | --- | --- | --- |
| `whitespace-line-type-text` | Blocked / not scored | Existing Typora evidence inserted text inside the visible `After` line, not on the whitespace-only source line. | Manually place the caret on the three-space source line, type `abc`, insert `FM_SENTINEL_WS_TYPE_TEXT`, save, and promote only if sentinel bytes remain on that whitespace line. |
| `whitespace-line-enter` | Blocked / not scored | Existing click-test evidence landed after `A` in `After` and did not use the matrix sentinel. | Capture with screenshot before Enter, then use `FM_SENTINEL_WS_ENTER`; promote only if source and screenshot prove the whitespace-line start. |
| `whitespace-line-backspace-inside` | Blocked / not scored | Existing Typora evidence landed in `After`, not inside the whitespace-only line. | Manually confirm caret inside the three-space source line before Backspace, then save sentinel evidence proving deletion and final caret stayed on that line. |
| `structural-blank-backspace-at-next-block` | Blocked / not scored | Existing Typora evidence started after the first visible character of `Paragraph two`, not at source offset 15. | Manually place the caret at the visual start of `Paragraph two`, screenshot before Backspace, then save sentinel evidence proving the action began at offset 15. |

## Regression Verification

| Command | Result |
| --- | --- |
| `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience` | PASS, 12 captured cases passed, exit `0` |
| `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts` | PASS, 4 files / 111 tests |
| `npm.cmd run test -- src/renderer/code-editor.test.ts` | PASS, 1 file / 189 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` | PASS |

## Conclusion

FishMark passes the Phase 1 captured Typora oracle gate for the 12 captured TASK-053 rows. The alignment claim is limited to those captured rows and to the evidence emitted by the probe. The 4 blocked whitespace / structural rows remain blocked, not scored, and not promoted.

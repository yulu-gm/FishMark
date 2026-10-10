# Independent review: integrated Search and progressive markers

Review date: 2026-10-10. Reviewer: independent GPT-6.1-sol, high reasoning. Outcome: no pending introduced P0/P1/P2 found within the reviewed scope; acceptance **BLOCKED** by the original gzip contract and unapproved Windows symlink skip. This is a local checkpoint review, not release acceptance or authorization to push.

## Scope and provenance

Reviewed the marker changes on `3e70e50374fd4e1038ce89ebd1a7e5f349a44349` with the staged Search merge from `a06790160b8b5d6cc0eceba1ba7c5322c26f8479`. The Search implementation and its budget consolidation were reviewed independently in earlier rounds; this review also checked their actual-window behavior in the merged build. The final local commit/tree is to be recorded in `.artifacts/markers-integrated-checkpoint.json` after the checkpoint is created.

Compared the final files against `.artifacts/markers-integrated-final-source.json`: all 30 recorded source/config/contract hashes matched at evidence review. This reviewer did not run builds or tests, edit production files, or change emitted artifacts. Only this review report was written; validation statements below come from inspected raw outputs.

## Source review

- CM and HTML export share list-line classes and local marker width. Width includes the task marker and reserves four columns per internal tab, excluding quote markers and ancestor indentation. Positive `max()` padding preserves the ordinary bullet, one/two-digit ordered and task gutters. Active, inactive and continuation lines use the same reservation. The old public source-prefix-offset variable retains its original values.
- Inactive list prefixes collapse both literal tabs and CM tab widgets. The checkbox override is restricted to inactive wide tasks and places its right edge one existing marker gap before the list body slot. Active raw source, ordinary tasks and the dedicated nested-heading gutter remain unchanged.
- Quoted paragraph/heading list continuations hide canonical indentation after the final quote marker. Quote markers and padding anchors remain in flow. The additional marks exclude code-fence owners, preserve body spaces after a quote inside a list, and do not cover label text. Export uses its existing projected quote boundary; distinct CRLF line-end behavior remains distinct.
- The shared horizontal-space scanner is equivalent to both removed loops. The guarded prefix-mark helper preserves the class, range and insertion order of list/quote decorations. The removed private blockquote flag/helper had no consumer. These changes introduce no second source index, cache, navigation normalization change, image-alt change, or grapheme implementation.
- Static visibility review found no stale-reveal path for an ordinary body selection: the end-exclusive marker range rejects body offsets, selection signatures include anchor/head, and same-line updates retain the affected root. This does not establish every possible user entry path.

## Inspected evidence

| Gate | Raw outcome |
| --- | --- |
| Build / typecheck / lint | PASS in `.artifacts/markers-integrated-final-{build,typecheck,lint}.log` |
| Related adapter/export/CSS suite | 261/261 PASS; controller/heading suite 317/319, with the two existing bare-marker failures. Overlapping counts are not added. |
| Official full regression | FAIL: 3276 passed, 10 exact known failures, one unexpected skipped symlink test, zero collection/hook/unhandled errors and zero unresolved baseline identities. |
| Official formal protocol | PASS: 121/121 cases, 2541 targets; 79 verified-existing, 2363 verified-runner, 99 known-defect observations, unexpected 0, not-run 0. |
| Original bundle contract | FAIL: total JS gzip 1,430,195 / 1,430,000, excess 195 bytes. Initial total 101,896 / 260,000; every other original budget/lazy/forbidden-source condition PASS. The bounded prefix consolidation saved 16 bytes from 1,430,211. |
| Actual-window markers | 176/176 PASS in `.artifacts/progressive-markers/integrated-final/result.json`. |
| Actual-window Search | 38/38 PASS in `.artifacts/search/integrated-final/result.json`. |

The unexpected full-suite item is `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence 0, state skipped. It remains unexpected; no waiver, allowlist change or system setting change resolves it. Bundle/config/minifier/license conditions were not relaxed.

The final marker probe measures only the label substring, waits for both the open and closing sidebar to disappear, and waits animation frames before geometry sampling. Its 900/1200px matrix covers long ordered, quote, nested, task and tab cases, source entry/exit and stable body positions. It records 14 English/Chinese body midpoint selections with collapsed DOM anchors inside labels, followed by Right movement; raw markers remain hidden. Four actual wide-checkbox gap assertions and both label-only continuation alignment assertions pass. Earlier continuation assertions that included leading spaces are invalid evidence and are not used for this conclusion.

Independently inspected `body-midpoint-orderedchecklong.png` and `body-midpoint-quotecontinuationlabel.png`: checkboxes sit near their bodies, quoted continuation text aligns with the first-line label, and the visible body caret does not expose raw task syntax. Independently inspected Search `far-table.png` and `last-page.png`: the far table cell is revealed/highlighted, result 7 is current, and result 1000 is reachable. The raw Search protocol also covers cold-import Escape cancellation, native button activation, focus retention, replacement/exact undo, document identity reset, bounded pagination and settings save/reopen/discard behavior.

## Limits and decision

The user's report that placing a caret in the body reveals raw list syntax is **unreproduced in this candidate's tested midpoint/Right paths**, not conclusively fixed. The exact Markdown and navigation/entry method are still awaited. No visibility rewrite is claimed to resolve that unconfirmed path.

Actual OS IME, arbitrary fonts/themes, per-frame animation, Typora comparison and packaged Explorer file association remain unmeasured. Existing known defects and the repeated native-probe MaxListenersExceededWarning remain recorded. Native checks do not override the failed full-suite or gzip gates.

The source review is complete with no pending introduced P0/P1/P2; the integrated candidate remains **BLOCKED**. Preserve it only as an unaccepted local checkpoint, with no push and no release/M9-completion claim.

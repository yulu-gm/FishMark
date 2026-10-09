# Independent review: user-input presentation entry

Date: 2026-10-09
Branch: codex/heading-progressive-input-20261009
Scope: onUserDocumentEdit transaction signal and shell auto-entry into editing; heading-decoration work excluded. Source review only; no product edits or large tests run by reviewer.

## Verdict

Final scoped review PASS: no blocking defect found in the reviewed auto-entry diff; final local evidence is verified below. The complete Windows gate remains FAIL solely for the existing symlink skip. This is not a native IME or M9 PASS.

## Boundary review

- An accepted document-changing transaction annotated as input or delete emits the presentation signal. Selection-only and unannotated updates do not. The signal itself does not rewrite content or selection.
- Internal document transactions clear pending composition intent and do not emit. The existing remote patch API carries that internal annotation. replaceDocument and canonical restore clear pending intent before setState.
- Undo and redo carry their own user-event names and are not classified as fresh input. Added tests assert undo/redo text round trips without an extra presentation signal.
- Provisional composition input captures a persistent document snapshot and waits for the adapter composition finish. If final text equals that snapshot, cancellation emits nothing. The existing adapter retains its active state until a deferred finish turn, including late native input after compositionend. Synthetic tests cover commit, cancellation and document replacement; they do not establish native Chinese IME behavior.
- Existing read-only transaction filtering runs before update observation, preventing blocked changes from producing a user-edit signal. The new image-paste annotation goes through that same dispatch/filter path.
- The shell requires an open document in reading mode and no settings transition. It switches only shell presentation and skips the focus-on-mode-change effect once; it does not focus, blur, replace the editor or alter the selection. Blurring afterwards does not revert mode.
- The classification intentionally includes all existing input.* semantic edits, including table commands and image paste; it is broader than printable keyboard body text. Those are accepted user document edits, not remote or load events.

## Evidence and remaining checks

Reviewed new controller tests for type/paste/Enter/backward-forward delete, undo/redo, selection, unannotated/internal updates, readOnly, synthetic composition commit/cancel, and replacement. Reviewed shell test for reading-to-editing, focus retention, blur persistence, explicit return, programmatic content changes and settings gating.

Current auto-entry-targeted.log reports 448 passed and two failed tests; keep their exact baseline classification rather than calling the entire raw run PASS. Current auto-entry-typecheck.log contains missing workspace-domain declarations and associated errors; the later build log reaches CLI completion, but a fresh successful typecheck is still required. Lint/build exit status and final regression evidence should be retained by the executing owner.

Before scoped behavior sign-off, inspect actual Electron input/paste/Enter/delete with content, selection and focus assertions; load/remote/undo exclusion; composition limitations; and final unchanged project gates. No heading changes were included in this review.

## Final evidence review

Verified .artifacts/auto-entry/real-product/result.json: 43/43 checks pass and no recorded error. Inspected the added probe assertions: real product Electron insertText covers first table/body insertion and undo/redo; sendInputEvent covers Enter, Backspace and arrow navigation; search input retains reading mode and search focus. Existing external-change and dirty-content checks remain present.

Evidence boundaries: insertText with Chinese characters is not native IME composition. Clipboard paste is covered by annotated transaction unit tests, not a real clipboard paste run. The probe's key helper explicitly focuses the window/webContents before key delivery, so these results do not independently prove OS foreground retention without assistance. Enter/Backspace assert mode change and preserved content prefix; they do not assert an exact final newline string. The table check named once asserts the resulting mode/text, not a counted callback frequency; callback counts are covered at the transaction unit level.

Verified auto-entry-regression.json: 3202 passed, 10 exact known failures, and one unexpected skipped symlink identity test; no observed or evaluation errors. The original full gate remains FAIL and its allowlist was not expanded. Verified auto-entry-formal.json: PASS, 121/121 cases, 2541 targets, zero unexpected and not-run. Verified auto-entry-bundle-final.log: all original contract checks PASS, total JS gzip 1429629 / 1430000 bytes (371 bytes remaining).

Inspected the successful typecheck rerun log auto-entry-typecheck-v2.log; the owner reports build, lint and rerun typecheck completed successfully. The earlier missing-artifact typecheck and targeted known failures remain retained history rather than being relabeled as successful raw runs.

Recommendation: deliver this auto-entry behavior as its own local checkpoint. Heading progressive display remains explicitly unfinished and outside this review. No push, no additional large tests, and no product-code changes were performed by this reviewer.

# Bounded assessment: reusing rich font marks in editable table cells

Date: 2026-10-08. Outcome: **no existing safe small-fix path found**. Assessment only; no new editing/font architecture, no tab-behavior change.

## Restoration

Commit `7ac968e90477071b4a9b02735660aded38d07124` explicitly withdraws the four product/test files introduced or modified for font alias candidate `6e01b0e`. It restores `useThemePresentation.ts` and `markdown-render.css` from the pre-candidate state and deletes the alias runtime and its tests. `git diff 53d86ac -- src packages` is empty. This restores known baseline behavior, including its unresolved preview/edit font mismatch; it does not claim that bug is fixed. Candidate history, independent review, diagnostic scripts and ignored raw evidence remain intact. Frozen local main is still `53d86ac377e6a8610c45be8d8f8c6cde3c611b4b`.

## Existing mechanisms inspected

- `inline-decorations.ts:createCjkTextDecorations` derives CodeMirror mark ranges from the canonical inline AST. It recurses through prose/strong/emphasis/link, and explicitly excludes codeSpan and inlineMath. CSS retains the user's actual family list, allowing the browser's native family/weight/style selection.
- `table-widget.ts:buildInlinePreviewFragment/appendInlineNode` already builds nested prose/CJK marks, strong/emphasis spans and separate code-span elements. This can provide correct **initial** rich presentation. It also has preview marker visibility behavior, so copying the whole fragment into active mode is not a drop-in replacement for visible Markdown source.
- Active table cells deliberately use `buildPlainTextFragment`. `syncTableCellEditor` at the plain/input fast path updates only cached text when live DOM matches. It does not reparse/redecorate the contenteditable after each input, preserving the browser caret and history.
- `readEditableSelection` supports text offsets across nested nodes. That is reusable offset plumbing, not a styled insertion or history transaction system.
- Composition handlers defer commits while composing and avoid navigation keys during IME. No existing beforeinput owner or rich-span boundary reconciler was found in this widget. CodeMirror decorations manage CodeMirror-owned content; this widget's nested native contenteditable has a different input/history owner.

## Why entering with rich marks is insufficient

Initial spans could select real bold/italic faces, respect CSS fallback lists and separate existing code spans without guessing font names. However, native insertion at a CJK span's end may inherit its font for newly typed Latin. Editing backticks can create or remove code boundaries; deleting/replacing across marks and paste can merge or inherit styles. A fixed initial AST cannot stay semantically correct under those edits.

There is prior real evidence, not merely a hypothetical: TASK-UX-SEARCH-001 records initial font-span markup fixing geometry but appended `abc` inheriting the CJK font; post-input repartitioning then broke real Ctrl+Z/Y. Repeating that approach is excluded. Restoring a selection after DOM replacement does not restore native undo transactions or an OS composition session. Compositionend-only correction also fails to cover ordinary edits and provides no demonstrated history guarantee.

The withdrawn uniform Unicode FontFace cannot solve code-versus-prose context and discarded native styled face selection. Reintroducing it, guessing local Bold names, forcing one whole-cell family, or merely splitting spans before focus would not satisfy the accepted review counterexamples.

## Necessary scope and smallest next step

The missing scope is **context-aware table editing boundary maintenance integrated with the input/history owner**, not a new font catalog. Existing AST ranges and CSS font rules should remain the source of presentation truth.

The smallest next task is a bounded ownership design and isolated feasibility proof, before product integration: determine whether table editing can reuse the existing CodeMirror-managed source editing/decorations/history, or whether a native contenteditable transaction adapter is required. The latter would need explicit beforeinput/selection/composition/paste/history semantics and is a larger change; it is not present today. This assessment does not choose or implement either architecture.

A proof must first pass a single mixed prose/code cell: append Latin at a CJK boundary; insert/remove backticks; replace a selection crossing font/code boundaries; native undo/redo after each; repeat focus changes. Verify actual selected font faces for bold/italic and family lists, then native OS IME on an available supported control surface. Stop the proof at the first unpreserved contract rather than building a general editor. Only a successful proof should justify a separately scoped product change and independent review.

No further implementation expansion is authorized by this assessment result. Original font mismatch and layout jump remain open; layout product choice remains with the user. No system fonts/software/settings/user files were changed, and nothing was pushed.

## Restoration validation

- Fresh build, typecheck and lint PASS. Logs: `.artifacts/table-transition/revert-{build,types,lint}.log`.
- Two focused table files: 8/8 tests PASS (`revert-tests.log`).
- Real Electron baseline transition matrix: 11/11 valid mode transitions. Both mixed widths retain insertion undo/redo, native four-character selection replacement undo/redo, and three repeat-entry text checks. Raw `.artifacts/table-transition/reverted-safe/` includes screenshots and platform fonts.
- All 11 font-geometry checks intentionally remain false: the old font mismatch is restored and still open. The diagnostic process exits 0 for baseline acquisition/mode validity when `FISHMARK_EXPECT_FONT_STABLE` is absent; it is **not** a font-fix pass. Mixed repeat-entry glyph delta is again 3px, active Chinese Noto Sans SC.
- Full regression and budget were not repeated: production `src` and `packages` are byte-for-byte identical to frozen53d86ac and its known Windows gate limitation remains. No claim of new gate acceptance. Native OS IME remains unmeasured.

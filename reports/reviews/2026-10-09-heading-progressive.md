# Independent review — progressive heading markers (2026-10-09)

Scope: uncommitted heading changes on `codex/heading-progressive-input-20261009` from a19e839. Read-only source/evidence review by an agent not involved in implementation. No production edits, rebuild, large tests, system changes or push.

## Verdict

**Initial review: CHANGES_REQUESTED; superseded by the bounded re-review below.** The 95 passing prototype assertions support the tested ATX interactions; they do not establish all requested heading boundaries or native IME acceptance.

### P2 — Setext heading text beginning with hashes is treated as an opening marker

`packages/codemirror-adapter/src/decorations/signature.ts:23` checks only whether the first `depth` characters are hashes. A valid Setext heading such as `#Title\n======` has depth 1 but no ATX prefix: this guard still returns marker end 1. New `headingMarkerAt` then treats source offset 0..1 as heading syntax, so Backspace at offset 1 can be consumed as reveal-only instead of deleting title text, and progressive-arrow behavior is applied to ordinary text. This is a source-derived counterexample, not a completed real-window reproduction.

Existing canonical parser tests explicitly distinguish ATX marker metadata from Setext (`full-document-parser.test.ts`, “records heading content, depth, and marker spans”: Setext `markers=[]`). Minimum remedy: use valid canonical heading-marker metadata where available, and make any legacy range helper validate a complete ATX opening prefix (including what follows the hashes), rather than a hashes-only prefix. Add `#Title\n======` / `##Title\n------` counterexamples and ordinary Setext control. Keep Setext text unchanged and ordinary navigation/deletion available.

### Verification blocker — hanging syntax bounds are unmeasured

`.cm-active-heading-marker` is absolutely positioned and translated left by its full width. Existing `.cm-scroller` clips via overflow:auto. The prototype tests caret coordinates but not marker visibility against the scrollport or nested-container prefix geometry. A 1200px fixture with body margin 80 does not establish narrow-product-window behavior. Long legal ATX padding or H6 hashes can extend farther left than available space, even when the title/caret delta is exactly zero.

This is a concrete untested geometry condition, not yet a claimed reproduced clipping defect. Before accepting the hanging design, measure marker bounds and screenshots for narrow-window H6, a long legal marker-padding sample, and nested quote/list prefixes. Preserve all editable hashes and avoid overlap with the parent's own prefix. One bounded counterexample pass is sufficient; do not repeat the entire large matrix merely for this question.

## Inspected evidence and positive findings

`.artifacts/heading-markers/prototype-empty-caret/result.json` contains 95 true checks. Inspected probe assertions: H1–H6, empty hash-only, empty-with-padding, one quote and one list case cover hidden visible-start placement, Left into prefix, Right back, first Backspace reveal with unchanged source/zero undo depth, second Backspace source deletion, CM undo/redo, reading-to-editing reveal, plus one cross-root forward/reversed selection and leave-prefix case. Reveal checks compare both caret x and top with 0.2px tolerance. These are real Electron inputs through the existing product controller in a diagnostic page, not a full application shell test.

- Source mode bypasses custom heading arrows/Backspace; readOnly bypasses reveal Backspace. These branches are inspected but absent from the 95-assertion real matrix.
- Presentation changes carry `Transaction.addToHistory(false)`; the reveal operation does not change canonical source. The controller callback makes the reading-to-editing intent available to the app. Actual full-shell callback/layout behavior still needs owner validation.
- Both semantic-container and legacy heading decoration paths call the shared marker helper. Selection-scoped refresh expands affected roots across previous and next nonempty selections, which addresses prefixes away from the active head. The real matrix checks one forward/reversed cross-root selection; multi-root headings and nested combinations remain narrower coverage gaps.
- The empty-heading caret anchor is a CodeMirror `WidgetType`, `side:1`, with an aria-hidden zero-width character. It is not inserted into `state.doc`. The empty-case saved evidence shows unchanged canonical source and expected CM undo/redo, supporting that limited contract. Clipboard/plain-text export, native selection at the widget and actual IME around it were not independently tested. Do not call CodeMirror history browser native history.
- The custom key handlers decline while composition state is active. The update listener defers derived decoration refresh during composition and flushes after completion. This reuses the existing input owner; it does not add an input-time DOM rebuilding loop. Synthetic composition and native OS IME are not covered by the saved 95 checks, so “no DOM reconstruction throughout real IME” remains unverified.
- Initial inline-marker geometry regressions were rejected; the hanging evidence replaces them for its covered cases only. Existing ten-known-failure allowance is unchanged according to task scope; this review does not approve altering that list.

## Remaining acceptance limits

Tests are still being updated for the approved behavior; no final build/lint/typecheck/full/formal gate results were reviewed in this stage. Cross-platform typography, native Windows IME, source/readOnly real-key behavior, marker-bound clipping and broader nested prefixes are not certified by this report. No product change or final acceptance is implied by the partial matrix.

## Bounded re-review after canonical-marker and approved gutter changes

**Current code-review verdict: PASS for the reviewed heading changes and measured boundaries; release/whole-task acceptance is not granted.** The prior Setext P2 and clipping-verification blocker are resolved for the approved design and tested cases. No additional actionable correctness finding was identified in this limited re-review.

- `headingMarkerAt` now gets the canonical node's `heading` marker instead of inferring it from leading hashes. Setext has no such marker. Both decoration paths and keyboard handling use the same helper and the exact qualification `/^#{1,6} ?$/u`. Long whitespace and tab prefixes bypass progressive hiding/keyboard interception and start as source-visible text, matching the user's explicit choice.
- `editor-source.css` now reserves at least 6rem in the document gutter. Nested heading containers reserve their own 6rem via the shared marker-class qualification. This is a deliberate approved width tradeoff, not the earlier unbounded hanging-only prototype. Long prefix fallback does not receive a hidden marker decoration.
- Verified `bounded-gutter/result.json`: 105/105 true checks. Verified the now-completed `native-hit-final/result.json`: **178/178 true checks, no recorded error**. Its Setext ordinary deletion, narrow H6 containment, two-space/tab/40-space fallback deletion, preserved-prefix reading transition, 12 root/quote/list/quote-list layout variants across narrow/zoom/larger-root-font configurations, source/readOnly key behavior, selection replacement/undo and exact native mouse hits at all seven H6 prefix offsets pass.
- Reviewed the current probe assertions, not just the totals. The layout checks verify marker bounds inside the scroller, stable caret x/top, no horizontal overflow, and no collision with parent rail/list markers. Inspected saved `native-hit-final/layout-4.png` and `layout-12.png`; both quote-list H6 examples show all six hashes without crossing the parent rail/bullet. This establishes the sampled configurations, not arbitrary user font metrics or unlimited nesting.
- `expanded-layout-v2` retained 170 passing checks and its final source-mode focus failure. Its failed record has editor and DOM selection disagreement. The final probe restores controller focus and source selection before key delivery; the retained final source check passes. The earlier run is not deleted or counted as a product source-mode pass. `canonical-narrow` remains the rejected clipping evidence.
- Empty-heading widget source/history conclusions from the first review remain limited to the measured CM operations. Native OS IME is still unmeasured; synthetic composition/source inspection must not be upgraded into native IME certification. The history tested here is CodeMirror history with Electron input, not browser native undo history.

The implementation owner reports bundle gzip **1430594 / 1430000**, over by **594 bytes**. No allowance change is approved by this review. Full build/lint/typecheck/regression/formal evidence is still being prepared and was not rerun here. Report those gates separately and retain failure rather than turning this bounded code-review PASS into a release claim. No product edits, new tests, push, system change or allowlist edit were performed by this reviewer.

## Full-product shell geometry review and preview boundary

Independent read-only review of heading-shell-final/result.json and failed.png confirms a product-level acceptance failure outside the controller marker matrix: first reading-mode heading Backspace reveals the prefix and enters editing, but the line top changes from 56 to 109 (+53px). Its x, width and height stay identical. The CSS cause is the reading-mode workspace collapsing three tracks to one and moving tabs/canvas to row 1. The controller's 178/178 marker checks do not establish full-shell UX acceptance.

Verified heading-shell-stable-preview/result.json: 42/42 checks pass, no error; the heading top is 109 before and after reveal, with identical remaining bounds. Subsequent prefix-space deletion, exact-source undo and F11 hidden-prefix checks pass. This run uses ignored .artifacts/electron-heading-stable-preview.cjs, which injects a style element at runtime. It restores three tracks, tab row 2/max-height 44px and canvas row 3. It is a design preview, not production CSS or a final product gate. The failing original product evidence remains authoritative for the unchanged product layout.

Minimal implementation advice, conditional on the pending user preference: preserve the existing auto/auto/minmax tracks and gap in reading-with-document mode, including the app-owned important override; keep tabs in row 2 and canvas in row 3; retain the original tab intrinsic height and remove only its reading-mode height collapse. Hide collapsed tabs with visibility:hidden as well as opacity/pointer-events so invisible controls cannot receive sequential keyboard focus. Keep status UI hidden. Scope geometry changes to has-document=true to protect the welcome page; reuse theme spacing variables and app-owned row precedence rather than adding a hard-coded 53px offset or JavaScript.

Two preview limitations remain explicit: it does not add visibility:hidden or test keyboard traversal of hidden tabs, and it does not preserve editing-mode bottom padding/canvas height. Bottom-of-document scroll position can therefore still change even when the heading top is stable. A final implementation should decide and validate bottom-space stability, plus conflict-banner row 1, narrow/multiple-tab layout, theme overrides and no-document layout.

Current combined status: scoped marker code review PASS remains valid, but complete product UX acceptance is FAIL/pending. User approval of the vertical whitespace tradeoff is still pending. No production changes, push, or new test runs were performed by this reviewer; only this review addendum was written.

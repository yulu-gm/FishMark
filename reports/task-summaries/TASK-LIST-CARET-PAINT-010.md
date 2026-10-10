# TASK-LIST-CARET-PAINT-010 — partial list-start native caret repair

## Outcome

Local candidate only; no push and no M9/release acceptance. The ordinary list-body start now paints a native caret without revealing source or shifting the body. A remaining bold-first-item defect is retained as a failed acceptance case.

Starting checkpoint: `8505074869c68554ddbc818fbaaffff6b72ff93c` (table native history remains separate). Fresh `git fetch origin main` returned `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. This phase changes no heading rules; the user's fixed gutter and always-source-visible overlong whitespace/tab prefix choice remains in force.

## Change and evidence

Only the final hidden padding between a list/task marker and the canonical first-line body receives `data-list-padding-anchor`. Its source range and original class remain unchanged. A scoped CSS rule retains native font height but gives the hidden padding zero horizontal space; negative word spacing prevents the native caret from landing over the first glyph. Quoted prefixes, nested indentation, selection/keymaps/history/composition, parsers and canonical Markdown are unchanged.

The controlled renderer uses the public product editor controller and CSS inside an actual visible Electron BrowserWindow on YULUSTATION. Georgia18, DPR1, 900×810 outer window, 860×740 editor fixture; Chromium146/Electron41.2. The diagnostic changes only the caret colour to red for unambiguous pixel counting. Each state has a capturePage PNG plus 12 client-screen frames at100ms. Client capture checks that the exact owned Electron HWND remains foreground before every frame. Native Electron keyboard/mouse events and DOM/canonical selection/scroll/rectangles are recorded. These are Electron trusted events, not physical OS IME input or a packaged-product UI claim.

Primary same-protocol comparison: `10-official-main` versus `11-final-candidate`, each in fresh isolated userData. All six list-relevant modules match official main after LF normalization in baseline; only CSS and block decorations differ in candidate. All six runner source hashes are identical between the pair. Full product checkout equivalence is not claimed: previously saved table history and phase diagnostics remain present. The baseline wrapper restores candidate file bytes in finally and verifies equality.

- Official main:15/46 pixel checks PASS,31 FAIL. Candidate:46/46 PASS. Six categories cover ordinary, ordered, task, nested, quoted and quoted-nested lists; routes cover Left to body start, Home, Left source-padding reveal, Right collapse, Shift selection collapse, native click, source-mode Home, plus paragraph positive control and insertion/native Ctrl+Z/Ctrl+Y.
- Every accepted candidate state paints a full21px native caret. Navigation preserves canonical source; undo restores the original fixture and redo restores the inserted fixture. The earlier03/07 comparison has exactly identical DOM Range and line rectangles for all13 corresponding states; body coordinates and line height remain stable.
- Extra fixture09:20/25 PASS; same-fixture official main12:9/25 PASS. Multiple-space and tab prefixes each pass all7 candidate routes. Bold-first item FAILS the same five routes in both main and candidate: Left/Home/body-start source collapse/selection collapse/click. Its immediately preceding `.cm-inactive-inline-marker` remains zero-font; it is not covered by this padding-only candidate. Source reveal and source mode pass. Raw09/12 results retain the failed cases; this is a pre-existing defect left unresolved.

Failed acquisition/experiments are retained, not reclassified:01 sent invalid Electron `ArrowLeft` key names and its PowerShell file execution was blocked;02 corrects `Left` but uses single frames;03 establishes the full blink-cycle baseline;04 has0 samples because the diagnostic URL query was not routed;05 restores caret height but shifts paint2.81px into the body and is rejected;06 verifies zero advance before the product rule is introduced in07. Primary10/11 have complete source snapshots and no trial CSS injection. No execution policy was changed; subsequent capture executes owned read-only code directly.

## Verification and limits

- Required build, repository typecheck and lint PASS.94 block-decoration tests PASS, including9 new anchor-range cases. Counts overlap with full regression and are not added.
- Strict unfiltered Windows regression FAIL:3298 PASS,10 exact-known failures,1 unexpected skip,0 collection/hook/unhandled errors. Unexpected identity is `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence0, skipped. No allowlist or system/Developer Mode change.
- Existing bundle contract PASS:totalJsGzipBytes1430381/1500000; initial101849/260000. This is the public-main contract, not the frozen cloud cp16 experiment. Its1431588/1431000 failure remains separate.
- Independent read-only reviewer verified the pixels, source stability and narrow implementation; found no newly introduced P0/P1/P2. It explicitly retains the bold-first failure and failed full gate. Review is saved in `reports/reviews/2026-10-10-list-caret-paint.md`.
- Initial diagnostic-only TypeScript config failed by replacing the renderer include set and pulling tests into a Vite-only type environment. Corrected non-composite, single-entry config with existing node/Vite types passes. Both raw logs/configs remain; no product tsconfig modification.

Unmeasured: canonical continuation/empty list items, other fonts/themes/DPRs, OS IME, packaged Explorer association and native packaged-product caret pixels. The bold-first list issue is measured FAIL, not unmeasured. Table viewport diagnosis remains separate: two earlier acquisition failures are retained under `.artifacts/table-viewport-20261010`; no table-scroll product change is part of this checkpoint. Table history checkpoint8505074 is not withdrawn or merged into these acceptance claims.

Raw material: `.artifacts/list-caret-20261010/`; durable archive/manifest/patch: `reports/experiments/list-caret-paint-20261010/`. Raw userData/cache profiles are excluded from the archive. Old-machine paths, unavailable Library access, frozen cp13/cp16, RF902/903 and M10 are untouched.

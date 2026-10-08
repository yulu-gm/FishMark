# TASK-UX-TABLE-001 — yuluStation geometry diagnosis

Date: 2026-10-08. Status: diagnosis checkpoint only; product fixes NOT implemented or accepted.

Frozen local main: `53d86ac377e6a8610c45be8d8f8c6cde3c611b4b`. This independent branch changes only diagnostic scripts and documentation. No push; M9 and cp13/cp16 remain unchanged. Remote main was last verified as `dfcfe36b1e067d049c34d095fe828fb26c964fcd` during the preceding window task; this table slice did not refresh that claim.

## Protocol and observations

Actual built FishMark Electron 41.2.0 / Chromium 146 on yuluStation, Windows 11 Enterprise 26200, i7-13700K, RTX 4070, DPR 1. Isolated userData, Georgia + Microsoft YaHei, 18px, light theme. Four reconstructed Markdown fixtures (short Chinese, mixed Latin/Chinese, saturated prose/unbroken text, scrolled document), at window widths 1200 and 900. These are reproducible diagnostic samples, not the missing old-machine original fixtures. Mouse input enters the real contenteditable; CDP platform-font inspection and DOM Range geometry accompany before/after screenshots and frame samples.

All eight baseline transitions were valid. Every one measured table top +53px, scroller top +53px, scrollTop delta 0, table document-coordinate delta 0, table and cell height delta 0. Columns did not change. The scrolled samples likewise retain scrollTop. This identifies shell layout as the source of this reproduced displacement, rather than table auto-sizing or scroll anchoring.

In the short 1200 sample: reading canvas/scroller top 16, editing top 69; table top 121.5 -> 174.5. Reading workspace has a single 753px row. Editing rows are 0px / 21px / 650px with two 16px gaps: 21 + 32 = 53. The tab strip is 37px tall with -16px top margin. Bottom padding separately changes 16 -> 66px, accounting for the additional 50px viewport-height reduction (753 -> 650). Table toolbar sits in the left rail, outside the document layout; it does not introduce the 53px row.

A diagnostic-only CSS counterfactual reserves the existing editing rows/tab footprint in reading mode. After correcting CSS precedence, its short-1200 real-window sample measures **all six deltas 0**, including table/scroller tops. This supports a bounded layout change; it does not constitute a product fix.

Chinese platform font is Microsoft YaHei in preview and Noto Sans SC in active plain text. Mixed Latin stays Georgia. Short sample glyph Range height is 24 -> 21px, width remains 18px; relative glyph top inside cell moves 14 -> 16px. Thus this machine reproduces a **3px glyph-box change**, not the old machine's ~1px observation. Cell height remains 53.296875px. Range height measures the browser glyph box, not ink or nominal CSS font-size. Both modes still report 18px CSS font-size and 33.3px computed line-height. The canonical table 1.55 line-height target differs from this measured inherited 1.85; record separately, do not silently retune it in a font fix.

Root code: `syncTableCellEditor` in `packages/codemirror-adapter/src/decorations/table-widget.ts` builds preview CJK spans but active plain content lacks them. `.cm-fishmark-cjk-font` selects the configured CJK face only in preview. Active text inherits Georgia and uses OS fallback for Han. Adding/resplitting spans during input is excluded: the previous experiment broke native undo and let new Latin inherit the CJK face.

The mixed samples at both widths passed actual insertText X, Ctrl+Z restoring original text, Ctrl+Y restoring typed text. This verifies the unchanged baseline path only. Native IME, multi-cell selection, candidate-font behavior and all alternate fonts are NOT tested.

## Bounded proposal for parent product decision

1. Prefer a stable document viewport origin across reading/editing by reserving the current tab footprint. Counterfactual proves zero displacement for one sample. Tradeoff: reading loses 53px of reclaimed upper space. Preserve opacity/pointer behavior and keep this solely in existing shell CSS. Overlaying tabs is another product choice, but needs occlusion and hit-testing decisions. Avoid scroll compensation: it cannot preserve the top-of-document position without new overscroll space and can interfere with selection scrolling.
2. Keep active contenteditable DOM plain. Investigate a font-layer-only composite face with Unicode ranges matching the existing CJK contract and local configured fonts. This is a proposal, NOT a validated implementation. It needs proof for local face loading, Han/fullwidth punctuation, Latin, preference updates, fallback and all supported platforms before adoption. A simple whole-cell CJK font changes Latin metrics and is not an equivalent fix. Do not repeat input-time DOM reconstruction.
3. Keep current capped column weighting unchanged. The saturated fixture's prose and unbroken columns both reach the cap; different row height/wrapping does not establish an incorrect width algorithm. No supported Typora UI control is available, so no Typora comparison or equivalence claim was made.

## Evidence and validation

- Reproduce after building frozen main: `node scripts/probe-table-transition.mjs <new-run-id>`.
- `.artifacts/table-transition/baseline-53d86ac-v2/`: 8 valid baseline scenarios; each has fixture.md, result.json, before.png, after.png and process.log. Its reserve-tabs entry used ineffective CSS precedence and is **not** the successful counterfactual.
- `.artifacts/table-transition/reserve-tabs-v3/`: corrected reserve-tabs control, valid with zero displacement. Final script contains that corrected rule.
- `.artifacts/table-transition/baseline-53d86ac/`: initial acquisition failure (non-cloneable function return); retained, excluded from measurements.
- Focused ESLint PASS, `.artifacts/table-transition/lint.log`.
- The preceding frozen build is used; no product code was changed and full regression/build/typecheck were not rerun for this diagnosis. Existing Windows symlink EPERM gate remains unresolved; no allowlist/security changes.
- Raw artifacts remain local and ignored. This checkpoint is diagnosis/proposal complete, implementation and acceptance still open.

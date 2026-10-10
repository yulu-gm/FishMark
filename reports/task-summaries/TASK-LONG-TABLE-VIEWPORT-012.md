# TASK-LONG-TABLE-VIEWPORT-012 — measured failure, no accepted table change

This phase fulfills the requested first measurement of complex-table entry/scrolling in long documents. It does **not** fix the table viewport defect. Accepted product remains caret checkpoint `a4fb6020952da0ae887db9a4127088023f0d5c01`, tree `93c9e673e2a55127fcabdb70f394de56b530b8c1`, retaining native-history `8505074869c68554ddbc818fbaaffff6b72ff93c`, tree `b6d425c674246264b0a79064a2078159c48eeac2`. Final fetch still resolves official main `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. No push.

## Actual windows and failure

YULUSTATION built application (real main/preload/renderer, no product source transforms), fresh isolated profiles, Georgia18/Microsoft YaHei18, DPR1. Current-host i7-13700K, Windows11 Enterprise26200, Electron41.2/Chromium146; old9900X and Mac measurements are excluded. Four completed runs06–09 cover5000/20000 paragraphs ×900/1200px outer windows. Each document has top/middle/bottom eight-column tables with16 body rows, a long rich CJK/English cell, nested bold/link, long unbroken strings and wrapped cells. Each run records21 steps, before/after capturePage PNGs, trusted Electron mouse/key events, focus, caret Range, scroller/cell rectangles, canonical selection, rAF observations and delegated native focus/scroll/CM dispatch calls.

The public CodeMirror offset effect positions each canonical region only as fixture setup. It is not Search UI acceptance. Every first and repeated long-cell click starts with the cell's top150px inside the visible scroller; diagnostic setup repositions it before the repeated click. All24 such clicks fail: source cell remains active while the viewport jumps to the table's latter rows.

| Document / outer width | Top first/repeat | Middle first/repeat | Bottom first/repeat |
| --- | --- | --- | --- |
| 5k /900 | +13536/+13536px | +14234/+14234px | +14235/+14235px |
| 5k /1200 | +8008/+8008px | +8009/+8009px | +8009/+8009px |
| 20k /900 | +13536/+13536px | +14235/+14235px | +14235/+14235px |
| 20k /1200 | +8008/+8008px | +8008/+8009px | +8008/+8008px |

The subsequent Tab/Shift+Tab/Down/Up actions change the focus owner to the expected cell, but its target remains outside the viewport. These are measured visibility failures, not48 independent successful keyboard tests. DOM caret boxes are often zero or offscreen; those observations do not establish native caret pixel paint. Cell width/height and scroller top stay constant during the click; this does not justify a column-width rewrite or attribute the issue to the saved caret/history fixes.

04 passive trace pinpoints two writes on first click: scrollTop305→455.48 from app `viewport-reveal` aligning the entire6845.86px cell's leading edge, then→13841.20 from CodeMirror source-offset `scrollIntoView`. A candidate removed the offset flag only for mounted-cell selection-only plans, used valid cell caret boxes for element reveal and repaired lost preview selection.05 still failed: CM measure/height anchoring wrote14838.84, leaving the original cell offscreen. Its patch is preserved as `rejected-v1.patch`; `semantic-keypress.ts`, `extensions/markdown.ts` and `viewport-reveal.ts` were restored byte-for-byte to accepted HEAD and the application rebuilt. No table product modification is accepted.

03/04/05 Search acquisition remains incomplete. After table activation, the attempted Find button clicks hit `table-tool-button`, not the desired Search input; exact cause of that overlap/movement is not established. These isolated fixtures may be changed by the unintended table tool command. They are retained as acquisition failures, excluded from the four completed navigation-protocol baselines and never treated as Search passes. Earlier01 run-as-node and02 missing-Search-input acquisitions are likewise retained.

## Preserved combination and boundaries

Rebuilt accepted product, lint and strict full regression were verified. Full gate still FAIL:3313 PASS,10 exact known,1 unexpected symlink-permission skip,0 collection/hook/unhandled errors; no allowlist or system setting change. Caret acceptance remains opening53/53, ordinary46/46, extension25/25, narrow adjacency34/34 with independent review and unchanged geometry.

On the final accepted combination, four fresh basic history runs pass native47/47 twice and CM document57/57 twice. Two additional fresh extended native runs reproduce the original8505074 protocol and pass99/99 twice, including native selection replacement, two-cell edits, rich/CJK preview, paragraph roundtrips and empty-history frames. Canonical/DOM checks pass and no same-source frames are emitted. This explicitly retains8505074's full acceptance status; counts overlap and are not added to full regression. OS IME remains untested; CDP composition is not native IME evidence.

Independent read-only review confirms the failed table candidate was completely withdrawn and the four real-window failures are reportable. Evidence/analysis/source snapshots/failed patch are archived under `reports/experiments/long-table-viewport-20261010`, with logical paths and SHA256-addressed exact bytes; userData/cache profiles excluded. Raw `.artifacts/table-viewport-20261010` remains locally available. capturePage is an owned Electron window image, not a physical-screen/Typora/packaged-Explorer claim.

Remaining work: resolve both cell reveal and CodeMirror height-anchor ownership, then rerun this identical matrix and independently review the actual fix. Explicit offscreen-cell/column entry, paragraph exit, Outline open/close, short-document53px shell displacement, table typing/save/undo on these large fixtures, other fonts/DPR and Typora legal-install same-screen comparison are unmeasured in this phase. This is a local diagnosis checkpoint, not M9 completion. Frozen cp13/cp16 (cp16 gzip1431588/1431000 FAIL), Library403/missing materialization access, RF902/903 and M10 remain untouched.

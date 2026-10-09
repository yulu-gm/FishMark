# TASK-UX-WIDTH-001 — Body follows available window width

Local checkpoint on YULUSTATION, parent Outline checkpoint `586ad837cde68ccc128e8dd81004ae394e284d01`, published main `5c866ed1137623cfa703026c3be037ad661ec179`. No push. The approved fixed heading gutter and long whitespace/tab prefix source fallback are retained.

The editor content fills the available stage with symmetric `max(24px,6rem)` padding. The obsolete720px cap and ineffective inherited narrow-container override are removed. Opening/resizing a side panel naturally reflows prose; reading/editing at the same panel width preserves wrapping and vertical geometry. No width settings, column-weight changes, table DOM replacement or history changes were added.

The existing layout protocol now asserts adaptive width, inverse signed panel/column changes and mode invariance within each panel state. Its transition settling awaits finite browser animations rather than assuming eight frames cover220ms. Original tolerances remain unchanged.

| Validation | Result | Evidence |
| --- | --- | --- |
| Actual product900/1200/1600px, panel open/closed, reading/editing |36/36 PASS, including ordinary and narrow H6/quote/list marker containment, unchanged source and final long-code text visible | `.artifacts/adaptive-width/final-serial/result.json`, `final.png`; `.artifacts/adaptive-width-product.cjs` |
| Actual measured column, panel closed |558→848→1246px | Same JSON |
| Actual measured column, panel open |310→600→998px | Same JSON |
| Visible-window existing layout protocol |PASS, failures[]; panel248→200→360, column630→678→518 | `.artifacts/adaptive-width/layout.json`, `.artifacts/adaptive-width-layout-stable.log`; visible wrapper `.artifacts/adaptive-width-layout.{cjs,mjs}` |
| Build/typecheck/lint |PASS | `.artifacts/adaptive-width-{build,typecheck,lint}-final.log` |
| Related application contracts |162/162 PASS | `.artifacts/adaptive-width-app-tests.log` |
| Full Windows regression |FAIL:3221 pass,10 exact known failures,1 unexpected symlink skip,0 errors | `.artifacts/adaptive-width-full.log`, `.artifacts/adaptive-width-full.gate.json` |
| Formal source-provenance bundle contract |PASS,1429998/1430000 total JS gzip,2 bytes margin | `.artifacts/adaptive-width-bundle.log` |

## Explicit limitations and failed attempts

The70-column stress table fails cell containment:140 header/body inputs extend beyond their cells. Its container reports no horizontal overflow because the inner fixed-layout table clips. The diagnostic compared candidate CSS with the prior sole padding expression injected at runtime in the same actual product: at900px both columns558px and identical overflow; at1600px candidate1246px versus prior720px, both fail cell containment. This is evidence of a pre-existing table minimum-width/clipping problem, not an independently rebuilt baseline. It remains unresolved; container-fit checks must not be read as proof that all table contents are unclipped or horizontal scrolling works. No table column algorithm was rewritten without comparison evidence. Raw: `.artifacts/adaptive-width/table-diagnostic/result.json`, runner `.artifacts/adaptive-table-diagnostic.cjs`.

The hidden-window stock layout runner did not finish; the visible wrapper runs its exact exported protocol with background throttling disabled and a60s timeout. Initial visible sampling caught fractional intermediate transition widths; the corrected animation settlement passed. An earlier final product probe overlapped a clean build and failed readiness on a temporarily missing main module; the serial run after build passed. Earlier nested probes either deleted a quote via Home/Backspace or closed Outline with Escape; their raw failures are preserved and excluded from final assertions.

Windows symlink gate remains blocked without OS/security/allowlist changes or a publishing exception. Native Windows IME, physical Explorer double-click association, extra themes/DPR and actual extreme-table horizontal scrolling are unmeasured. This is a local width checkpoint, not M9/release completion.

Next authorized stages: progressive list/task/link/format markers; compact Search controls and results index. Search reference `libfile_07cb1a1592d48191a21bb99c14ee32db` was resolved with supported Library prepare_materialize, but the official fresh transfer returned HTTP403. No file/pixels were obtained; text requirements remain usable. Receipt `.artifacts/library-search-helper-20261009/receipt.json`. No alternate URL/service or cp16-access bypass was attempted. Frozen cp13/cp16 and the withdrawn table-font attempt remain separate.

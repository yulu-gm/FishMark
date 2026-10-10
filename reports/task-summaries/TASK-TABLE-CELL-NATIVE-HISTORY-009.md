# Preserve native table-cell history across preview and focus changes

The local candidate restores native cell undo/redo after focus changes, including commands whose native target is a currently inactive cell. It preserves the original editable nodes across inactive previews and returns those same nodes before the browser's history command runs. It also avoids document transactions and dirty notifications when history input leaves cell text unchanged. No editor reconstruction, undo shim, CM history unification, or RF901 optimization was introduced. Nothing was pushed; this is a candidate checkpoint, not M9 completion.

## Scope, cause evidence and behavior

Fixed published main: `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. Starting local checkpoint: `031acfa6bf4f8bf7037a62f90a6e75345508260e`. The only implementation change is `packages/codemirror-adapter/src/decorations/table-widget.ts`. Two test files and the existing three diagnostic scripts were updated. The three inherited performance/phase diagnostic files still differ from main, with phase timing OFF; the withdrawn performance candidate remains withdrawn.

The prior main diagnostic failed 43/47 twice after two focus roundtrips per process. `syncTableCellEditor` replaced active plain-text nodes with preview nodes and later created new plain nodes even when text was unchanged. A narrow initial candidate that parked and restored the original plain nodes made the exact same protocol pass 47/47, supporting node identity loss as the cause. Preview styling remains present while inactive, including rich inline/CJK styling. Parked state is transient view data, not an alternative Markdown or undo history.

A broader native test then found another trigger: after editing 1:0 and focusing 1:1, keydown targeted 1:1 but trusted native beforeinput/historyUndo targeted the last edited 1:0. Restoring nodes only on focus was insufficient (04: 98/99). The revision returns the target's original nodes in its history beforeinput listener, without preventing the event or changing the browser command. Reuse requires both the saved text and the actual parked nodes' current text to equal canonical cell text. Document-history changes invalidate stale parked content. A history operation that changes nothing restores the identical inactive preview nodes and skips updateCell, preserving source, CM depth and dirty frames.

First-edit whole-table canonical formatting remains unchanged and separately asserted against independently specified exact fixture bytes implementing TC-042's canonical-format requirement. Native cell inputs still flow through input.table-edit; CM document undo still restores original source bytes. The existing CM beforeinput history bridge remains unchanged. In particular, after paragraph input, a key starting in a cell can have native beforeinput target CM and undo the latest paragraph edit. Independent fresh main and candidate evidence showed the same source/focus/history behavior; this fix does not redefine that cross-host route or history granularity.

## Repeated actual-window results

All final runs used one fresh visible owned Electron window and fresh isolated userData. Same YULUSTATION conditions: Windows build 26200, i7-13700K / 24 logical CPUs, 34,088,263,680 bytes RAM, Electron 41.2 / Chrome 146, DPR 1, 1000×720 editor with measured monospace 16px / 29.6px. These are fixture conditions, not certification of every integrated application theme or font.

Final widget working-byte SHA-256: `1ed5826db1c80f3b71c23ecee2108dfc4c7aac80f48371b0af8ebe4dbeb92079`. Seven relevant modules were checked: this one explicit pinned candidate, six unchanged published modules. Product transforms were zero; three driver hashes were identical across the four final processes. Stable snapshots were independently checked for DOM/source-cell agreement.

| Fresh run | Path | Checks | Trusted Ctrl keydowns | Source change frames |
| --- | --- | --- | --- | --- |
| 07 | Native extended | 99/99 | 22 | 28, zero same-source |
| 08 | CM document | 57/57 | 10 | 11, zero same-source |
| 09 | Native extended | 99/99 | 22 | 28, zero same-source |
| 10 | CM document | 57/57 | 10 | 11, zero same-source |

Each native run covered the original three same-focus undo/redo cycles and two focus roundtrips, editing two different cells, selection replacement within text, rich/CJK preview and return, paragraph/table focus transitions, paragraph input's existing cross-host history route, inactive native-target undo/redo, and unchanged history input. The inactive-target undo changed Foxtrot back to E**中文**o; redo changed it back to Foxtrot. The existing updateCell path then refocused the modified cell 1:0. These are actual source/DOM changes, not passes after a failed undo. Unchanged-history input emits no onChange, source frame or document transaction and leaves CM depths stable.

Both CM runs used explicit CM focus before every key and a clean first cell-edit transaction with no prior native history inputs. Each restored all 65 original source bytes on undo and 71 canonical edited bytes on redo across repeated cycles/focus changes. These independent routes were not pooled or silently unified.

## Quality gates, failed evidence and limitations

Build, full typecheck, lint, extra diagnostic TypeScript check (zero diagnostics), Node syntax checks and whitespace checks passed. Related table tests passed 71/71; the 246 tests excluded by that filter were subsequently included in the full run. New unit cases cover plain/rich/CJK node identity across preview, document-change invalidation, mutable detached nodes, inactive native target preparation, unchanged rich preview preservation, and meaningful versus unchanged history inputs. The controller integration test verifies no change callback, no source frames, stable history depth and unchanged source/identity returned by the save barrier.

Strict full regression: **FAIL** — 3289 passed, 10 exact known failures, one unexpected symlink skip, zero collection/hook/unhandled errors. The exact skip remains `file identity resolver gives symlink aliases one physical identity when the platform permits symlinks`. No allowlist or system/security/Developer Mode setting was changed. This is not a full-regression PASS.

Renderer bundle contract passed: gzip **1,430,365 / 1,500,000** bytes. This published-main budget is separate from frozen cp16's 1,431,000 limit; no frozen experiment was modified or reclassified.

Initial and failed attempts are preserved: 02's two paragraph-oracle failures, 03's published-main control failures, 04's inactive-target failure, and 06's composition provenance failure. The paragraph oracle was corrected only after main/candidate source, focus and CM history evidence matched. The raw failures remain unchanged.

Composition safety has unit coverage for in-progress input suppression, one fallback commit, reuse and teardown, and history beforeinput explicitly excludes composition. A separate CDP experiment (06) reported **110/111**: intermediate source suppression, one final frame, Chinese committed text and native undo/redo worked, but the trusted start/end assertion failed because compositionend was **untrusted**. This failed provenance check is not counted as IME acceptance. CDP composition is an explicit optional probe, separated from final native/CM runs. Real OS IME remains **UNTESTED**; no OS input settings or user programs were changed.

Save/dirty verification covers the real controller's change-frame and save-barrier contract, not an actual packaged-app disk save/dialog. Packaged Explorer association, OS IME, native paint timing, Typora, themes and unusual fonts remain unmeasured. RF901's old failure/withdrawal, frozen cp13/cp16 and Library access remain unchanged; RF902/903 and M10 were not started.

Independent review checked candidate logic, mutable-node validation, native beforeinput scope, lifecycle/IME guards and raw route evidence. It found no concrete introduced P0/P1/P2 in the reviewed revision. Final repeated evidence and remaining gate limits are recorded in the review included with the archive.

## Deliverables

[candidate.patch](../experiments/table-cell-native-history-20261010/candidate.patch) contains this turn's implementation, tests and diagnostic changes against starting HEAD. [evidence.json.gz](../experiments/table-cell-native-history-20261010/evidence.json.gz) preserves exact raw reports, manifests, PNGs, stdout, test/build/type/lint/budget/full-gate logs, driver/candidate bytes and independent review; [evidence-index.json](../experiments/table-cell-native-history-20261010/evidence-index.json) lists hashes and lengths. The ten expanded runs remain in `.artifacts/table-cell-focus-fix-20261010/`; userData/cache is excluded from the archive. The previous diagnostic/RF901 archives were not edited.

The candidate is ready for bounded review of the demonstrated native-history fix. Strict Windows regression and genuine OS IME acceptance remain outstanding, so it is not ready to be declared fully accepted or pushed.

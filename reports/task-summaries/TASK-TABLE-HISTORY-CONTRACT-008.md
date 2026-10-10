# Table history routes — limited diagnostic on published main

Published main reproduces a native table-cell history failure after focus changes. CodeMirror document history restores the original Markdown bytes in a separately isolated route. No product code, history policy or optimization was changed; the RF901 experiment's original failure and withdrawal remain intact. Nothing was pushed. This is not M9 completion.

## Source and protocol

Product baseline: `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. The working checkpoint before this diagnostic was `5b6573b3ae2e68bc06c164e68275538f30bff4d0`. Seven relevant product modules were checked against that published baseline before each run, comparing LF-normalized bytes and recording raw/normalized SHA-256. All matched. Three pre-existing diagnostic files (`editor-runtime-performance-probe.ts`, `runtime-phase-timing.ts` and its test) still differ from published main; this is not a claim that the entire checkout is byte-identical. Phase timing was OFF and there were zero product transforms; the withdrawn RF901 candidate was not loaded.

Four fresh visible owned Electron processes ran in order native / document / native / document. Each had separate userData, one fresh editor, normal product controller and CSS, a 1200×900 BrowserWindow and a 1000×720 editor. The measured Windows environment was YULUSTATION, Windows build 26200, i7-13700K / 24 logical CPUs, 34,088,263,680 bytes RAM, Electron 41.2.0 / Chrome 146.0.7680.179, display 2560×1440 / 165Hz / DPR 1. The fixture's computed font was monospace 16px with 29.6px line height; this does not certify the integrated application's theme/font configuration. GPU status and exact process identities are in the raw reports.

Passive observers captured trusted keyboard/mouse/input events in capture and bubble phases, inputType, focus, cell text, full source, selections, CM transactions/history depths, and full document change frames. They neither prevented events nor reset history. One appendConfig observer was installed before the initial snapshot, whose history depth was zero.

Each process clicked Alpha, explicitly prepared its DOM text range, then used actual Electron native insertText to replace it with Delta. The explicit DOM range preparation is recorded; it is not claimed as a trusted keyboard selection. Three undo/redo cycles were followed by two native mouse focus roundtrips through Beta and back. Native commands stayed in cell `1:0`. Before **every** document-history key, the controller selected paragraph position 6 and focused CM content; snapshots proved this preparation preserved source and history depth. CM commands can refocus a table cell afterward, so this deliberate preparation is required to keep routes separate. Document runs never started with a native historyUndo/historyRedo transaction.

Each run recorded ten trusted keydown and ten trusted keyup events. All native keydowns targeted cell `1:0`; all document keydowns targeted CM content. Both focus roundtrips recorded trusted mouse events on the intended cells. Direct native insertText and event.isTrusted evidence do not establish OS IME behavior.

## Contract and exact fixture

[TC-042](../../docs/test-cases.md#tc-042) explicitly requires the first cell input to rewrite the table into canonical alignment. [The table decision](../../docs/decision-log.md) dated 2026-04-19 likewise routes cell edits through a whole-table canonical rewrite. `src/renderer/code-editor.test.ts` around line 8809 asserts the exact canonical result of a cell edit. The initial fixture below has LF endings and no final newline (65 ASCII bytes):

```markdown
Plain paragraph.

| Name | Value |
| --- | --- |
| Alpha | Beta |
```

The independently specified first-edit result is 71 bytes:

```markdown
Plain paragraph.

| Name  | Value |
| :---- | :---- |
| Delta | Beta  |
```

All four runs verified those complete bytes, so the first-edit canonical-format requirement of TC-042 passed. This is not a full TC-042 execution. Same-focus native undo restored Alpha while retaining this canonical padding/alignment. Document undo restored the entire original 65-byte source.

The existing native test in `scripts/electron-table-transition-main.cjs` around lines 105–113 asserts cell text restoration, not restoration of the original table's byte formatting. The published widget ignores CM event handling inside its contenteditable cell; its input handler commits native input, including historyUndo/historyRedo, through `input.table-edit`. CM document undo uses inverted document changes and is a different entry point. General natural-undo acceptance does not explicitly define byte-for-byte native-cell formatting restoration.

Therefore the old RF901 assertion that first cell edit preserves all unrelated table formatting conflicts with TC-042. Its later native Ctrl+Z assertion used a stricter original-byte oracle that the existing native test contract does not establish. Applying the CM byte oracle to that native route did not prove a candidate-introduced regression. This interpretation does **not** declare the old experiment a pass or decide the user's preferred future history policy.

## Results and limits

| Fresh run | Route | Checks | Result |
| --- | --- | --- | --- |
| 01 | Native cell | 43 / 47 | FAIL, exit 2 |
| 02 | CM document | 57 / 57 | PASS, exit 0 |
| 03 | Native cell | 43 / 47 | FAIL, exit 2 |
| 04 | CM document | 57 / 57 | PASS, exit 0 |

Each native run's three same-focus cycles successfully alternated Alpha / Delta with canonical source. Each trusted historyUndo/historyRedo input produced a new CM `input.table-edit` transaction rather than a CM undo/redo transaction; CM undo depth grew from 1 to 7 and redo depth remained zero.

After each focus roundtrip, trusted native historyUndo/historyRedo events still reached the live target cell, but its text and complete source stayed Delta. Each of the two undo attempts failed both the source and cell-text assertions (four failed checks per run). The following redo checks compare Delta with Delta, so their numerical passes do **not** establish working redo after a failed undo. Across the two fresh native processes, four failed undo attempts were reproduced.

Focus changes themselves left source/history unchanged. The four ineffective history commands then generated four same-source `input.table-edit` transactions **and four same-source document change frames**, increasing CM undo depth from 7 to 11. Each native run emitted eleven frames total. This supports an existing P2 focus/history stability defect and no-op history/frame pollution, beyond the formatting-oracle difference. DOM child replacement in `syncTableCellEditor` is a plausible cause, but this diagnostic does not prove that mechanism.

Document history passed all three cycles and both focus roundtrips in both fresh processes. Trusted keys reached CM, no DOM historyUndo/historyRedo input occurred, and ten document transactions were annotated undo/redo. Source alternated exactly 65 / 71 bytes and history alternated undo/redo depths 0/1 and 1/0. Eleven frames per run changed source; none were same-source. This proves the controlled CM route, not automatic user focus restoration or a unified native/CM history policy.

Independent read-only review verified the four reports, source/driver hashes, route ownership, passive observers, histories and failure interpretation. It found no introduced P0/P1/P2 in this diagnostic and identified the published native after-focus failure as P2. Build, diagnostic TypeScript checks, Node syntax checks and lint passed. The previous strict Windows full-regression failure from the unexpected symlink skip remains unresolved; no full regression was rerun for this scripts-only diagnostic and no allowance/system setting was changed.

## Corrected coverage and next bounded work

Future tests should explicitly separate the native cell route from CM document history. Cover first-edit canonical bytes independently; native cell text undo/redo over repeated cycles and real focus roundtrips; CM byte-exact undo/redo with verified focus ownership and clean starting history; and history/frame behavior when a native command leaves source unchanged. A failed undo must not let a subsequent unchanged redo count as semantic success. Selection preparation, trusted event provenance, source identity, and repeated fresh processes remain visible in evidence.

The focus-dependent text failure can be investigated against the established cell-text undo expectation without first redefining formatting policy. Unifying history ownership, granularity or original-byte restoration would require a separate product decision. No product fix was authorized or attempted in this limited diagnosis. The withdrawn RF901 candidate must remain withdrawn until a separately reviewed acceptance path is established.

Raw reports, source manifests, screenshots, stdout, analysis, validation logs, diagnostic script bytes and independent review are preserved in [evidence.json.gz](../experiments/table-history-contract-20261010/evidence.json.gz), with paths, lengths and SHA-256 in [evidence-index.json](../experiments/table-history-contract-20261010/evidence-index.json). Expanded originals remain in `.artifacts/table-history-contract-20261010/`; userData/cache is excluded from the archive. The original RF901 failure archive was not changed.

Unmeasured: packaged application/menu/Explorer association, OS IME, native paint timing, Typora, theme/font variations and integrated automatic focus behavior. Frozen cp13/cp16 and Library access were untouched; RF902/903 and M10 were not started.

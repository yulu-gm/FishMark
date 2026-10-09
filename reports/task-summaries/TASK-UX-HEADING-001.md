# TASK-UX-HEADING-001 — Progressive ATX heading markers

Local checkpoint on `codex/heading-progressive-input-20261009`, stacked on input-entry checkpoint `a19e839f71daac2da49777d13e2392a7cce05cc6`. Fresh fetch still identifies official main as `4575f048ca40c17b3ae6ad962f558b6053d4c096`, tree `2c2e6a6d2050a8ec61944f92b3661f2897eab78d`. No push. **This checkpoint does not pass whole-product acceptance.**

## Implemented boundary

Canonical ATX heading markers are hidden in reading. In editing they reveal only when the caret/selection enters the prefix or the first Backspace at its visible text start explicitly reveals it. That first Backspace leaves source, selection and CM history unchanged; the following deletion edits source normally. Left/Right, selection, undo/redo, empty headings, nested headings and source/readOnly guards use the existing controller. Setext text beginning with hashes is ordinary title text because qualification uses canonical marker metadata.

The user explicitly chose “固定留白＋超长前缀显示源码（推荐）”. The document reserves 6rem of persistent horizontal gutter, and nested headings reserve that gutter inside their parent container. Only canonical marker source matching `/^#{1,6} ?$/u` qualifies; long spaces/tabs remain visible source in both modes and receive ordinary deletion. This is the approved exception to reading marker hiding. The gutter is an explicit width tradeoff; arbitrary font metrics/nesting are not certified by the sampled geometry.

Presentation effects stay outside CM undo history. Empty headings use a CM zero-width caret widget without modifying `state.doc`. Composition handling and the existing input owner remain intact; no native editable DOM rewrite, new editor or font alias was introduced.

## Evidence on YULUSTATION

Environment is the existing machine-specific `.artifacts/hidden-window/environment.json`: Windows 11 Enterprise build26200, i7-13700K, RAM34088263680 bytes, RTX4070 plus virtual adapters, balanced power, Electron41.2.0/Chromium146, DPR1. Probe preferences use Georgia/Microsoft YaHei and isolated userData/files. No old-host performance numbers are combined with these checks.

| Gate | Result | Raw evidence |
| --- | --- | --- |
| Build / typecheck / lint | PASS, sequential build then typecheck | `.artifacts/heading-build-final.log`, `heading-typecheck-final.log`, `heading-lint-confirmed.log` |
| Related controller/decorations/view tests | 412 pass + 2 unchanged exact known failures | `.artifacts/heading-targeted-final.log` |
| Full Windows regression | **FAIL**: 3213 pass + 10 exact known failures + 1 unexpected symlink skip; zero collection/hook/unhandled errors | `.artifacts/heading-full-confirmed.log`, `heading-full-confirmed.gate.json` |
| Formal Electron protocol | PASS 121/121 cases, 2541 targets, unexpected0/not-run0 | `.artifacts/heading-formal-final.json`, `heading-formal-final.log` |
| Heading controller in actual Electron | PASS 178/178, nonzero exit on any failed check | `.artifacts/heading-markers/native-hit-final/result.json` and PNGs |
| Actual built product, without injected CSS | **FAIL** at check38: reading-to-editing heading reveal moves line top56→109 (+53px) | `.artifacts/heading-shell-final/result.json`, `failed.png` |
| Isolated layout preview, injected CSS only | PASS 42/42; reveal line top109→109, deletion/undo exact | `.artifacts/heading-shell-stable-preview/result.json`, `heading-reading.png`, `heading-revealed.png` |
| Original bundle contract | **FAIL**: gzip1430594 /1430000, over594 bytes; other contracts pass | `.artifacts/heading-bundle.log` |
| Independent review | Marker code and sampled bounds PASS; whole UX acceptance still blocked | `reports/reviews/2026-10-09-heading-progressive.md` |

The 178 checks include H1–H6, empty hash-only/padded headings, quote/list fixtures, exact native caret/selection, first reveal/no history, next deletion, CM undo/redo, Setext ordinary deletion, long-prefix fallback, native source/readOnly input and mouse hits at all seven H6 prefix positions. The 12 layout combinations cover root/quote/list/quote-list at narrow550px, zoom1.25, and larger root font24px. Actual marker/scroller bounds, no horizontal overflow, no rail/bullet overlap and caret x/top invariance are asserted. Screenshots were inspected. These are actual Electron inputs through the existing product controller in a diagnostic page, not full-shell acceptance or native OS IME.

## Retained failures and limitations

- The original inline prototype moved the caret by20.8–70.8px; it was rejected. `canonical-narrow` later reproduced H6 clipping at marker.left=-41.109375. Both raw runs remain. `bounded-gutter` then passed105/105.
- `expanded-layout-v2` had170 passing checks then a source-key focus mismatch (CM2, DOM7). `native-hit-final` establishes focus/selection after re-enabling the editor and passes the retained source case. The initial run is not counted as a product source pass.
- The first full run retained three unexpected failures in addition to the symlink skip: two assertions for the superseded heading/CSS behavior and an export wait timeout. After synchronizing those two assertions and rerunning without the overlapping clean build, the export case passed and only the original symlink skip remained. `.artifacts/heading-full-first.gate.json` and `heading-full-final.log` retain the first run; no allowlist was expanded.
- The full product's +53px movement comes from its pre-existing reading grid collapsing the tab-strip row. It remains in current product code. A runtime-only preview keeps the rows/tab space and proves the candidate direction, but the user's separate vertical-space choice is pending. The preview is not shipped or counted as current product acceptance; hidden keyboard focus and document-end scrolling still need checks if this layout is adopted.
- Native Windows IME and OS clipboard at the empty widget are **UNMEASURED**. Synthetic composition coverage does not establish native IME safety. Tested heading history is CM history; it is not browser-native table history.
- The original gzip budget is unchanged. This candidate adds965 compressed JS bytes relative to the input-entry checkpoint, which had371 bytes of remaining budget. The shared marker/decorations implementation is retained as a reviewable checkpoint; no unrelated bundle or vendor change was made to mask the excess.
- Codex failed to open the preview PNG in its panel; files and real Electron screenshots are saved locally. No claim of native desktop automation capability is made.

Table fonts remain unresolved, Typora is not installed for comparison, and the independent font diagnostic checkpoint `aba0c73` remains on its separate branch. RF901/cp13/cp16 are frozen; the blocked Library transfer was not retried. RF902/903/M10 and M9 completion are not claimed.

## Subsequent local budget work

The historical594-byte budget failure above is resolved by TASK-UX-HEADING-002: current gzip1,429,970/1,430,000. Its exact source/context invalidation evidence is separate. The full-shell53px geometry failure and Windows symlink gate failure remain unresolved; no vertical layout change or push occurred.

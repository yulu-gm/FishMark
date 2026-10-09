# TASK-UX-HEADING-002 — Renderer gzip boundary

Local-only continuation from heading checkpoint 35a8a75b1f337ba4c36cbb2c1c2f86aecbfb6336 on codex/heading-progressive-input-20261009. Remote main is still 4575f048ca40c17b3ae6ad962f558b6053d4c096 (2026-10-09 final ls-remote). No push and no whole-product/M9 completion claim.

## Change and cache correctness

The heading checkpoint exceeded the existing 1,430,000-byte renderer budget by 594 bytes. Two production files now reuse the existing canonical node kind/id/projected range signature for leaf decorations instead of importing the legacy deep DTO/inline serializer. The public legacy serializer and its tests remain intact; the production module becomes unreachable for tree shaking. Table/container/content-edit suffixes remain unchanged.

Canonical identity is not treated as sufficient for external definitions or hash collisions. The existing full recomputation branch compares exact source before replacing runtime.editorDerivedState and unconditionally applies its generated decorations when source changes. Selection-only reuse still requires identical source. Same-source supported context setters retain their existing forced refresh or state rebuild: document path/image resolution; source and heading presentation modes; lazy code parser loading; focus/composition completion; document replacement. Fonts/theme styles update CSS directly. No new cache/state field, parser architecture, vendor change, manual minification, budget change or allowlist change.

The previous implementation is recoverable at 35a8a75 and the public signature module remains present. Revert the two production-file changes together; reverting only the source guard would leave collisions unsafe.

## Final YULUSTATION evidence

Environment remains the machine baseline in .artifacts/hidden-window/environment.json; Electron41.2.0/Chromium146, DPR1, isolated fixtures/preferences. These are correctness measurements, not comparative performance numbers.

| Check | Result | Evidence |
| --- | --- | --- |
| Renderer gzip and all bundle contracts | PASS 1,429,970 / 1,430,000; saved624 bytes, margin30 | .artifacts/heading-gzip-v4-bundle.log |
| Build / typecheck / lint | PASS, build before typecheck | .artifacts/heading-gzip-build-final.log; heading-gzip-typecheck-final.log; heading-gzip-lint-final.log |
| Canonical invalidation tests | PASS6/6; selected filter excludes293 unrelated tests | .artifacts/heading-gzip-cache-final.log |
| Decoration and derived-state tests | PASS76/76 | .artifacts/heading-gzip-v4-decorations.log |
| Full Windows regression | FAIL:3219 pass +10 exact known failures +1 unexpected symlink skip,0 collection/hook/unhandled errors | .artifacts/heading-gzip-full-confirmed.log; heading-gzip-full-confirmed.gate.json |
| Formal Electron protocol | PASS121/121 cases,2541 targets,unexpected0/not-run0 | .artifacts/heading-gzip-formal-final.json; heading-gzip-formal-final.log |
| Actual Electron controller | PASS194/194; original178 unchanged plus16 cache checks | .artifacts/heading-markers/gzip-cache-final-v3/result.json and PNGs |
| Actual built product | FAIL46/47: five new native reference/undo/redo checks PASS; only existing53px geometry assertion fails | .artifacts/heading-gzip-product-final-v2/result.json |
| Independent review | See supported-context audit and bounded conclusion | reports/reviews/2026-10-09-heading-gzip.md |

New tests cover equal-length actual FNV collisions (heading depth and active following reference definition), external URL/title changes with unchanged preceding leaf text, duplicate footnote status, preceding insertion offsets, and same-source same-ID relative-image rendering context. Real Electron exercises native replacement and Ctrl+Z/Y plus original geometry/mouse matrix. The guard-removal negative control produced exactly two collision failures/three passes and restored the source buffer exactly (.artifacts/heading-gzip-mutation-evidence.json and heading-gzip-mutation.log).

## Failed trials preserved

v1 gzip1,430,608 and v2 gzip1,430,565 failed the unchanged budget; both were reverted. v3 gzip1,429,987 reached the budget but its leaf-only invalidation could miss external definition metadata; it was replaced with the exact source guard before acceptance. Raw trial scripts/logs remain under .artifacts.

The first extended native probe recorded190 passes before a missing-heading locator exception. A guarded retry recorded190 passes and a failed exact-source/range assertion: Electron insertText('Lead\n\n') filtered the intended newlines. Final v3 inserts single-line Lead before pre-existing empty lines and still strictly asserts Lead\n\n# Title\n\nTail and heading offset6. Neither earlier run is counted as a pass.

The first built-product cache extension called the backend workspace bridge directly, changing the snapshot while leaving the old Untitled renderer active; its five added checks failed. It remains saved. The bounded rerun uses actual Ctrl+O application flow with an isolated file-picker response, then native selection/input/undo/redo. No CSS is injected and all42 pre-existing assertions retain their conditions; failed checks accumulate and make the process exit nonzero.

## Remaining boundaries

Reading-to-editing full-shell heading reveal still moves line top56→109 (+53px). No vertical app-ui layout choice has been adopted; the horizontal fixed-gutter/long-prefix-source boundary is already approved. The Windows symlink skip is not permitted by the existing gate, and the operating-system developer/security settings were not changed. Native Windows IME remains UNMEASURED. Existing EventEmitter listener warning appears in both the prior heading product run and this run; it is not certified resolved.

The independent table-font diagnostic branch aba0c73 remains separate; no Typora installation/licensing or font/undo fix was attempted here. cp13/cp16 are frozen, blocked Library materialization was not retried, RF902/903 and M10 remain unstarted.

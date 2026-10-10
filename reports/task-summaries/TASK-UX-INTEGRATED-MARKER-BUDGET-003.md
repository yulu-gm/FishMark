# Windows integrated marker budget checkpoint

Local checkpoint only; acceptance **BLOCKED**. No push or M9-completion claim.

## Provenance and changes

Continues the clean local integration checkpoint `e5220cfe5296bea436513eae1bfb1e2f01469c50`, tree `71a32848cf1fe09b0c582e27fc3d23796137ebc4`. Fresh fetch on YULUSTATION still identifies official GitHub main as `5c866ed1137623cfa703026c3be037ad661ec179`, tree `78d1804e4916b114ccc76e9b9f4c16cf3d4d5c18`. The exact new local commit/tree and hashes are recorded after commit in `.artifacts/markers-budget-checkpoint.json`.

Five production files change, with no new module, algorithm, source index, cache or UI behavior:

- Remove unread private reference/footnote definition context fields and their unused calculations. Public Options fields and scoped forwarding remain compatible; canonical reference resolution is unchanged.
- Share the identical fallback list-marker/task-to-body scan in the existing presentation helper. CM still returns a canonical numeric offset unchanged; HTML still clamps it to its line end. Their separate CRLF line-end rules remain intact.
- Share the identical inactive quote-depth class helper, preserving its depth clamp and exact class string.
- Pass TableToolbar props directly to its existing action factory. Seven callback mappings, action order, SVG, tooltips and button/hover/focus behavior remain unchanged.

The approved fixed heading gutter and always-visible long whitespace/tab prefix exception remain unchanged. No CSS, assertion, budget/config/minifier/license, allowlist or system setting change is used.

## Bounded official size attempts

| Candidate | Total JS gzip | Original limit | Result |
| --- | ---: | ---: | --- |
| Integrated e522 checkpoint | 1,430,195 | 1,430,000 | FAIL, over 195 |
| Dead context + shared list fallback | 1,430,153 | 1,430,000 | FAIL, over 153 |
| Above + quote helper + direct toolbar props | 1,430,087 | 1,430,000 | FAIL, over 87 |

The final candidate saves 108 bytes and is the lowest measured readable implementation within these two bounded attempts, not a global minimum. Initial gzip is 101,852/260,000; every other original bundle condition passes. Contract SHA256 remains `cda127f787a04704b408fdb6fd92a3e268909514c3c134c4d7c7dd296d932490`. Both failed official logs and emitted primary chunks/maps are preserved under `.artifacts/markers-budget-bundle-{1,2}.log` and matching `-evidence/` directories. Optimization stops here rather than expanding the implementation for 87 bytes.

## Final frozen-product verification

All 30 source/config/contract hashes in `.artifacts/markers-budget-final-source.json` match throughout validation.

- Full build, serial typecheck and lint: PASS.
- Final related adapter/export/CSS/toolbar presentation suites: 275/275 PASS. Earlier controller/heading suite: 317/319, with the same two known bare-marker failures. These overlapping runs are not added together.
- Official unfiltered Windows regression: **FAIL**, 3276 passed, 10 exact known failures, one unexpected symlink skip; zero collection/hook/unhandled errors, unresolved baseline identities or missing expected skips. Exact unexpected item: `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence 0, state skipped. The same-host original probe returned EPERM; no waiver or security/Developer Mode change is made.
- Fresh official Electron protocol: PASS, 121/121 cases and 2541 targets; 79 verified-existing, 2363 verified-runner, 99 existing known-defect observations, unexpected 0, not-run 0.
- Fresh actual-window Marker protocol: 176/176 PASS, including exact source, native Ctrl+Z/Y, 900/1200px wide/quote/nested/task/tab geometry, four checkbox-gap checks, label-only quote-continuation alignment, and 14 English/Chinese body midpoint/Right contexts. New checkbox and quote-continuation screenshots were inspected.
- Fresh actual-window Search/settings protocol: 38/38 PASS, including held cold import/Escape, canonical result contexts, native button activation, far table reveal/focus, bounded 1000-match pagination, replacements/exact undo, document reset and settings save/reopen/discard/restore. New far-table and last-page screenshots were inspected.
- Independent GPT-6.1-sol review found no pending introduced P0/P1/P2; it does not override failed gates. See `reports/reviews/2026-10-10-integrated-marker-budget.md`.

New raw gate logs use `.artifacts/markers-budget-final-{build,typecheck,lint,full,formal,native}.log`, with full JSON/gate JSON and formal JSON alongside. Marker evidence is `.artifacts/progressive-markers/budget-final/`; Search evidence is `.artifacts/search/budget-final/`, with `.artifacts/search-budget-final-native.log`. Earlier checkpoint evidence remains intact.

## Limits and replay

The body-caret feedback remains **unreproduced in the current 14 midpoint/Right contexts**, not claimed fixed. Preserve the exact fixture and replay entry `.artifacts/markers-integrated-product.cjs`; run it with this checkout's Electron after `npm run build`, using a fresh output directory. The probe uses its own fixture/userData and refuses an existing output directory. Its final raw result records actual collapsed DOM anchor offsets inside labels; the user's exact Markdown and entry/navigation method are still awaited.

This host remains Windows 11 Enterprise 26200, i7-13700K, RTX4070, CLI Node24.13.0 and Electron41.2.0/Chromium146.0.7680.179. Fresh window evidence confirms 2560x1440 display and DPR1, with Aptos/Charter/Georgia/serif CSS stack; it does not certify each glyph's actual face. Baselines remain `.artifacts/hidden-window/environment.json` and `.artifacts/markers-integrated-host-current.json`. Native probes preserve the existing MaxListenersExceededWarning without suppressing or fixing it; only their own processes/windows were closed.

Actual OS IME, Typora side-by-side/license/UI control, arbitrary fonts/themes and packaged Explorer file association remain UNMEASURED. No old-computer files or Mac/9900X measurements are substituted. Library access blockage, frozen cp13/cp16, RF902/903 and M10 are unchanged. Release acceptance remains blocked by **gzip excess 87 bytes and the unapproved Windows symlink skip**.

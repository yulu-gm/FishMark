# Approved total JS gzip budget update

The user explicitly approved `1500000` as this integrated UX batch's formal total JS gzip ceiling, then accepted its one Windows symlink test not running and authorized normal publication to main. The budget change is isolated on top of clean checkpoint `ecf05b8a463fb27dd89906fd4b8a743d6812dad1`, tree `31c4bb1338518e7852dfa120a4b7b35993d6121f`.

## Scope

Only `bundle.max-total-gzip-bytes` in the authoritative `fixtures/architecture/editor-foundation-guard.json` changes: 1,430,000 to **1,500,000 bytes**. All other contract values/checks are identical, as verified by a deep comparison of the entire old/new JSON after restoring that one value in memory. The existing analyzer test also rejects the new ceiling as an inline package-script argument while retaining its old assertions. Current documentation states the new approved policy; historical measurements and failed candidates retain their original ceilings and outcomes.

Production runtime code is unchanged from ecf05b8a. All 29 other pinned source/test/build-config/allowlist hashes from that checkpoint match. No minifier, package lock, license, failure/skip allowlist, OS security/Developer Mode/power setting or frozen RF-901 cp13/cp16 protocol changes.

## Fresh verification

- Official `npm run perf:bundle`: **PASS**, total JS gzip **1,430,087 / 1,500,000 bytes**, headroom **69,913 bytes**. Initial gzip remains 101,852/260,000. All 23 canonical bundle checks pass, including unchanged initial/source/lazy conditions. New contract SHA256: `aaf05ba39c39e8b5391830c80d690853ab1f4d5ac12bc86f3c172b54bbfc625e`.
- Analyzer, architecture and provenance tests: **291/291 PASS**.
- Full build, serial typecheck and lint: **PASS**.
- Official unfiltered Windows regression: **strict FAIL**, 3276 passed, 10 exact known failures, one unexpected skipped symlink test, zero collection/hook/unhandled errors, unresolved baseline identities or missing expected skips. Exact skipped identity: `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence 0, state skipped.

The user-approved **batch-only release exception** accepts only that symlink test not running. It does not convert the strict full-regression gate to PASS, change the allowlist, waive any other/new failure, or extend to future batches. Original same-host EPERM evidence remains `.artifacts/hidden-window/symlink-probe/result.json`.

Fresh raw evidence uses `.artifacts/approved-gzip-1500000-{focused,bundle,build,typecheck,lint,full}.log`, plus `-full.json` and `-full.gate.json`. Independent review is `reports/reviews/2026-10-10-approved-gzip-budget.md`.

## Unchanged product evidence and publication

The exact unchanged production code retains ecf05b8a's focused 275/275, formal 121/121 with 2541 targets, actual-window Marker 176/176 and Search/settings 38/38 evidence. These are explicitly **inherited ecf checks**, not newly run native tests for this budget-only change; replay entries and raw hashes are retained in `.artifacts/markers-budget-checkpoint.json`.

Before this change, fresh official main remained `5c866ed1137623cfa703026c3be037ad661ec179`, tree `78d1804e4916b114ccc76e9b9f4c16cf3d4d5c18`. Immediately before publication, fetch again and verify ancestry; integrate/revalidate any intervening main changes. Use a normal fast-forward push only, with no force or temporary remote branch. Final exact local/remote SHA/tree, push and CI evidence are recorded after publication in `.artifacts/approved-gzip-1500000-checkpoint.json` and the accompanying `-ci-*.json`/job logs. CI completion must be confirmed separately from a successful push.

BODY-caret feedback remains unreproduced in the 14 tested midpoint/Right paths; no blanket fix is claimed. Typora comparison/license/UI, actual OS IME, arbitrary fonts/themes and packaged Explorer file association remain unmeasured. Existing native-probe warnings and historical failures are preserved. **M9 remains incomplete**; RF-902/903 and M10 do not start through this budget approval.

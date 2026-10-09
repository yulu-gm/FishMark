# Independent review: Windows external reload path routing

Date: 2026-10-09
Scope: uncommitted external-reload patch after 45f27b2; source review only, no product edits or large test runs.

## Verdict

Final scoped review PASS: no blocking defect remains in the narrow path-routing, notification subscription, and disposal-guard patch. Actual Electron and final gates are reviewed below. The unchanged full Windows regression verdict remains FAIL solely for the pre-existing symlink skip; this is not a full Windows or M9 PASS.

## Findings and reasoning

- The original callback compared watcher-normalized forward-slash paths with session paths using strict equality. The retained baseline-routing.log demonstrates both separator-direction cases failed. The new helper applies the same platform-specific lexical normalization to both sides.
- Windows-only case folding is reused from the existing identity resolver. POSIX stays case-sensitive and preserves literal backslashes. UNC double-root syntax stays distinct from a single-root path; registry slash conversion no longer collapses the UNC prefix.
- The helper marks every matching session with its own tabId and expectedWindowId. It skips untitled sessions and does not match unrelated paths. Existing owner validation remains in WorkspaceState.markExternalChange.
- Dirty text protection is preserved: document-session.markExternalChange only replaces externalChange in the session. It does not load disk contents, change revision, activate a tab, or invoke a conflict-resolution action. The added inactive-dirty-document test compares the entire session and checks active-tab/other-document preservation.
- Registry internal-write begin/complete and watch registration all use the same normalization function; this patch does not alter the suppression protocol or dirty-conflict resolution.
- The extra normalize call in the identity resolver is consistent with its already-resolved realpath/resolve/join inputs. This is lexical path equivalence, not a new physical-alias resolver.

## Limits and remaining evidence

- Windows case-sensitive directories and Unicode case rules retain the application's existing Windows case policy; this patch does not establish new support for them.
- UNC handling is covered by string-based tests, not a real network share. Extended namespace paths and physical aliases are not newly validated here.
- Reviewed focused.log: 43 passed, 1 skipped across 5 files. The skip must remain visible; do not report all 44 as passed. Reviewed build log reaches the final CLI build; command exit status should be retained by the owner.
- Actual Electron external write -> change notification -> explicit reload, plus dirty document behavior, was still pending at this review. Final approval should use those results and the unchanged project gates.
- No new source findings require implementation changes. No product files were edited by this reviewer.

## Follow-up: renderer notification wiring

The path-only implementation was insufficient in actual Electron (retained real-patched evidence). The follow-up subscribes to the existing external-change bridge and refreshes the main-owned snapshot through the existing serialized refresh path, without reading disk or selecting a conflict action.

Interim follow-up verdict: FAIL pending one P2 lifecycle fix. refreshWorkspaceSnapshot asserts active only before awaiting getWorkspaceSnapshot; a notification-triggered request can finish after dispose and still invoke recordCanonicalSnapshot. That method changes canonical state and editor bindings without a disposal guard. Reproduce with a deferred getWorkspaceSnapshot: emit external notification, wait for invocation, dispose, resolve the snapshot. Add the post-await active assertion and a late-result test, consistent with existing create/activate lifecycle coverage.

Subscription registration is idempotent across repeated start calls; dispose invokes its detach callback. Existing snapshot merging protects pending adapter/edit-client text, and the new test checks the binding and dirty projection. The subscription does not invoke reload or external conflict resolution. Final actual Electron and test evidence remains necessary after the lifecycle repair.

## Follow-up resolution: lifecycle guard

Source re-review PASS. The P2 finding above is resolved: refreshWorkspaceSnapshot now asserts active immediately after the awaited snapshot and before recordCanonicalSnapshot. A deferred external-notification test disposes the application before resolving the IPC and verifies both state identity and editor binding remain unchanged.

The existing disposal test expectation changed from committed to failed for that same late refresh, while retaining destructive-operation failure and no-IPC assertions. This correctly strengthens the disposal contract; it does not suppress a failure or alter an allowlist.

The source now has no known blocking finding in this narrow routing/subscription fix. real-complete provides owner-run application evidence, but the guard-inclusive real-final run and final regression gates remain pending at this addendum. Earlier path-only real-patched failure remains part of the evidence history; it is not represented as a passing implementation.

## Final verified outcome

Scoped independent review PASS. The guard-inclusive real-final/result.json contains 31 checks, all passing, with no recorded error. It covers dirty-text preservation, keep-memory without a disk write, a second external-change prompt, explicit reload adopting disk and clearing dirty state, editing-mode retention, and other-document isolation.

Final regression.json: 3192 passed; 10 exact known failures; exactly one unexpected result, the existing skipped symlink identity test in src/main/file-identity-resolver.test.ts; evaluation and observed errors both empty. The original complete Windows gate remains FAIL. No allowlist or OS privilege exception is introduced by this review.

Final formal.json/formal.log: PASS, 121/121 cases, 2541 targets, zero unexpected and not-run. bundle.log records 1429418 / 1430000 total JS gzip bytes, PASS under the original limit. Build-final, typecheck-final and lint-final logs were inspected; the executing owner reports all three commands exited 0.

The earlier focused-final.log still records four failed old disposal expectations, followed by their reviewed semantic correction. It is retained as history, not described as a passing run. The subsequent full regression above provides final-code test coverage.

Recommendation: retain this as a separate local checkpoint suitable for the narrow fix. There is no remaining scoped code or observed behavior blocker. Unrestricted release acceptance still requires resolving the original symlink environment gate or an explicit exception under the project's existing release rules; no remote CI result or full M9 completion is implied. No further tests were run by this reviewer.

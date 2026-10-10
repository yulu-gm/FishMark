# Windows Search / progressive-marker integration checkpoint

Local checkpoint only; acceptance BLOCKED. No push, budget or allowlist changes, system-setting changes, or M9 completion.

## Provenance

On YULUSTATION, fresh `git fetch origin main` still identifies official main as `5c866ed1137623cfa703026c3be037ad661ec179`, tree `78d1804e4916b114ccc76e9b9f4c16cf3d4d5c18`. This work preserves the paused merge of marker checkpoint `3e70e50374fd4e1038ce89ebd1a7e5f349a44349` and independently verified Search checkpoint `a06790160b8b5d6cc0eceba1ba7c5322c26f8479`. It does not recover or reuse the unavailable old computer's uncommitted patch. The final local commit/tree and evidence hashes are recorded in `.artifacts/markers-integrated-checkpoint.json` after commit.

Current host verification is `.artifacts/markers-integrated-host-current.json`; original detailed same-host fonts/GPU/IME/ports/userData baseline remains `.artifacts/hidden-window/environment.json`. Windows 11 Enterprise 26200, i7-13700K, RAM 34088263680 bytes, RTX4070, balanced power, CLI Node24.13.0, Electron41.2.0/Chromium146.0.7680.179, DPR1. CSS default font stack is Aptos/Charter/Georgia/serif; it does not certify the actual selected face for every glyph. No Mac or old 9900X measurements are mixed into these results.

## Changes

The editor and HTML export now share list-line classes and source-width attributes. Only long ordered markers or markers containing internal tabs expand their positive gutter; ordinary bullet, one/two-digit ordered and task gutters retain their original values. Quote rails and ancestor indentation remain container-owned. The old public source-prefix-offset variable retains its values.

Inactive tab prefixes use zero tab size, including CodeMirror tab widgets. Wide inactive task checkboxes now sit one existing marker gap before their body slot instead of remaining at the far left of the expanded gutter. Raw active source remains editable and body reservation does not change when it is revealed.

Quoted paragraph/heading list continuations hide their canonical list-indentation segments after the final quote marker. Quote markers and padding anchors remain in flow, including bare quote rows; fenced code retains its extra indentation. Export uses the existing projected quote boundary and preserves blank-row anchors and CRLF behavior. No body-space regex trimming, core parser change, DOM replacement or native-history reset is introduced.

Marker-only consolidation removes an unused private blockquote flag/helper, shares the identical horizontal-space scanner, and reuses a guarded list/quote mark constructor. Source ranges, class outputs and ordering are unchanged; distinct CRLF line-end implementations remain distinct. Other owners and navigation normalization are unchanged. Headings retain the approved fixed gutter and always-visible long whitespace/tab prefix exception.

## Verification of frozen source

- Full build, typecheck and lint PASS; frozen source/config/contract hashes are `.artifacts/markers-integrated-final-source.json` and remain unchanged through validation.
- Related adapter/export/CSS tests:261/261 PASS. Controller/heading suite:317/319 PASS, with the same two known bare `-`/`1.` failures. These runs overlap; their counts are not added together.
- Official unfiltered Windows regression:3276 passed,10 exact known failures,1 unexpected skip,0 collection/hook/unhandled errors,0 unresolved baseline identities. Gate FAIL. The only unexpected item is `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence0, state skipped. Original same-host symlink probe returned EPERM; no waiver or allowlist change is made.
- Official formal Electron protocol:121/121 cases,2541 targets;79 verified-existing,2363 verified-runner,99 existing known-defect observations;unexpected0/not-run0.
- Original bundle contract FAIL:totalJsGzipBytes1430195/1430000,over195 bytes. Initial total101896/260000; all other original budget/lazy/forbidden-source conditions PASS. Before the bounded marker-only consolidation it was1430211; earlier merged geometry was1430172. No budget/config/minifier/license changes are used. This stage stops further optimization and preserves both failed candidates' emitted marker/export chunks and maps.
- Final built product, actual Electron window/native input:Marker176/176 PASS. Includes14 English/Chinese body midpoint selections and subsequent Right movement, precise collapsed DOM anchor offsets inside labels, source entry/exit,900/1200px long-number/quote/nested/task/tab geometry,4 actual wide-checkbox gap checks, label-only continuation alignment, native Ctrl+Z/Y and exact file/content restoration. Quoted continuation displacement is now0px; wide checkbox/body gap is the original10.416px within subpixel rounding. Relevant screenshots were visually inspected.
- The same merged build's Search native protocol:38/38 PASS. Includes cold search-runtime request held1600ms and immediate Escape,7 canonical result contexts, trusted keyboard button activation, far table cell reveal/highlight and input focus,1000-match bounded50-row pagination, replacement/native exact undo, no-results/document reset/900px containment, and settings save/reopen/discard/restore behavior. Raw result and inspected far-table/last-page/settings screenshots are `.artifacts/search/integrated-final/`; log is `.artifacts/search-integrated-final-native.log`.
- Independent GPT-6.1-sol source review found no pending introduced P0/P1/P2 after the narrow checkbox and canonical continuation fixes. Final source/evidence review is recorded in `reports/reviews/2026-10-10-integrated-markers.md`; review does not override the failed release gates.

## Evidence and limits

Final raw logs use `.artifacts/markers-integrated-final-{build,typecheck,lint,bundle,full,formal,native}.log`; full JSON/gate JSON and formal JSON have the same prefix. The original bundle contract SHA is retained in the log. Final failed-budget emitted chunks/maps/provenance are in `.artifacts/markers-integrated-final-bundle-evidence/`.

Earlier native evidence is preserved separately. `integrated-before-v3`111/130 is BEFORE evidence. `integrated-after-1`122/130 predates the tab fix. `integrated-after-2`156/163 verifies11 actual body midpoint selections and their Right movements but contains7 unsettled900px sidebar measurements. A small settled-sidebar diagnostic passed all5 quoted-number checks and exposed a real continuation label displacement44.546875px after excluding prefix whitespace from the Range. Earlier continuation PASS assertions measured leading spaces as body and are not accepted. Final probes explicitly wait for the panel and closing sidebar to disappear and measure label text alone. No old run or source-only261 tests substitute for final native acceptance.

The user's report that a body caret reveals raw list syntax has not reproduced in the current candidate's14 midpoint/Right contexts. Those tests record actual collapsed DOM selections inside label text; they do not prove every navigation route or the user's exact Markdown. Original source and entry method are still requested. No visibility-logic rewrite is claimed to have fixed that unconfirmed path.

Actual OS IME, arbitrary fonts/themes, per-frame animation, Typora side-by-side comparison, and packaged Explorer file association remain UNMEASURED. Typora installation files exist but licensing/control is unverified. Existing same-host hidden/minimized activation evidence is12/12; this stage does not change main-process activation code. A repeated MaxListenersExceededWarning appears in baseline and candidate native probes and is preserved without suppression; it is not fixed here.

No user processes, system file associations, Developer Mode/security/power settings, unavailable Library access controls, frozen cp13/cp16 experiments, RF902/903 or M10 are changed. Remaining release blockers are the original gzip excess and unapproved Windows symlink skip, plus the explicitly unmeasured scopes above.

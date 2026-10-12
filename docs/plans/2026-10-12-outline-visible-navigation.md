# Outline navigation to visible heading content

The Windows user reported that clicking an outline item no longer scrolled to its
heading. The current official main (`8a7b2bb9a2c4e335b6e44a8f83023573d5e02ba1`)
and the local candidate share the outline click binding, current editor reference,
load identity handling, and `navigateToOffset` implementation. The user's running
binary was not identified by this investigation.

## Reproduction and cause

An isolated built application with a fresh profile and generated documents ran
36 real Win32 outline clicks: first open, switching to another document, and
reloading a changed disk version; each in reading and editing presentation; each
at H1/H2/H3 with the target initially inside and outside the viewport. All clicks
selected the intended heading, but 15 failed to reveal it. These were all nine
reading-mode offscreen cases and six editing-mode H2/H3 offscreen cases. The other
21 cases passed. No window errors occurred. The test never opened user documents.

A separate one-click diagnostic recorded the actual CodeMirror scroll method's
own coordinate lookup, without adding a layout read or altering its return value:

- The outline dispatched a centered reveal for raw heading offset `1481`.
- Selection normalization placed the caret at visible heading text offset `1483`.
- The scroll method called `coordsAt(1481, 0)` and received `null`.
- The scroll method returned with `scrollTop` still `0`.

The hidden heading prefix has `display: none`. Selection normalization does not
remap an independent scroll effect, so a valid selection could coexist with an
unmeasurable reveal target. This is a scroll target issue, not a missing click
binding or a stale editor reference.

Raw baseline and diagnostic evidence:
`.artifacts/nested-link-fix-20261012/outline/navigation1/` and
`.artifacts/nested-link-fix-20261012/outline/effect-diagnostic1/`.
Both preserve source/build/probe identities with unchanged post-run checks.

## Focused change

For a WYSIWYM navigation request at the start of a heading, the controller now
uses the existing derived snapshot and `createVisibleLine().visibleStartAnchor`
for the centered scroll effect. This handles hidden ATX syntax and leading inline
formatting without introducing a parser. The requested selection still uses its
original offset and the existing selection normalization. Source mode, non-heading
navigation, and offsets inside a heading retain their previous reveal targets.

The new regression suite covers both presentation modes, H1/H2/H3, leading bold
and nested links, empty headings, Setext headings, document replacement/load
identity changes, and unaffected navigation targets. Before the fix it failed
14 cases and passed six; after the fix all 20 passed. Together with editor view,
derived-data, and workspace shell tests, the targeted run passed 47/47.

The first restricted test invocation failed during collection because its
temporary-cache rename was denied. The successful host-context baseline and
candidate runs are separately retained; that collection failure is not counted
as the behavioral regression.

## Acceptance status

The first candidate's repeated 36-click protocol improved H1, but 12 offscreen
H2/H3 cases still failed (`navigation2/`). It is retained as a failed candidate.
The scroll effect now targeted visible text, but remained pending; no scroll
handler ran until a later independent scroll changed the viewport.

The short `far-diagnostic1/` trace identified a second cause. For target `2956`,
CodeMirror's first layout pass changed the rendered viewport six times while
measuring distant line heights. Its seventh measurement had largely converged,
but the library's per-frame iteration limit exits before consuming the pending
scroll effect. `measureScheduled` then became `-1` with the effect still pending.
The trace delegates each actual measure call once and adds no layout reads.

The revised candidate allows one subsequent animation frame to request a public
CodeMirror measurement for an explicit heading navigation. It does not replay a
selection or scroll effect, read private CodeMirror fields, or retry in a loop.
An epoch prevents an old callback from clearing a newer navigation's handle.
Document object, load identity, current selection, and disposal checks reject
stale callbacks. Reload, content replacement, identity/mode changes, later
navigation, and destruction explicitly cancel the pending frame.

Continuation tests first failed seven cases and passed 23. The final targeted run
(`target-final2.log`) passes 60/60 across four files, including cancellation,
unchanged-target controls, and exact reading/editing selection offsets.

The rebuilt short `far-candidate1` passes all three clicks. Its actual scroll
method consumes target `2956` with a measured rectangle and moves `scrollTop`
from `0` to `2268`. The full `navigation3` then passes **36/36**, with all 36
outline click events trusted, six guarded native capture groups containing 144
PNGs, no observer window errors, exit zero, and unchanged source/build/probe
hashes. First open, switching to another document, and disk reload each pass all
12 reading/editing, level, and visibility cases. Existing failed candidates are
retained. This is evidence for the named fixtures, not a guarantee for arbitrarily
large or unusually formatted documents.

The final run's raw main-process log also contains one
`MaxListenersExceededWarning` for 11 `destroyed` listeners on `WebContents`.
It is distinct from renderer window errors and was not suppressed or addressed
by raising a listener limit. Its origin is not classified by this navigation
test; the run is not described as warning-free.

Independent review found no new blocking issue in the bounded continuation.
Build, typecheck, and scoped product lint pass. The latest full regression is
still **FAIL**: 3484 passes, 10 exact known failures, one unexpected Windows
symlink skip, and zero collection/hook/unhandled errors. The strict symlink gate
remains in force; this change does not authorize publishing or an M9 completion
claim. See the corresponding `.artifacts/nested-link-fix-20261012/outline/`
reports and logs for the preserved evidence and precise check scope.

## Subsequent Windows validation

The same product source subsequently passed the complete strict Windows regression: 3485 passing tests, the unchanged 10 exact known failures, zero skipped/unexpected/collection errors. The symlink identity test actually executed after user-approved Developer Mode activation. Standard lint, build and typecheck pass on the tested source. Full commit-specific CI runs after publication. Raw local evidence is preserved separately; no screenshots, archives, credentials or RF901 experiments are added by this publication. The historical table scrollOffset=288 precondition remains unreproduced and is not claimed fixed. M9 is not complete.

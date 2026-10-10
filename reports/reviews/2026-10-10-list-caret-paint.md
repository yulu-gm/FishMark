# Independent read-only review — list caret paint

Reviewer: existing `/root/heading_geometry_review`; no file edits or UI actions. Evidence inspected:03,05–09; product candidate source read before temporary baseline writes. Review scope is this padding-only change.

The reviewer independently counted original PNG pixels: paragraph control has21px caret in6/12 baseline frames; all144 baseline list-body frames lack caret.07/08 restore full21px paint, with08 passing46/46 samples, foreground checks successful and canonical navigation source unchanged. Native undo/redo contents are correct.07 versus03 DOM Range and line rectangles are identical.

No new P0/P1/P2 was found in the scoped final-padding attribute/CSS change. Quote/indent ranges and visibility, selection, keymaps, history and composition are untouched.05's2.81px inward caret offset is rejected;06/07 place the caret approximately1.19px left of the body boundary.

09 independently verified20/25: multiple spaces and tab each pass7 routes. Bold-first item still has5 failed body-start paths; inline hidden-marker CSS is unchanged from main. This supports an uncovered remaining defect; source comparison alone cannot replace the same-fixture baseline pixel test. The parent agent subsequently measured main extra baseline12:9/25 with the same5 bold-first failures; this later result is not presented as an additional reviewer UI run.

The reviewer supports saving an explicitly partial local checkpoint, not claiming all list-start UX solved. Strict regression remains FAIL3298+10 exact known+1unexpected symlink skip. Canonical continuation/empty items, other fonts and OS IME remain outside measured acceptance.

# Windows inline, outline and editor UX fixes

This publication contains the tested product changes from local checkpoint 85df142d7245b2913518937cdaefa6fe4be6c488. It reveals complete supported inline syntax and preserves every source caret position/native undo, handles adjacent and nested inline edges, restores visible native caret metrics, avoids reentrant focused reload refresh, and completes outline scrolling across reading/editing and document replacement/reload. It also retains the previously reviewed natural table entry, preview/source height reservation and minimum column width improvements.

Validation on YULUSTATION: strict full regression 3485 pass plus 10 exact unchanged known failures, zero skips/unexpected/collection errors; standard lint, build and typecheck pass. Patched single/nested/adjacent inline probes retain 1344 independently verified frames. Outline acceptance is 36/36 native clicks; six H1 captures provide 144 independently verified frames, while H2/H3 use trusted input and settled geometry. Independent reviews found no remaining blocker in these scoped changes. Commit-specific CI supplies the required full cross-check after push.

The publication is limited to source, tests and concise behavior/validation notes. Raw evidence remains local; the eight prior evidence ZIPs, their large manifests and RF901 pause material are excluded from the published commit/history. Original local checkpoints are preserved.

The historical table case whose internal scrollOffset remained288 while actual scrollTop was0 is still not reproduced under the final cache precondition. It is not declared fixed; arbitrary-font/zoom, Typora/IME and complete table/M9 acceptance are not claimed. Frozen RF901 cp13/cp16, RF902/903 and Library restrictions are unchanged.

# List caret paint evidence

`candidate.patch` is the product/test diff from8505074, not a claim that all list-start behavior is fixed. See `TASK-LIST-CARET-PAINT-010.md` for passed, failed and unmeasured scopes.

`manifest.json` maps every retained logical raw path to its exact byte length and SHA256. `evidence.zip` stores each distinct original byte sequence once as `blobs/<sha256>`, reducing repeated blink-frame storage. ZIP verification reads every blob and recomputes its hash; no PNG is resized or edited. Materialization means reading each manifest entry's matching blob and writing those bytes to that logical path inside a fresh evidence directory. UserData/cache profiles are excluded.

Primary frozen same-protocol pair:10-official-main versus11-final-candidate (15/46 versus46/46). Extra pair:12-official-extra versus09-extra (9/25 versus20/25; the same five bold-first failures remain). Source snapshots, driver identities, raw event/state reports, full blink-frame PNGs, pixel verdicts, canonical/geometry pair verdict, build/type/lint/bundle/full logs and all earlier failed acquisition/counterfactual records are included.

This archive is local and unpushed. It does not replace frozen RF901/cp13/cp16 evidence or claim packaged-product/OS-IME acceptance.

# Typora Oracle Artifacts

This directory stores black-box Typora behavior evidence for FishMark's Typora-like editing alignment work.

The oracle is intentionally file and UI based. It must not depend on Typora private APIs or inferred internal state.

## Baseline

- Product: Typora
- Version: 1.13.4
- Platform: Windows
- Mode: hybrid editing view
- Whitespace / LineBreak settings: Typora defaults unless a case states otherwise
- Evidence required per case:
  - Typora version and capture date
  - Settings snapshot or written settings confirmation
  - Initial Markdown source bytes
  - Keyboard or pointer action sequence
  - Sentinel token inserted at the final caret position
  - Saved Markdown source bytes after sentinel insertion
  - Screenshot or written visual observation when geometry matters

## Files

- `case-matrix.json`: stable source of case ids, inputs, actions, capture requirements, and capture status.
- `<case-id>.json`: captured oracle result for one case.
- `<case-id>.md`: optional exact initial source fixture when source bytes are easier to inspect as Markdown.
- `images/`: screenshots captured during oracle runs.

## Capture Rules

1. Create a temporary Markdown file containing the exact `initialSource` from `case-matrix.json`.
2. Open it in Typora under the baseline settings.
3. Place the caret from a deterministic start point using only recorded keyboard or pointer actions.
4. Execute the case actions.
5. Insert the case sentinel token at the final caret position.
6. Save the file.
7. Record the saved source exactly.
8. Add screenshots or written geometry notes for caret row, visible empty line, whitespace width, or collapsed separator behavior.

## Status Values

- `pending-typora-capture`: case is defined but Typora evidence is not captured.
- `captured`: Typora evidence exists under this directory.
- `blocked`: capture was attempted but could not be completed; the case record must explain why.
- `retired`: case is no longer part of the current matrix; keep the record for traceability.

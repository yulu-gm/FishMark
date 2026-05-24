# Editable Whitespace Document Intake

## Problem

In an empty document, inserting a space creates source content (`" "`) but the caret stays at document offset `0`.
The editor also leaves the row without an active paragraph block class.

## Verified Cause

The Markdown parser correctly returns no CommonMark block for whitespace-only input.
The editor then treats the whole whitespace-only document as a structural blank line and normalizes the selection back
to the line start.

## Scope

- Preserve Markdown engine parsing semantics.
- In the editor semantic layer, materialize a non-empty whitespace-only document as an editable paragraph block.
- Keep normal structural blank separators between real blocks unchanged.

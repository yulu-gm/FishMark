# Table boundary structural blank intake

## Goal

When a table is used as an independent Markdown block, leaving the last table row with Enter should create a structural blank separator plus an editable blank line below the table.

## Scope

- Plain Enter from the final table row at document end creates `\n\n`, not only `\n`.
- If the table already has a single trailing blank line at document end, exiting below it extends that into the same two-line model.
- Backspace from the editable blank line below a table moves the caret back into the table's last cell instead of deleting the separator.

## Non-goals

- No table formatting rewrite beyond the existing table edit planner.
- No change to row insertion shortcuts; Ctrl/Meta+Enter still inserts a table row.
- No broad paragraph, list, blockquote, or code-fence Backspace behavior changes.

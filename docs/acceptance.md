# Yulora Acceptance Criteria

This document defines the MVP acceptance bar for Yulora. Review work should use this as the source of truth for PASS / FAIL decisions.

---

## 1. Core Principles

- Markdown text is the single source of truth.
- Saving must not automatically reformat the whole document.
- Editing must preserve round-trip fidelity.
- The editor should feel WYSIWYM-like, not like a conventional rich text editor.
- Cursor behavior must be stable and predictable.
- macOS and Windows should both be supported.

## 2. File Operations

The MVP must support:

- creating a new Markdown file
- opening an existing `.md` file
- saving with `Ctrl/Cmd + S`
- saving as a new file
- UTF-8 encoded text

Autosave must:

- be enabled by default
- preserve unsaved content after a pause in typing
- avoid data loss on save failure

Crash recovery must:

- restore the most recent unsaved editing state after an abnormal exit

## 3. Editor Behavior

The editor must handle the common Markdown constructs expected for a Typora-like workflow, including:

- headings
- paragraphs
- lists and task lists
- blockquotes
- inline code
- code blocks
- links
- images

The active block may stay in source form while surrounding blocks render, but the user should always be able to continue editing Markdown directly.

Undo and redo must behave naturally, and deleting Markdown syntax should not cause surprising cursor jumps.

## 4. Input Method and Cursor Stability

The editor must not:

- drop characters during IME composition
- move the caret unexpectedly while composing text
- parse unfinished composition text too early
- jump between lines or blocks in a way that breaks normal editing

## 5. Images and Assets

The MVP must support image paste and drag-and-drop. Imported assets should be written to local storage and inserted as Markdown with a relative path whenever possible.

## 6. Outline, Search, and Export

The MVP should eventually support:

- heading outline navigation
- full-text search and replace
- HTML export
- PDF export

These behaviors are part of the product baseline even if some are delivered by later backlog items.

## 7. Performance

The editor should remain usable on long documents. As a baseline target, a 5000+ line Markdown file should still allow normal editing and scrolling without obvious input lag.

## 8. Non-MVP Exclusions

The following are not part of the MVP acceptance bar:

- cloud sync
- collaborative editing
- account systems
- plugin marketplaces
- rich-document lock-in formats

## 9. Review Outcome Rules

Review results must be explicit:

- PASS if the requirement is satisfied
- FAIL if there is a blocking gap

Ambiguous judgments are not acceptable.


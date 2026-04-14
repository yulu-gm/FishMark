# Yulora Design Document

Version: v1.0  
Date: 2026-04-15  
Scope: local-first Markdown desktop editor for macOS and Windows

---

## 1. Product Goal

Yulora is a Typora-like Markdown desktop editor with a single-pane writing experience. The product goal is not to maximize feature count. The goal is to keep Markdown as the source of truth while making writing, editing, and reviewing feel calm, stable, and local-first.

The MVP should feel like a native desktop writing tool:

- open a Markdown file and start editing immediately
- keep cursor behavior and IME input stable
- preserve Markdown round-trip fidelity
- make rendering a view concern, not the stored document format
- behave consistently on macOS and Windows

## 2. Product Principles

- Markdown text is the single source of truth.
- WYSIWYM is preferred over full WYSIWYG.
- Local files are first-class and work without an account.
- UX stability matters more than feature count.
- Cross-platform consistency matters.

## 3. MVP Constraints

The fixed MVP stack is:

- Electron
- React
- TypeScript
- CodeMirror 6
- micromark
- Vite
- Vitest
- Playwright

The MVP should not introduce a new editor core, cloud sync, collaboration, or a broad architecture shift without explicit approval.

## 4. Scope

### In scope for the baseline

- single-document editing
- open, save, and save as
- autosave
- crash recovery
- Markdown parsing for block-aware rendering
- current-block source editing with surrounding rendered blocks
- outline, search, export, and image handling as later backlog items

### Out of scope for MVP

- cloud sync
- multiplayer collaboration
- plugin marketplace
- mobile apps
- knowledge-graph style workspace features
- large formatting rewrites on save

## 5. Architecture

Yulora keeps the Electron layers separated:

- main process owns application lifecycle, menus, file dialogs, and native integrations
- preload exposes only a narrow, safe bridge
- renderer owns the React UI and editor experience

The renderer should never receive unrestricted Node APIs. File access and other privileged operations stay behind explicit IPC boundaries.

## 6. Editing Model

The document on disk is plain Markdown. Rendering is layered on top of that text, not substituted for it.

Preferred interaction model:

- the active block stays editable as Markdown source
- inactive blocks can be rendered for readability
- selection, undo/redo, and IME behavior must remain predictable
- no automatic whole-document rewrite should happen on save

CodeMirror 6 is the editor foundation because it gives explicit control over state, transactions, selections, decorations, and input behavior. micromark is the parsing foundation because it provides Markdown structure suitable for block mapping.

## 7. File and Data Rules

- local file contents are authoritative
- save operations must preserve user Markdown style unless the user explicitly requests transformation
- autosave must never discard unsaved changes
- crash recovery should restore the most recent unsaved state
- relative paths should be preserved for assets where possible

## 8. UX Priorities

P0 priorities:

- IME stability
- cursor mapping
- undo/redo semantics
- autosave safety
- Markdown text fidelity

P1 priorities:

- image paste/drop
- outline
- search/replace
- export

P2 later priorities:

- themes
- frontmatter UI
- math
- mermaid
- local history

## 9. Implementation Notes

The parser and renderer should be testable in isolation. The editor should expose explicit interfaces for document loading, state updates, and view synchronization. Reusable behavior belongs in small modules with clear boundaries rather than in a large catch-all file.

Any behavior change that affects persistence, editing semantics, or round-trip safety should be covered by tests and documented in the decision log.


# Typora-like Editor Plans

This directory is the canonical landing area for FishMark plans and design notes that change the editor toward a Typora-like Markdown editing experience.

## Scope

Documents in this directory cover editor behavior that affects direct writing, caret movement, visible Markdown rendering, source round-tripping, or Typora comparison work.

Examples:

- Typora behavior oracle and probe definitions.
- Enter, Backspace, Space, Tab, arrow-key, and mouse-selection semantics.
- Active and inactive block rendering rules.
- Blank-line, whitespace-only line, and empty-document editing behavior.
- Markdown marker visibility during active editing.
- Plans that split CodeMirror physical editing state from Markdown semantic rendering state.

## Out Of Scope

Do not place unrelated product, packaging, theme marketplace, release, branding, or app shell plans here unless the change directly affects Typora-like editor behavior.

## Current Documents

- `2026-05-24-typora-editing-alignment-design.md`: top-level design for defining, measuring, and implementing Typora-like editing alignment.
- `2026-05-24-phase-1-baseline-report.md`: TASK-053 baseline report for Typora oracle capture and FishMark probe comparison.
- `oracle/`: TASK-053 oracle artifact protocol, case matrix, future captures, and screenshots.

# Rain Glass Editor Glass Design

## Context

The current `Rain Glass` theme already gives the titlebar, workspace header, status bar, empty state card, and side surfaces a frosted-glass direction.

The main editor surface still feels visually disconnected:

- the workbench background shows the rain scene
- nearby chrome surfaces read as translucent glass
- but the document editing area does not yet present as the same glass card language

That mismatch makes the editor feel like a separate dark panel instead of part of the same wet-glass workspace.

## Goal

Make the document editing area in `Rain Glass` feel like the same family as the empty-state `empty-inner` card.

The editor should read as one coherent frosted-glass panel:

- rounded and softly elevated
- translucent enough to relate to the rain background
- still readable and calm for writing

## Non-Goals

- No changes to editor behavior, cursor semantics, IME handling, undo/redo, or autosave
- No typography changes for Markdown content
- No new runtime shader surface type
- No global redesign for non-`Rain Glass` themes
- No separate `glass mode` preference

## User Outcome

After this change:

- the editing area should visually match the welcome card language
- the editor should feel like a frosted panel sitting above the rain scene
- text should remain easy to read without looking like it sits on a fully opaque slab

## Approach

Use the existing editor host as the glass card surface instead of inventing a new wrapper.

Recommended implementation:

- style `.document-editor` as the primary frosted-glass card
- make the inner CodeMirror layers transparent or near-transparent so the host card provides the visual base
- keep content padding, typography, and editor interactions unchanged

This keeps the architecture stable because the glass treatment stays in CSS and theme package styling rather than introducing new renderer structure.

## Visual Rules

The editor glass should align with `empty-inner`, but be slightly more writing-friendly:

- same general border radius family
- same translucent gradient logic
- subtle inner highlight and soft outer shadow
- readable contrast tuned for long-form text
- less `milky` than the welcome card if needed, so text clarity stays strong

If the fully transparent inner editor harms readability, a very light inner veil may be added to the CodeMirror scroller while preserving the impression that the whole editor is one glass panel.

## Layering

The visual stack should work like this:

1. workbench shader background remains the far background
2. `.document-editor` becomes the main glass card
3. CodeMirror root and scroller stop reintroducing an opaque base
4. text and selection styling continue to sit above the card unchanged

This keeps the `glass` perception on the editor host instead of fragmenting it across multiple nested dark panels.

## Files In Scope

- `fixtures/themes/rain-glass/styles/ui.css`
- `fixtures/themes/rain-glass/styles/editor.css`
- mirrored runtime copy under the local dev theme directory when needed for immediate preview

## Validation

Manual validation should confirm:

- the empty-state card and active editor card feel like the same design family
- the editor visibly relates to the rain background
- the text remains comfortably readable
- no layout shift is introduced when opening a document

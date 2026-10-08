# Table mode layout options — review follow-up

Date: 2026-10-08. Design only; no implementation or acceptance. The existing 53px displacement remains open.

## Established constraints

The reading canvas begins at y=16; showing the existing workspace tabs moves it to y=69. The table toolbar already sits in the left rail. Long-document scroll compensation preserved the anchor; short-document scrollTop clamped 53 -> 0, leaving the entire displacement. These facts were measured on yuluStation and are recorded in TASK-UX-TABLE-001/002.

Keeping all currently visible short-document content in place, retaining its reading area, and adding a 37px tab strip plus the existing spacing into that same vertical area cannot all be achieved with scrollTop or a transition animation. The chrome must move elsewhere or change presentation. Options below work conceptually for short documents without permanent 53px reading reservation; they are product choices, not verified patches.

| Option | Existing components to reuse | Benefit | Cost / validation needed |
| --- | --- | --- | --- |
| Keep document switching in the left rail rather than inserting a top strip on edit | WorkspaceTabStrip actions/state, existing rail | Stable canvas in reading/editing, no vertical reading loss, no toolbar covering content | Narrow rail cannot show full filenames; needs compact document switcher and deliberate expanded view. Tab discoverability, dirty state, close/reorder and keyboard navigation must be preserved. |
| Put tabs into an already-present controlled titlebar region | TitlebarHost + workspace tab actions | Stable document canvas; retains direct tab access without an editor overlay | Only viable when controlledTitlebarEnabled. Caption buttons, drag zones, platform titlebar conventions, width and accessibility require design. Enabling a new titlebar solely for this is not a universal space-free fix. |
| Keep top strip collapsed during direct table/text editing; show document switching only when explicitly requested | Current reading collapse rule and existing workspace tabs | Smallest likely behavioral change; no automatic layout jump or loss of reading space while typing | Tabs no longer automatically appear upon editing. Explicit opening still changes available area, so it must be a deliberate document-switching surface with a defined return path. Changes mode semantics, requiring product approval. |

The third option is the smallest implementation candidate if automatic tab appearance is dispensable. The first offers the clearest stable-layout direction but changes document navigation more substantially. The second is conditional on a titlebar that already exists.

Do not ship universal scroll compensation, transient bottom filler, negative translation/clipping, or an overlay on document text as an unqualified solution: those respectively fail on short documents, introduce artificial scroll extent, hide previously visible content, or cover editable text. Do not treat easing the animation as removal of the geometry shift.

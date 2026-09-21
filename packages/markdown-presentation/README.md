# Markdown presentation

`buildRenderPlan(tree, { revision })` exposes a flat, immutable presentation index over the canonical Markdown tree. The adapter consumes this plan for complete and selection-scoped rendering.

Each entry references its original `MarkdownNode`. IDs, source/content ranges, markers, inline AST, table cells, and definition metadata remain engine-owned. `childrenOf` and `ancestorsOf` return references to indexed entries; they do not create another child tree or reinterpret source text. Traversal includes every container and leaf, including arbitrary list-item descendants and empty items without invented paragraphs.

Roles and typed capabilities describe what a node supports. The consumer decides visibility, activity, styling, and widget lifecycle. This package has no DOM, CSS, CodeMirror, selection, focus, viewport, or source-mode input, and it never invokes a parser. Document-only reference and footnote metadata remain accessible through the referenced tree.

Repeated calls for the same tree and current revision reuse the same plan. Cache ownership is weak by tree identity; equal revision numbers in different documents never share plans. Child and ancestor indexes are resolved lazily and reused. New revisions receive new plans, with source-relative metadata still taken from that revision's canonical nodes.

Public API: `buildRenderPlan`, `RenderPlan`, `RenderPlanEntry`, `RenderRole`, `RenderCapability`, and `CanonicalRenderMetadata` from `@fishmark/markdown-presentation`.


## HTML export

`renderFishmarkMarkdownContent(renderPlan)` renders export content from the same canonical tree and semantic render plan consumed by the editor. The renderer does not invoke a Markdown parser or rescan block/list/blockquote structure. Compatibility-shaped block DTOs are produced only by `projectMarkdownDocument(tree)`, which is a lossless canonical serialization with no scope inference, source scanning, or inline parsing.

Renderer-owned export orchestration remains responsible for theme/style collection and the outer HTML document shell. Presentation owns the pure Markdown-content HTML, including tables, inline previews, math fallback, Mermaid source fallback, reference media, and footnotes. The heavy math engine is injected through `renderMath`; the lazy renderer export chunk supplies KaTeX, so the package root remains safe for initial editor consumers.

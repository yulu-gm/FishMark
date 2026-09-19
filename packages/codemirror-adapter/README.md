# CodeMirror adapter

Public entry: `@fishmark/codemirror-adapter` (`src/index.ts`). The production editor routes semantic commands through this package to the pure `@fishmark/editor-model` planners.

The adapter owns per-view structure caches, local revisions and session generations, CodeMirror transaction conversion, history annotations, selection mapping and composition state. A plan from an unknown or retired session is rejected. The renderer's existing update listener and edit client own production change-frame admission; semantic commands do not enqueue a second frame.

`editorStructureObserver` reports actual parser events and cache updates, including candidate transactions evaluated by filters. Selection-only updates reuse the cache. Ordinary supported text edits use incremental parsing; structural changes may fall back with an explicit reason.

Semantic actions preserve CodeMirror cursor scrolling. Composition freezes semantic commands except explicit `insert-text` typing plans, including paragraph Enter and hard break even though their history intent is `edit`. Native text transactions continue; completion requests the deferred geometry refresh. Synthetic composition tests do not certify native Windows or macOS IME behavior.

The production Markdown transaction filter also leaves provisional composition text and selection untouched. After the composition-end event turn, ordered-list normalization for the changed source range and the finish effect share one transaction; the composition state's transition to idle is the observable completion boundary for deferred consumers.

RF-601 and RF-506 provide this boundary. Decorations, interaction widgets and renderer construction still depend on `editor-core`; RF-701 then RF-602/603/604 must migrate these responsibilities and delete that package. The current package is not evidence that M6 is complete.

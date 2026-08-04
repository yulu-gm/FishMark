# `@fishmark/workspace-application`

Runtime-neutral workspace use cases and their explicit ports. The package may depend on
`@fishmark/workspace-domain`, but never on Electron, React, DOM, CodeMirror, Node APIs, IPC
DTOs, or FishMark process-layer modules. Consumers import only the package root.

`updateDocumentDraft` retains the RF-204-deferred full-draft owner CAS. Revisioned
`applyDocumentEdits` and `flushDocumentEdits` share the caller-supplied per-tab operation
coordinator, so flush is a real through-sequence barrier. Renderer queueing and cutover remain
RF-203 and RF-204. Ports are introduced only with a consuming use case; safe-save and recovery
contracts remain owned by RF-302 and RF-303 respectively.

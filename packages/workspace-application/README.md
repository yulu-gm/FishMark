# `@fishmark/workspace-application`

Runtime-neutral workspace use cases and their explicit ports. The package may depend on
`@fishmark/workspace-domain`, but never on Electron, React, DOM, CodeMirror, Node APIs, IPC
DTOs, or FishMark process-layer modules. Consumers import only the package root.

The current edit use case intentionally adapts the existing full-draft owner CAS. Revisioned
edit batches remain RF-201–RF-204 work. Ports are introduced only with a consuming use case;
safe-save and recovery contracts remain owned by RF-302 and RF-303 respectively.

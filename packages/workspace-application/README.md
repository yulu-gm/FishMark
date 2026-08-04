# `@fishmark/workspace-application`

Runtime-neutral workspace use cases and their explicit ports. The package may depend on
`@fishmark/workspace-domain`, but never on Electron, React, DOM, CodeMirror, Node APIs, IPC
DTOs, or FishMark process-layer modules. Consumers import only the package root.

The current application edit use case intentionally adapts the existing full-draft owner CAS.
The domain edit-batch primitive landed in RF-201; shared/main transport and renderer cutover remain
RF-202 through RF-204. Ports are introduced only with a consuming use case; safe-save and recovery
contracts remain owned by RF-302 and RF-303 respectively.

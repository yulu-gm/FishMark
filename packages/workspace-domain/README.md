# `@fishmark/workspace-domain`

This package is FishMark's runtime-neutral workspace domain boundary. Domain code must not depend on Electron, React, the DOM, CodeMirror, filesystem or IPC implementations, or FishMark's main, preload, and renderer layers. Shared IPC DTOs remain outside this package.

Consumers import only the package root, `@fishmark/workspace-domain`. Within the source tree, `src/index.ts` is the only public entry; package internals are not deep-imported.

The package owns the runtime-neutral `TextBuffer`, factory, validation, revision, and idempotent
edit-batch contracts. `createStringTextBuffer` remains an immutable reference/test factory;
production main injects the persistent factory from `@fishmark/workspace-infrastructure` without
adding CodeMirror imports or a fallback selection path to this package.

# `@fishmark/workspace-domain`

This package is FishMark's runtime-neutral workspace domain boundary. Domain code must not depend on Electron, React, the DOM, CodeMirror, filesystem or IPC implementations, or FishMark's main, preload, and renderer layers. Shared IPC DTOs remain outside this package.

Consumers import only the package root, `@fishmark/workspace-domain`. Within the source tree, `src/index.ts` is the only public entry; package internals are not deep-imported.

The current `TextBuffer` implementation is an immutable string-backed reference buffer. It is production-quality domain behavior, but it is not the future persistent editor storage adapter. RF-201 owns the CodeMirror-backed persistent buffer adapter and must preserve this public buffer contract without adding CodeMirror to the domain package.

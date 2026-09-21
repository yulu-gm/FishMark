# `@fishmark/workspace-infrastructure`

Production text-storage adapters for the main-process workspace. The public package root
exports only `createCodeMirrorTextBuffer`; its CodeMirror-backed concrete type remains private.

This package may depend only on `@fishmark/workspace-domain` and `@codemirror/state`. It must
not import Electron, React, Node APIs, IPC/process-layer source, editor-model, markdown-engine,
or workspace-application.

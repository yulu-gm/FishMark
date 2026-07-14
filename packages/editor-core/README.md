# 编辑器核心包

`@fishmark/editor-core` 是当前唯一 public entry，落点为 `src/index.ts`。当前包同时拥有 Markdown 语义编辑、CodeMirror 6 extension/adapter、decorations、commands、interaction runtime 与 test/performance probe，因此它还不是纯语义模型。

当前边界：

- Markdown 结构与 inline 语义只消费 `@fishmark/markdown-engine` public entry，不在本包新增 document parser 或直接调用 micromark document parse。
- 不得依赖 React、Electron、`src/main`、`src/preload` 或 `src/renderer`；跨 package consumer 不得穿透 `packages/editor-core/src/**`。
- CodeMirror 依赖是 `fixtures/architecture/editor-foundation-guard.json` 中受执行检查的临时 allowance，owner 为 editor foundation refactor，必须在 `RF-604` adapter hard cutover 时删除；它不是永久架构许可。
- 文件系统、workspace ownership、IPC 与持久化不属于本包。
- `src/performance/editor-performance-probe.ts` 通过 public entry 暴露稳定 operation/counter probe；它只记录当前 open/edit/selection/ordered-list 行为，不宣称已经存在 incremental structure cache。

计划但尚未实现：

- `RF-501` 到 `RF-506` 将纯 semantic context/planner 迁入独立 editor model。
- `RF-601` 到 `RF-604` 将 CodeMirror transaction/history/IME/decorations/interaction 收敛到 thin adapter，并在 hard cutover 删除本包和所有旧 import。

在对应 RF task 完成前，不要把上述 planned package 或 cutover 状态写成当前事实。

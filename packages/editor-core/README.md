# 编辑器核心包

`@fishmark/editor-core` 的 public entry 为 `src/index.ts`。RF-506 已把生产编辑命令切到 `@fishmark/editor-model`，经 `@fishmark/codemirror-adapter` 转换为事务；本包仍暂时拥有 CodeMirror extension、decorations、interaction runtime 与 performance probe，等待 M6 删除。

当前边界：

- Markdown 结构与 inline 语义只消费 `@fishmark/markdown-engine` public entry，不在本包新增 document parser 或直接调用 micromark document parse。
- 不得依赖 React、Electron、`src/main`、`src/preload` 或 `src/renderer`；跨 package consumer 不得穿透 `packages/editor-core/src/**`。
- CodeMirror 仍是 forbidden dependency；剩余真实债务由 `fixtures/architecture/editor-foundation-guard.json` 中逐 `(boundary.editor-core, importer, specifier)` 的 exact exception 登记，统一由 `RF-604` adapter hard cutover 删除。新增 importer、同一 importer 新增 CodeMirror package、wildcard 或 stale exception 都会失败，不存在 package-wide temporary allowance。
- active package 必须独占自己的 active `forbidden-imports` rule，且 package path 与 rule `sourcePath` 完全一致；另一个 package 或 `public-package-entry` rule 不能冒充本包边界。
- 文件系统、workspace ownership、IPC 与持久化不属于本包。
- 文档结构来自 adapter 持有的 canonical incremental cache；本包的 rich document 是其投影，物理行和 outline 按不可变文档复用。`src/performance/editor-performance-probe.ts` 记录真实解析和派生工作，不能把投影不再触发旧 parser 当成所有工作均为零。

计划但尚未实现：

- `RF-506` 的生产切换已实现，独立正式行为验收仍在进行；不得据模块测试宣告 M5 完成。
- `RF-601` 到 `RF-604` 将 CodeMirror transaction/history/IME/decorations/interaction 收敛到 thin adapter，并在 hard cutover 删除本包和所有旧 import。

在对应 RF task 完成前，不要把上述 planned package 或 cutover 状态写成当前事实。

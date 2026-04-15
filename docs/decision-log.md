# Yulora 决策日志

用于记录会影响后续工作的简短架构或流程决策。

## 模板

| 日期 | 决策 | 原因 | 备注 |
| --- | --- | --- | --- |

## 记录

| 2026-04-15 | `TASK-035` 在 `src/renderer/code-editor.ts` 内为派生状态更新链加入 composition guard，组合输入期间继续透传文档变更，但延后 `parseBlockMap()` 与 active-block 广播到 composition 结束后统一 flush。 | CodeMirror 自身已经对 IME composition 做底层保护，但 Yulora 后续块级渲染会挂在“文档变化 -> block map / active block -> 视图消费”这条链路上；先把这条链路做成 IME 安全边界，能降低 `TASK-010` 到 `TASK-013` 引入装饰和源码/渲染切换时的吞字、跳光标风险。 | 当前基线只覆盖段落、标题、列表三类高频输入场景；未覆盖引用块、代码块、多光标、跨平台真实输入法事件差异，后续由 `TASK-022` 继续扩展。 |
| 2026-04-15 | `TASK-011` 把段落渲染并入 `src/renderer/code-editor.ts` 现有的 CodeMirror decoration 派生链，对非激活 top-level paragraph 只施加 line-level 轻量排版样式，不替换文本或隐藏字符。 | 这样可以与 `TASK-010` 的 heading decoration 共用同一条 `blockMap + activeBlockState + composition guard` 边界，避免多套 decoration effect 互相覆盖，也把选择、点击定位、IME 风险控制在最小范围。 | 当前只覆盖 top-level paragraph；列表项内部 paragraph、blockquote 内部 paragraph 等更复杂场景继续留给后续 task。 |
| 2026-04-15 | `TASK-010` 把标题渲染收敛为 `src/renderer/code-editor.ts` 中的 CodeMirror decoration 派生状态：非激活 heading 只弱化 `#` 前缀并按层级增强 line 样式，激活 heading 始终保持 Markdown 源码态。 | 这样可以在不引入 widget replacement 的前提下交付第一版可见 block rendering，最大限度复用 `TASK-009` 的 active block 边界和 `TASK-035` 的 composition guard，降低点击定位、选区映射、IME、undo/redo 风险。 | 当前只覆盖 heading；paragraph/list/blockquote 仍由 `TASK-011` 到 `TASK-013` 继续扩展。 |
| 2026-04-15 | `TASK-028` 保持 debug 运行状态在 renderer 内本地折叠 `RunnerEvent`，暂不引入新的 main / preload 订阅桥接。 | 当前 backlog 的目标是把已有 runner 变成可观察的 workbench debug 面，而不是提前做跨进程运行平台；直接在 workbench 里消费 `runScenario()` 和事件流可以最小化 diff，并与后续 `TASK-029` / `TASK-030` 保持兼容。 | 对应实现位于 `src/renderer/App.tsx`、`src/renderer/scenario-catalog.tsx`、`src/renderer/styles.css`、`src/renderer/test-workbench.test.tsx`。 |
| 2026-04-15 | `TASK-009` 把 active block 跟踪收敛为 `packages/editor-core` 中的纯状态解析，并由 `src/renderer/code-editor.ts` 负责把 CodeMirror 选择变化桥接给 renderer。 | 这样可以让“光标 -> block”的语义独立于具体视图实现，后续 `TASK-010` 到 `TASK-013` 可直接消费统一 active-block 状态，而不需要在 React 层重复解析 Markdown 或持有 CodeMirror 细节。 | 当前只交付内部状态和查询接口，不引入任何可见 block 渲染 UI。 |
| 2026-04-15 | `TASK-008` 直接复用 `micromark` 公开导出的 `parse` / `preprocess` / `postprocess` 事件流，在 `packages/markdown-engine` 中只暴露最小顶层 block map。 | 这样可以满足 backlog 对 `micromark` 的要求，同时避免在 `TASK-008` 过早引入完整 AST 或 renderer 语义；后续 `TASK-009` 到 `TASK-017` 仍可基于稳定的 offset / line range 继续扩展。 | 当前仅输出 `heading`、`paragraph`、`list`、`blockquote`，并保留 deterministic `id`、offset 和 line range。 |
| 2026-04-15 | `TASK-005` 把 autosave 保持在 renderer shell 中调度，只复用现有 `main` 保存链路，不额外新增持久化通道。 | 自动保存的核心复杂度在“何时触发”和“如何避免并发写入”，而不是文件写入本身；让 renderer 管理 idle/blur/replay，`main` 继续只负责写盘，可以最小化架构扰动并保持 Electron 三层分离。 | 对应实现位于 `src/renderer/App.tsx`、`src/renderer/document-state.ts`、`src/renderer/code-editor.ts`、`src/renderer/code-editor-view.tsx`。 |
| 2026-04-15 | `TASK-032` 把 `Open / Save / Save As` 收敛到原生 `File` 菜单，并通过单向菜单命令事件通知 renderer。 | 菜单属于桌面应用壳职责，但文件读写边界仍应保持在 `main` 与受限 bridge 内；用主进程菜单发命令、renderer 复用现有处理函数，可以在不复制保存逻辑的前提下消除网页式按钮工具条。 | 对应实现位于 `src/main/application-menu.ts`、`src/main/main.ts`、`src/shared/menu-command.ts`、`src/preload/preload.ts`、`src/renderer/App.tsx`。 |
| 2026-04-15 | `TASK-007` 让 CodeMirror 6 拥有当前编辑文本状态，renderer shell 只保留文档元数据、持久化快照与 dirty / save 状态。 | 这样更符合 CodeMirror 的事务与历史模型，避免把编辑器做成受控输入框，并为后续 active block、块级渲染和 IME 稳定性优化保留更干净的边界。 | 对应实现位于 `src/renderer/code-editor.ts`、`src/renderer/code-editor-view.tsx`、`src/renderer/document-state.ts`、`src/renderer/App.tsx`。 |
| 2026-04-15 | `TASK-004` 延续 `TASK-003` 的文件桥接边界，把 Save / Save As 都限制在 `src/main/`，renderer 只维护 `dirty` 与保存状态。 | 这样可以继续满足 Electron 三层分离约束，同时让 `TASK-005` autosave 直接复用当前保存链路，而不需要在 renderer 复制文件写入逻辑。 | 对应实现位于 `src/main/save-markdown-file.ts`、`src/preload/preload.ts`、`src/shared/save-markdown-file.ts`、`src/renderer/document-state.ts`。 |
| 2026-04-15 | `TASK-003` 保持所有文件系统访问都在 `src/main/`，并只通过单一 `openMarkdownFile()` bridge 向 renderer 暴露打开文件能力。 | 这样可以继续满足 Electron 三层分离约束，避免把不受限制的文件系统能力泄漏给 renderer，也为后续保存能力复用统一结果结构与错误映射打下基础。 | 对应实现位于 `src/main/open-markdown-file.ts`、`src/preload/preload.ts`、`src/shared/open-markdown-file.ts`。 |
| 2026-04-15 | `TASK-003` 在 CodeMirror 接入前，先使用临时 `<textarea>` 承载已打开文档的内存文本。 | 当前任务目标是建立“打开 Markdown 文件”的最小闭环，而不是提前引入完整编辑器。先用最小可测试界面承载当前文档状态，可以降低 diff 风险，并为 `TASK-004` 保存链路和 `TASK-007` 编辑器接入保留清晰边界。 | renderer 状态与内存编辑逻辑位于 `src/renderer/document-state.ts` 和 `src/renderer/App.tsx`。 |
| 2026-04-15 | `TASK-002` 先创建工作区边界目录和 README 占位文件，而不迁移当前根目录开发壳。 | 当前可运行应用已经满足 `TASK-001` 的骨架目标，立刻搬迁根目录只会制造额外扰动。保留最小占位结构更容易回退，也能提前显式标出未来 monorepo 结构。 | 已创建 `apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e`。 |
| 2026-04-15 | `TASK-001` 和 `BOOTSTRAP-DOCS` 在独立评审后被接受并关闭。 | 文档记录与已验证的开发壳行为已对齐。 | 后续工作可继续基于该骨架推进。 |
| 2026-04-15 | Vite 与 Electron 统一固定使用 `http://localhost:5173`。 | 之前假设的 `127.0.0.1` 在当前主机环境下不稳定，统一到 `localhost` 能让开发启动更可复现。 | `vite.config.ts` 固定 `host: "localhost"`、`port: 5173`、`strictPort: true`。 |
| 2026-04-15 | 从 `tsconfig.electron.json` 中移除了无效的 `electron` 类型声明，并恢复了本地 Electron 依赖。 | `TS2688` 源于错误地把非 `@types` 包名写入 `types`，同时本地依赖树也缺 Electron。去掉错误配置并恢复依赖后，TypeScript 才能正确解析 `electron` 模块。 | 这是与已确认故障模式最匹配的最小修复。 |
| 2026-04-15 | Electron 包入口与开发启动脚本改为指向 `dist-electron/main/main.js` 和 `dist-electron/preload/preload.js`，并在启动前等待 HTTP 服务就绪。 | TypeScript 编译产物实际位于 `dist-electron/main/` 与 `dist-electron/preload/`，旧路径无法稳定启动；等待 dev server 可避免 `ERR_CONNECTION_REFUSED` 竞态。 | 让 `TASK-001` 与真实输出路径保持一致。 |
| 2026-04-15 | `docs/` 成为唯一有效的工作文档目录。 | 编排流程默认读取 `docs/`，统一入口可降低歧义。 | 旧草稿材料不再作为活跃维护目录。 |
| 2026-04-15 | 删除重复的 `doc/` 目录，并把唯一仍有价值的内容保留到 `docs/agent-runbook.md`。 | 重复目录会让未来 agent 和人工协作产生歧义。 | 此决策覆盖更早“保留旧 `doc/` 不动”的临时约定。 |
| 2026-04-15 | `TASK-001` 的开发壳启动证明已在修复 `localhost` 不一致和恢复 Electron 运行时后重新记录。 | 需要用可成功退出的证明命令替换旧的、不稳定的记录。 | 当前仓库中的通过记录来自这一轮修正后的证据。 |

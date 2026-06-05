# TASK-062 长文档打开性能优化 Intake

日期：2026-06-06

## 背景

用户用 `tmp/complex_stress_test.md` 做压力测试时发现：打开复杂长 Markdown 文件速度较慢，并且 UI 会出现卡顿。为了定位瓶颈，本轮在 main、renderer、CodeMirror editor state、editor-core derived state、outline/metrics 等路径加入临时性能日志，并用打包后的 Electron 入口打开该文件收集了一次启动期日志。

测试文件特征：

- 大小：197055 bytes
- 文本量：148223 chars
- 行数：7370 lines
- 标题：645
- pipe table lines：589
- fence markers：354
- Mermaid fences：90
- math markers：332
- fence info openers：178，其中 `mermaid:90`、`ts:80`

日志文件：

- `tmp/perf-open-stdout.log`
- `tmp/perf-open-stderr.log`

## 已定位问题

当前证据显示 main 侧文件读取不是瓶颈，主要卡顿集中在 renderer 首屏打开路径、editor-core 派生状态构建，以及打开后的多次同步重算。

### 1. main 侧打开文件耗时可接受

`main:openMarkdownFileFromPath.total` 为 17.77ms，其中：

- `readFile`：7.71ms
- `stat`：1.30ms
- `decode`：0.45ms
- `recordRecentFile`：2.54ms
- `workspace openDocument`：0.08ms
- `syncWorkspaceWatch`：0.92ms

结论：目前不应优先优化磁盘读取或 IPC 前的 main 进程路径。

### 2. renderer 首次建 editor state 成本高

第一次创建 editor state：

- `renderer:codeEditor.createState`：349.80ms
- `editorCore:blockDecorationsField.create`：346.00ms
- `editorCore:createEditorDerivedState.total`：299.70ms
- `parseMarkdownDocument`：219.00ms
- `physicalEditingDocument`：79.40ms
- `createBlockDecorations`：45.50ms
- `createEditorView`：40.00ms

结论：首次可交互前，大文档解析、物理编辑行模型、inactive block decorations 都在同步路径上集中执行。

### 3. 同一个文档在打开时被二次完整加载

同一份内容首次 state 创建后，又触发了一次 `replaceDocument`：

- `renderer:codeEditor.replaceDocument.total`：266.10ms
- 第二次 `renderer:codeEditor.createState`：259.90ms
- 第二次 `editorCore:blockDecorationsField.create`：259.00ms
- 第二次 `parseMarkdownDocument`：158.30ms
- 第二次 `physicalEditingDocument`：73.90ms

相关落点：

- `src/renderer/code-editor-view.tsx`：controller 创建时已使用 `initialContent`
- `src/renderer/code-editor-view.tsx`：挂载后的 `loadRevision` effect 又立即调用 `replaceDocument(latestLoadedContentRef.current)`
- `src/renderer/code-editor.ts`：`replaceDocument` 会创建全新的 CodeMirror state

结论：这是当前最确定的低风险优化点。应消除打开同一文档时的重复全文建模。

### 4. 文档 path 更新导致额外 decoration refresh

日志中出现：

- `renderer:codeEditor.setDocumentPath.refreshDecorations`：111.00ms
- 对应 `editorCore:recomputeDerivedState.total`：105.30ms

相关落点：

- `src/renderer/code-editor.ts`：`setDocumentPath` 总是触发 refresh decorations

结论：打开文件时如果先用 content 创建 state，再补 documentPath，会产生一次额外全文 decoration 重算。应让 documentPath 进入首次 createState，或只在路径实际影响资源解析时做更窄的刷新。

### 5. 大纲与 metrics 在打开后同步抢占 renderer

打开后同步派生 UI 数据：

- `renderer:documentDerivedData.outlineNow`：146.40ms
- `renderer:documentDerivedData.metricsNow`：229.20ms

相关落点：

- `src/renderer/editor/App.tsx`：打开文档后同步调用 `applyDocumentDerivedDataNow(activeDocumentContent)`
- `src/renderer/editor/useDocumentDerivedDataController.ts`：outline 与 metrics 都在 renderer 同步执行

结论：大纲和 metrics 不是编辑器首帧必须条件，应延后到首帧之后、idle 阶段或 worker/cache 路径，避免和 editor state 创建争抢同一段主线程时间。

### 6. 打开后多次强制重算 derived state

打开后额外出现 6 次 `editorCore:recomputeDerivedState.total`，累计 561.70ms。虽然 parse 已基本命中缓存，但仍反复重建：

- `physicalEditingDocument`：每次约 49-71ms
- `createBlockDecorations`：每次约 24-41ms

可能触发来源：

- `setDocumentPath` 后 decoration refresh
- code fence language parser / highlight lazy load 后触发 refresh
- Mermaid / math / source mode gate 周边 decoration 更新

结论：缓存只覆盖 parse 不够；还需要复用或分层缓存 `PhysicalEditingDocument`，并合并同一打开周期内的强制 refresh。

## 任务目标

以 `tmp/complex_stress_test.md` 或等价生成 fixture 为基准，优化长 Markdown 文件打开时的关键路径：

- 打开同一文档时只做一次全文 CodeMirror state 构建。
- 首次 editor view 可见前不执行非必要的大纲 / metrics 同步计算。
- documentPath、code parser lazy load、decoration refresh 不引发多轮重复全文派生状态重建。
- 保持 Markdown 文本为唯一事实来源，不改变保存、autosave、undo/redo、source mode、active block、IME 和 round-trip 语义。

## 范围内

- 建立可复现的长文档打开性能 probe 或脚本化采集入口。
- 清理 `code-editor-view` 初始内容与 `loadRevision` effect 之间的重复加载。
- 让首次创建 editor state 时拿到 documentPath，避免打开后立刻全量 refresh。
- 对 `setDocumentPath` refresh 做 guard，只在路径变化且路径会影响资源解析时刷新。
- 对打开期的 code parser / highlight lazy load refresh 做 requestAnimationFrame / microtask / idle 合并。
- 让 outline / metrics 从首屏同步路径移出，或共享 parser / derived cache，避免重复解析。
- 评估并实现 parse 之后的 `PhysicalEditingDocument` / block decoration 分层缓存或复用。
- 增加日志字段，使后续能区分 read、IPC、editor state、parse、physical lines、decorations、outline、metrics、lazy refresh 的耗时。

## 范围外

- 不替换 CodeMirror 6 或 micromark。
- 不把 Markdown 真值迁移成结构化 AST 存储。
- 不引入会改变编辑语义的大规模 worker 架构，除非本 task 内先形成明确设计记录并保持 renderer bridge 边界。
- 不优化 Mermaid 具体 SVG 渲染质量或语法覆盖；本 task 只处理打开期触发和调度。
- 不把临时 debug log 默认暴露给普通用户；性能日志必须保持 opt-in。

## 主要落点

- `src/renderer/code-editor-view.tsx`
- `src/renderer/code-editor.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/editor/useDocumentDerivedDataController.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.ts`
- `packages/editor-core/src/derived-state/markdown-document-cache.ts`
- `packages/editor-core/src/physical-editing-document.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/decorations/`
- `packages/editor-core/src/decorations/code-highlight-language-loader.ts`
- 可新增 `packages/editor-core/src/performance/` 与 `src/shared/performance-log.ts`

## 执行切片

- [ ] 固化性能基线：把本轮临时日志收集方式整理为可复现 probe，并记录当前 stress fixture 的基线数值。
- [ ] 消除重复加载：修复 initialContent 与首个 `loadRevision` effect 的重复 `replaceDocument`，保证打开同一路径同一 revision 只创建一次全文 state。
- [ ] 合并 documentPath 初始化：让 documentPath 参与首次 editor state 创建，或让首次 `setDocumentPath` 不触发全量 decoration refresh。
- [ ] 延后非首屏派生数据：把 outline / metrics 从打开同步路径挪到首帧后调度，并避免两者重复解析同一文档。
- [ ] 合并打开期 refresh：对 lazy parser / highlight / source gate 周边 refresh 做批处理，避免短时间内多次 `recomputeDerivedState`。
- [ ] 复用派生中间产物：在 parse cache 之外复用 `PhysicalEditingDocument` 与可安全复用的 block decoration 输入，降低刷新成本。
- [ ] 写入性能验收报告：对优化前后日志做对比，更新 `docs/test-report.md` 或 task summary。

## 验收标准

以 `tmp/complex_stress_test.md` 或等价稳定 fixture 运行性能 probe，至少满足：

- main 侧 `openMarkdownFileFromPath.total` 保持在 50ms 以内，且没有新增主进程阻塞点。
- 打开同一路径同一 revision 时，不再出现第二次同内容 `replaceDocument -> createState` 全量链路。
- 首次 editor state 构建拿到 documentPath，打开后不再因为首次设置 documentPath 触发 100ms 级全量 refresh。
- outline / metrics 不阻塞 editor 首帧创建；日志能显示它们发生在 editor view 创建之后或 idle 调度中。
- 打开期 `editorCore:recomputeDerivedState.total` 强制刷新次数降到 2 次以内，累计耗时低于 200ms。
- stress 文件打开期间 renderer 不出现连续 500ms 以上同步占用窗口。
- 编辑、保存、autosave、source mode、active block、IME composition、outline 点击定位和图片相对路径解析不回归。
- `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 通过；相关 editor-core / renderer 测试通过。

## 后续执行建议

下一步应使用 `fishmark-task-execution` 执行 `TASK-062`。建议第一轮只做前三个切片：固化 probe、消除重复加载、合并 documentPath 初始化。这三个点风险最低，且日志显示收益最明确。

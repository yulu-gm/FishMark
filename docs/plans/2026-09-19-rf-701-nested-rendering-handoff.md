# RF701 嵌套渲染修复与快照消费者迁移交接（2026-09-19）

范围：RF701 待验证的嵌套渲染问题，以及恢复时阻塞 typecheck 的 RF602 消费者迁移。不是 M6 完成报告；未触碰其他里程碑。

## 恢复时的事实：工作区 typecheck 是红的

`packages/editor-core/src/active-block.ts` 与 `table-cursor-state.ts` 已切到 canonical snapshot，但 10 个测试文件、`derived-state/editor-derived-state.ts`、`src/renderer/code-editor.ts` 仍引用已删除的 `createActiveBlockStateFromMarkdownDocument` / `createActiveBlockStateFromBlockMap`，并按 4 参调用 `deriveTableCursorState`。renderer 配置共 39 个错误。旧 helper 无法用 `MarkdownDocument` 还原（富投影不携带 tree），所以消费者迁移是唯一可行路径，先做它才能验证其他行为。

## 已完成的修复

### 1. 快照消费者迁移（生产 + 测试）

- `createEditorDerivedState({ snapshot, selection, previousTableCursor })`：active block、table cursor、editing document、outline 全部从同一个 canonical snapshot 派生；`markdownDocument` 改为共享投影（`activeBlockState.blockMap`）。
- 新增 `projectSnapshotMarkdownDocument(tree)`：每个 revision 只投影一次（WeakMap），selection 变化不再重建富投影。
- `extensions/markdown.ts`：live derived state 直接使用 `createEditorDerivedSnapshotFromCache(readEditorStructureCache(state))`；初始空文档状态改用 `createDocumentStructureCache("")`，不再在扩展构造时解析空串。
- `derived-state/inactive-block-decorations.ts`：删除 `markdownDocumentCache` / `blockMapCache` 兜底分支与 guard，只从 `snapshot` 派生。
- `src/renderer/code-editor.ts`：初始 `activeBlockState` 由 canonical 空快照构建，不再调用 `parseMarkdownDocument("")`；`createActiveBlockState` / `projectSnapshotMarkdownDocument` 由 editor-core 公开导出。
- 删除 `packages/editor-core/src/derived-state/block-map-cache.ts`（最后一个消费者已迁移）。
- 测试迁移：9 个文件由子代理完成（active-block、table-cursor-state、commands/*、markdown-shortcuts、registry），另有 block-decorations、inactive-block-decorations、editor-derived-state 三个由父完成。

### 2. 表格光标偏移空间（产品 bug，3 条合同）

`deriveTableCursorState` 返回 canonical `node.source.startOffset`（不含 `> ` 或列表缩进），而所有消费者（`block-decorations.ts` 的 `activeTableCursor` 比较、`table-adapter`、`commands/table-context.ts`、`table-widget` dataset、extension 的 dataset 比较）用的都是富投影 `TableBlock.startOffset`（物理行首）。结果：引用内表格的 cursor 状态与 `readTableContext` 直接失效。新增 `resolveProjectedTableStart(snapshot, node)` 把 canonical 起点映射回物理行首，inside 与 adjacent 两个分支及 `previousCursor` 比较统一使用它。

### 3. 逐行 clip inline ranges（父提出的两个问题，均已复现）

- **零宽 widget 被丢弃（已复现）**：`if (to > from)` 会丢掉 `from === to` 的点 widget。container 内叶子（list/quote）的 active 行硬换行 `<br>` 与图片预览点 widget 因此完全消失。
- **跨行 replace 重复（已复现）**：canonical 图片节点跨软换行时，旧 clip 会在两行各切一段并各挂一个预览 widget——两个预览、且各自只遮住源码片段。
- 新增 `appendClippedInlineDecorations`：点 widget 归属其所在行（含行尾）；mark 在软换行处按行切分；带 widget 的 replace 跨行时不切分，两侧都保留源码文本（避免重复预览，也避免 replace 吃掉换行把两行合并）。

### 4. 嵌套 heading 与容器行盒归属

- container（list item / blockquote）内的段落不再叠加 `cm-inactive-paragraph-leading`（line-height 1.95）覆盖容器自身的 1.6 / 1.84 行高；行盒归容器所有。
- container 内的 heading 现在同时具备 inactive/active 行类（保留标题字号字重），并在非 active 行隐藏 `#`（`cm-inactive-heading-marker`）、active 行保留源码标记。此前嵌套 heading 完全没有 marker 隐藏，也没有 active 行类。

## 同轮追加：RF602 遗留解析路径清理

- **删除装饰层的 source-scan 兜底**：`createBlockDecorationContext` 不再在索引缺失时调用 `collectReferenceDefinitions(source)` / `collectFootnoteDefinitions(source)`，`collectReferenceDefinitionsWhenMissing` 选项一并删除。定义索引一律取自 canonical 投影（`tree.referenceDefinitions` / `tree.footnoteDefinitions`，投影始终提供、包括空表），符合 M6 审计的 "canonical indexes must be provided, including the empty case"。
- **删除 source-keyed `derived-state/markdown-document-cache.ts`**：`readStateMarkdownDocument` 改为 `projectSnapshotMarkdownDocument(readEditorStructureCache(state).tree)`（同一 revision 复用一份投影）。Ctrl+click 链接解析、脚注跳转、detached-list 空白行插入三处查询全部改走它；detached-list 事务助手改为直接接收 `(state) => MarkdownDocument`。
- **删除扩展上已死的两个解析入口**：`parseMarkdownDocument` 与从未被调用的 `parseOrderedListNormalizationBlockMap`（含 `ParseMarkdownDocument` / `ParseOrderedListNormalizationBlockMap` 类型导出），同步更新 `src/renderer/code-editor.ts` 与 performance probe。probe 的 `parserEntries` 因此失去数据来源（现在恒为 0），字段暂留以维持报告 schema，是否移除留待父重生成 baseline 时决定。
- **改写依赖注入 parser spy 的测试**：`extensions/markdown.test.ts` 三条用例改为观察真实 `editorStructureObserver` —— 编辑走 canonical 增量窗口且无额外 full parse、selection-only 只产生 cache hit、非列表改动只产生一次内容变更（规范化不再重写文档）。

验证：`npm run typecheck` 通过、变更文件 ESLint 干净、目标套件 123 通过（extensions 41 / block-decorations 68 / derived-state 9 / production DOM 5）。

## 同轮追加 2：物理行几何单一所有者（RF602）

- `packages/editor-core/src/physical-editing-document.ts` 不再自行切分源码、裁剪 CRLF、建立行索引：`createPhysicalEditingDocument(canonicalDocument, markdownDocument?)` 直接映射 editor-model canonical `PhysicalEditingDocument.lines`（`range` / `contentRange` / `lineNumber` → `from` / `to` / `lineBreakTo` / `text`），删除了约 80 行重复的 `createEditingLines` / `createEditingLine` 重建逻辑。行几何现在只有一个所有者；editor-core 只保留派生的 semantic role map（`SemanticLineRole`）。
- 调用链改为传递 canonical snapshot：`createStructuralLineModel(snapshot, markdownDocument)`（因此 `line-visibility.ts` 的 `normalizeStructuralBlankSelectionAnchor(snapshot, …)` 也换成 snapshot，调用方复用同一个 snapshot 实例）、`line-block-adapter` 的可视行导航模型、`block-decorations` 的物理行兜底路径都从 `snapshot.document` 取行。
- `createEditorDerivedState` 的几何缓存改为按 canonical model document（每个 revision 一份）复用，selection-only 变化仍然零重建；顺带删除每事务一次多余的 `transaction.newDoc.toString()`。
- 验证：typecheck 通过；lint 0 error（8 条既有 react-hooks warning 位于未触碰的 `src/renderer/editor/*`）；`physical-editing-document` 11、`structural-line-model` 5、`line-visibility` 4、derived-state 9、block-decorations 68、extensions 41、interactions 5 全部通过；生产 `code-editor.test.ts` 273 条中 271 通过（仍只剩 2 条预存 bare-marker 失败）；全量 2688 passed / 1 skipped / 13 failed，失败集合与上一轮完全一致，无新增。

## 同轮追加 3：异步 widget 生命周期与测量（RF603 首片）

- 新增 `packages/editor-core/src/decorations/widget-lifecycle.ts`：`isWidgetMounted` / `requestMountedWidgetMeasurement` / `completeMountedWidget`。测量目标刻意写成**结构类型**（只需要 `dom.contains` 与 `requestMeasure`），因此没有给 editor-core 增加新的 `@codemirror/view` 依赖，架构 guard 的 CodeMirror debt 清单保持 57 条不变。
- 修复的实际缺陷（审计指出的 RF603 项）：KaTeX、Mermaid 预览的异步完成（成功与 fallback 两条路径）以及图片预览的 `load` / `error` 此前**既不校验容器是否还在 view DOM 内，也从不请求重新测量**——异步内容改变 widget 高度后，CodeMirror 的高度表、光标几何与滚动锚点仍停留在渲染前尺寸；已移除/已回滚的 widget 还会继续被写入。现在两条路径都是"确认仍挂载 → 写入 → `view.requestMeasure()`"，未挂载则整段丢弃。
- 新增 `packages/editor-core/src/decorations/widget-lifecycle.test.ts` 8 条合同：挂载/卸载判定、被丢弃的 widget 不写入且不测量、KaTeX 渲染与测量、Mermaid 成功与 fallback 与测量、图片 decode 与测量。
- 验证：typecheck 通过、lint 干净、`decorations` 88 通过（含新增 8 条）、生产 `code-editor.test.ts` 291/293（仍只剩 2 条预存 bare-marker 失败）、`editor-foundation-architecture` 恢复全绿（242 通过）、全量 2696 passed / 1 skipped / 13 failed，失败集合与前两轮一致，无新增。
- RF603 余项：widget 与交互适配器仍在消费富投影 DTO（与 RF604 的路由迁移同批）；表格 widget 的陈旧回调加固；"异步预览加载期间滚动锚点稳定 / source-preview 切换"仍需 Electron 几何探针（要构建应用）。

## 同轮追加 4：语义行角色移出富投影（RF602 收官片）

- 新增 `packages/editor-core/src/canonical-semantic-lines.ts`：`createCanonicalSemanticLineRoles(lines, snapshot)` 只读 canonical tree 解析全部 16 种语义角色（root children 的行跨度、list item 起始行、block-math 的 `closed`、fence 开合标记文本规则、空行的 structural-separator/extra-blank 判定）。`SemanticLineRole` 类型迁到该模块，由 `physical-editing-document` 重新导出，editor-core 的公开导出路径不变。
- **先证明等价，再删除旧实现**：切换前用差分对比把树版本与投影版本在 42 份手写文档 + 2 个生成 fixture 上逐行比对，**46/46 完全一致**；确认后才删除投影实现。永久测试改为同语料的冻结金表（每个角色的行序字符串，覆盖全部 16 种角色与嵌套/CRLF/围栏/表格/定义等构造）+ 生成 fixture 的"每行恰好一个角色"不变量。
- `physical-editing-document.ts`：`createPhysicalEditingDocument(canonicalDocument, snapshot)` 不再接收 `MarkdownDocument`；`SemanticLine` 去掉 `block` 字段（投影耦合消失）；删除 `findBlockForLine` / `resolveSemanticLineRole` / `isCodeFenceClosingLine` / `readOpeningFence` / `resolveListLineRole` / `isStructuralSeparator` 等约 145 行投影派生逻辑。
- 调用方同步：`editor-derived-state.ts`、`block-decorations.ts`（物理行兜底路径）、`structural-line-model.ts`、`line-visibility.ts`，以及 `physical-editing-document.test.ts`（改为 snapshot 输入，并去掉 `line.block` 断言，改为断言角色）。
- 验证：typecheck 通过、lint 干净、**editor-core 全量 25 文件 / 284 测试通过**（新增 45 条角色合同）、全量 2740 passed / 1 skipped / 13 failed，失败集合与前三轮完全一致，无新增。
- 仍依赖富投影（后续片）：`structural-line-model.ts` 的导航分隔符判定（引用内结构空行仍走 `blocks` / `BlockquoteBlock.lines`）、`block-decorations.ts` 的装饰路由与签名（仍按 `blockMap.blocks` + 投影 DTO）、interactions/commands 的投影 DTO、`context/block-tree`。

## 同轮追加 5：引用结构分隔符与导航脱离富投影（RF602 续）

- `blockquote-structural-separators.ts` 重写为 canonical：`findCanonicalBlockquoteStructuralSeparatorAt(snapshot, anchor)` / `findCanonicalPreviousBlockquoteStructuralSeparator(snapshot, lineStart)`，只读模型物理行（quote-marker 段计数 + content 边界）与 blockquote 节点的 children；投影版本（`blocks` / `BlockquoteBlock.lines`）及其类型导入全部删除。
- 差分验证同样先行：22 份引用语料，逐个 anchor 比对 `findAt`、逐个行首比对 previous 查找。期间发现并精确复刻两处偏移空间差异：① 投影对引用内**非段落/标题**的 block 使用整行范围（`> - item` 的 list 起点是物理行首 8，而非内容起点 10），段落/标题保留内容范围；② 投影的行 `endOffset` 停在换行之前（CRLF 行保留 `\r`），消费者随后用 CR 裁剪后的 content end 覆盖它。复刻后 22/22 完全一致，才删除旧实现；永久测试改为 22 份语料的冻结分隔符金表 + previous 查找的显式合同。
- `structural-line-model.ts`：`createStructuralLineModel(snapshot)` 不再接收 `MarkdownDocument`；引用空行判定改用模型行的 quote-marker 段；body 分隔符的 `findPreviousBlockEnd` / `findNextBlockStart` 改用 tree 的 root children（根级 block 不受整行吸附影响，与投影一致）。`line-visibility.normalizeStructuralBlankSelectionAnchor(snapshot, anchor, direction)` 与 `line-block-adapter` 的导航模型同步收敛。
- 结果：`physical-editing-document.ts`、`canonical-semantic-lines.ts`、`structural-line-model.ts`、`blockquote-structural-separators.ts`、`line-visibility.ts` 现在都不再引用富投影（`MarkdownDocument` / `MarkdownBlock` / `BlockquoteBlock` / `InlineLine`）。
- 验证：typecheck 通过、lint 干净、editor-core 26 文件 / 307 测试全绿、生产 `code-editor.test.ts` 271/273（仍只剩 2 条预存 bare-marker 失败）、全量 2764 passed / 1 skipped / 13 failed，失败集合与前一至四轮完全一致，无新增。
- 仍依赖富投影：`block-decorations.ts` 的装饰路由与签名（`blockMap.blocks` + 投影 DTO）、interactions/commands 的投影 DTO、`context/block-tree`、`active-block.ts` 的兼容投影。

## 同轮追加 6：装饰路由与签名脱离富投影（RF602 收尾）

- `createBlockDecorations` 的顶层遍历改为 canonical root nodes：容器交给 canonical 容器路径（不再用 `block.startOffset` 反查 plan，删掉了 "Missing canonical container" 抛错分支），叶子经 `canonicalLeafView(node, snapshot)` 生成的 DTO 进入既有 widget/preview 分支。
- 新增 `createCanonicalContainerSignature(node)`：容器签名用 `kind:node.id:startOffset:endOffset`。`node.id` 是 `kind@ancestry#hash(自身源码)`，即整棵子树的源码指纹，因此嵌套 inline/marker 编辑仍会使缓存失效（"inline markers change 时刷新签名" 的两条测试继续通过）；叶子签名继续由 `createBlockDecorationSignature` 基于 canonical DTO 生成（含 inline 指纹）。冻结签名期望已更新为 canonical 形式。
- `ActiveBlockState` 新增 `activeRootNodeId`（canonical 根级节点，`createActiveBlockState` 本就在算 `rootChild`）；装饰上下文的 `activeBlockId` 改为它，scoped-selection 路径的 `collectSelectionAffectedBlocks` 改为 `collectSelectionAffectedNodes`（用 `activeRootNodeId` + `snapshot.nodeById`），span 用 `node.source`。
- active 分支的三个判定改为 canonical 节点：`activeBlockquoteInContentEdit`（模型行的 quote-marker 段）、`activeCodeFenceInContentEdit`（`node.source` + `data.fence`）、`activeListLineStart`（节点 kind）；定义索引改为 `snapshot.tree.referenceDefinitions` / `footnoteDefinitions`。`block-decorations.ts` 至此不再引用 `blockMap`/`activeBlock`（DTO 别名改为 `MarkdownBlock`，由 `canonicalLeafView` 提供）。
- 验证：typecheck 通过、lint 干净、editor-core 全绿、生产 `code-editor.test.ts` 271/273（仍只剩 2 条预存 bare-marker 失败）、全量 2764 passed / 1 skipped / 13 failed（失败集合与前几轮一致，无新增）。
- **Electron 编辑体验探针**（真实生产编辑路径，非像素测量）：先单 case 验证机制（`blockquote-structural-separator-navigation` → `"pass": true`、`failures: []`），再跑完整矩阵 → 79 个 case/step 中 **5 条失败**，全部属于同一族：`legacy-list-a-bare-dash…`、`legacy-list-a-bare-ordered-marker…`、`legacy-paragraph-ime-composition-preview-after-a-bare-dash…`、`legacy-list-ime-composition-preview-after-dash-space…`、`legacy-list-native-chinese-insert-on-a-whitespace-only-line…`。该族与 `packages/markdown-engine/src/parse-block-map.test.ts` 的预存失败（bare `-` / `1.` 现在提交为列表）以及 `code-editor.test.ts` 的 2 条失败同根因，属引擎在飞改动，与本轮装饰/导航迁移无关；blockquote、结构空行、嵌套渲染、装饰与导航相关的 case 全部通过。产物日志：`.artifacts/probe-editing-experience-full.log`。

## 同轮追加 7：探针驱动的嵌套渲染修复 + 全量探针体检

- **修复真实缺陷（探针发现）**：`cm-math-preview-blockquote` 类此前**只存在于 CSS**（`markdown-render.css:230`），没有任何代码添加它 → 引用内块级公式渲染成独立的蓝色圆角面板而不是融入引用。`appendInactiveDecorationsForBlock` 的 blockMath 分支现在在 `containerContext.type === "blockquote"` 时传入该 className；新增合同测试同时断言引用内公式带该类、根级公式不带。**`npm run test:blockquote-typora-visual` 由 3 条失败转为 `"pass": true`、`failures: []`**。
- **探针体检结果**（真实 Electron 路径）：
  - `test:blockquote-typora-visual`：修复后 **pass**（此前 3 条 quote-math 样式失败）。
  - `test:mermaid-footnote-render`：**pass**（异步 Mermaid/KaTeX 预览渲染正确，验证 RF603 异步生命周期切片）。
  - `test:table-layout`、`test:empty-document-layout`：**pass**。
  - `test:editing-experience`：79 个 case/step 中 5 条失败，全部是 bare `-`/`1.` 现在提交为列表的引擎族。
  - `test:editor-behavior`（oracle 矩阵）：2541 targets 中 **29 条 unexpected-mismatch**，全部同一 aspect：`physical-geometry` 的**引用/列表内代码围栏标记行 visibility=collapsed**（oracle 期望 visible）。机制：`.cm-inactive-code-block-fence { display: none }`（该 CSS 自 HEAD 起未改动）被应用到容器内围栏行；决定应用它的是 `appendCanonicalContainerDecorations` 内既有的 canonical 容器叶子路径（父/运行时 agent 的在飞代码，本次未改动）。**不是本次切片引入**，但需要父确认并决定是改 CSS 还是改容器内围栏的装饰策略。
  - `test:table-focus-scroll`：**失败**，`Missing active table cell during navigation`。我用一次性 jsdom 复现（35 行表、从第 30 行连续 ArrowDown）确认：表内导航（30→35）焦点与 `data-active` 标记均正确，仅在越过**最后一行**时按预期退出表格；探针用的是 48 行表、从第 30 行向下 8 步（仍在表内）。因此该失败是 Electron 布局/滚动层面的问题（很可能是行数变化触发 widget 重建 + 滚动后再聚焦），**未能在 jsdom 复现**，列入待查项（一次性复现文件已删除，未留在仓库）。

## 同轮追加 8：容器内代码围栏标记行可见性（oracle 分歧 29→5）

- 由 `test:editor-behavior` oracle 矩阵定位：29 条 unexpected-mismatch 全部是 `physical-geometry` 中**引用/列表内代码围栏标记行 visibility=collapsed**（oracle 期望 visible）。根因是 `.cm-inactive-code-block-fence { display: none }` 被应用到容器内围栏行。
- 修复：`appendCodeFenceDecorations` 新增 `concealFenceLines`（默认 true，根级围栏行为不变）；容器路径（`appendInactiveDecorationsForBlock` 的 `insideContainer` 标记，由 canonical 容器遍历传入）保持围栏标记行可见，使容器的 rail 与行盒连续。
- 证据：`test:editor-behavior` **unexpected 29 → 5**（verified-runner 2338 → 2362）；`test:blockquote-typora-visual` 仍 **pass**；编辑体验探针 **blockquote 组（16 case，含引用内围栏输入）全部 pass（failures: []）**；全量单测 2766 passed / 1 skipped / 12 failed（仍是 11 条 engine/metrics 预存 + baseline 漂移，无新增）。
- 剩余 5 条 unexpected 的定位（下一轮，**含一处需父仲裁的契约冲突**）：
  1. `list-blockquote-enter` [physical-geometry]：列表内引用空行 `  > ` 实际 `collapsed`、oracle 期望 `visible`。机制已确认来自 **adapter 的第二套结构空行折叠** `packages/codemirror-adapter/src/canonical-separators.ts`（`createCanonicalSeparatorField`，与 editor-core 的 `appendInactiveBlankLineDecorations*` 并存 → 审计所说 "one owner" 尚未达成）。但**直接改它会打破 adapter 自己的 6 条测试**（`canonical-separators.test.ts` 明确期望 `- > al\n  > \n  > pha` 这类列表内引用空行被折叠，我已尝试并立即回滚、回滚后 adapter 7 文件 65 测试全绿）。即：**adapter 测试契约与冻结 oracle 契约相互冲突**，需要父决定以哪边为准（改折叠谓词 + 改 adapter 测试，还是调整 oracle 期望/该 case 的 manifest）。
  2. 4 条 `matrix-arrowup-path-{3,6,8,9}` [selection] repeat：重复 ArrowUp 落点期望 9/11、实际 4/6（差 5），属结构空行导航落点语义，需要该 case 的输入与 checkpoint 定义才能定位。

## 本次会话收尾（M6 仍未完成）

**已完成并验证**（详见上文追加 1–8）：RF701 嵌套渲染（零宽 widget/跨行 replace/容器行盒/嵌套 heading）、恢复 typecheck 的 snapshot 消费者迁移、表格光标偏移空间 bug、RF602 五片（解析路径、物理行几何、语义角色、导航分隔符、装饰路由与签名）全部脱离富投影、RF603 异步 widget 生命周期与测量、引用内块级公式 quote 样式修复、容器内代码围栏标记行可见性修复。

**最终状态**：`tsc --noEmit -p tsconfig.renderer.json` 无输出；editor-core + codemirror-adapter **33 文件 / 374 测试全绿**；lint 0 error；全量单测 2766 passed / 1 skipped / 12 failed（11 条 engine/metrics 预存 + 1 条冻结 baseline 漂移）；oracle 矩阵 unexpected **29 → 5**；blockquote 视觉探针、mermaid 预览探针、table-layout、empty-document-layout pass；编辑体验探针 blockquote 组 16 case 全 pass。

**未完成 / 待父决策**：
1. `fixtures/performance/editor-foundation-current-baseline.json` 冻结基线漂移（`open` 计数器与 `edit/orderedListEdit` 的 `invalidatedNodes`）——是否重新生成由父决定。
2. 5 条 oracle 分歧：
   - `list-blockquote-enter:primary:physical-geometry`：**adapter 测试契约（折叠）与 oracle 契约（可见）冲突**，需父仲裁；我尝试修改 `canonical-separators.ts` 谓词后立即回滚（adapter 7 文件 65 测试保持全绿）。
   - `matrix-arrowup-path-{3,6,8,9}:repeat:selection`：这 4 个键**已在 `active-calibration.ts` 的 `retainedKnownTargetKeys` 中声明为历史缺陷**，却被报成 `unexpected-mismatch`（known-defect 95 vs 保留 107），高度疑似分类/记账问题而非导航行为缺陷；已派子代理按"manifest 期望值 / 历史观测值 / 实际值"三方比对追查。
3. RF602 剩余：interactions/commands 的投影 DTO、`context/block-tree`、`active-block.ts` 的兼容投影；RF604：editor-core 删除与 renderer 工厂切换（已派子代理出可执行计划）。
4. `test:table-focus-scroll` 失败（`Missing active table cell during navigation`）：jsdom 复现显示表内导航正确、仅越界退出，属 Electron 布局/滚动层面待查。
5. 包体积预算仍 FAIL。

**工作区**：未提交、未推送、未标 M6 完成；旧 worktree 未触碰。

## RF604 执行计划（子代理取证，已由父抽样核实）

- 已核实的关键事实：`packages/editor-core` 无 `package.json`、无任何依赖指向它，`@fishmark/editor-core` 只是 5 处路径别名（`tsconfig.base/renderer/vitest` + `vite/vitest.config`）；`fixtures/architecture/editor-foundation-guard.json` 恰好 **57 条例外全部是 `boundary.editor-core` 的 `@codemirror` 债**，且 `src/main/editor-foundation-architecture.test.ts` 强制"声明集合 == 扫描集合"→ **任何带动 `@codemirror` 的文件迁出必须同一次改动里删掉对应例外**；`markdown-presentation` 目前的生产消费者只有 editor-core 内 3 个文件（`active-block.ts`、`table-cursor-state.ts`、`decorations/block-decorations.ts`）。
- 分工路线（体量：editor-core 共 80 文件 / 16366 行）：
  - **Phase A（现在可做）**：A1 `active-block.ts` + `table-cursor-state.ts` → `editor-model`（零 guard 改动，**已派子代理执行**）；A2 性能计数契约 → adapter；A3 `editor-view-mode.ts` → adapter；A4 表格命令包装 + table-context → adapter；A5 快捷键/keymap → adapter。
  - **Phase B（受 RF602/603 阻塞）**：B1 `interactions/**` → adapter；B2 装饰构建拆分（纯 plan → markdown-presentation，CM 部分 → adapter）；B3 widgets + 代码高亮 → adapter（附 math/Mermaid 生命周期与图片测量）；B4 扩展工厂 → adapter + **renderer 工厂切换**（最高风险：扩展顺序、`onSemanticCommands` 契约、`semanticCommands` 可空不变量、adapter 不得依赖 `src/**`）；B5 性能探针 → adapter。
  - **Phase C**：C1 纯逻辑（语义角色/物理行/结构行/可见性/隐藏 marker/source-utils/line-parsers 等）→ `editor-model`/`markdown-engine`；C2 删除包 + 5 处别名 + guard 包条目/规则/57 例外 + `editor-foundation-architecture.test.ts` 的 `productionFiles` 三处真实路径读取（**必须先删测试里的读取再删文件，否则 ENOENT**）+ 文档声明。
- 并发禁区：`src/renderer/code-editor.ts`（A1/A3/A4/B4/B5 串行）、guard fixture（每个迁出步骤的同一写入者）、各 `index.ts`（串行）。
- 删除前必须已完成的验证：四份 tsconfig typecheck、architecture guard、`npm run lint`、`npm run test`、`npm run perf:bundle`（当前 FAIL）、以及删除**之后**（不是只改 import 之后）重跑行为探针。

## 子代理并行结果（父已复核）

**D · RF604 / A1 已完成并通过父复核。** `active-block.ts` + `table-cursor-state.ts` 及其测试迁至 `packages/editor-model/src/active/`（原文件删除），29 个消费者重指，`editor-core/src/index.ts` 改为从 `@fishmark/editor-model` 重导出；另需一处**计划外的必要修改**：`src/main/editor-foundation-architecture.test.ts:128` 的 `readFileSync` 真实路径同步改到新位置（否则 ENOENT）。父复核：`tsc --noEmit -p tsconfig.renderer.json` 零诊断；architecture guard **234/234 绿**（此前口头说的 242 有误，该文件实际 234）；改动范围不含 fixtures/docs/canonical-separators/导航文件。

**A · ArrowUp 四条 = 冻结 fixture 记账过期，不是导航回归（零产品代码改动）。** 三方字面值：manifest 期望 `{9,9}/{9,9}/{9,9}/{11,11}`、历史 fixture 池 `{2,2}`、实际 `{4,4}/{4,4}/{4,4}/{6,6}`。实际值等于"文档顶部 ArrowUp 无法上移 → CM 退化为行首 → normalizer 前移到首个可见字符"的既有保留缺陷，10 条 arrowup path 中有 6 条如实记录了该值，只有这 4 条仍指向过期的池值 `{2,2}`（且 `{2,2}` 在当前构建里不可达：它落在隐藏前缀内，会被 `line-visibility.ts:269-271` 无条件前移）。**父侧动作（fixture 属 owner territory）**：为这 4 个键单独补池值（`current-observations.ts:7256/7312/7396/7445` → `{4,4}/{4,4}/{4,4}/{6,6}`），并重新推导 `active-calibration.ts:132` 的 `calibrationHash`（`createCalibrationHash` 会哈希每个缺陷的 target+observed+reason）。另一读法是让 ArrowUp 绑定接管"无法上移"（no-op）——但那会同时翻转 path-1/2/4/5 与 8 个 arrowdown 保留键的冻结期望，属矩阵级策略，已按"会改动其他冻结期望就不动"停止。

**B · `list-blockquote-enter` 契约冲突为伪命题。** adapter 的 `isQuoteSeparator` 明确豁免光标行（`canonical-separators.ts:11`），且 oracle 同样要求非光标行折叠（`matrix-enter-path-8:primary:physical-geometry` 期望 `collapsed` 且为 verified-runner）→ **不要动 adapter 谓词**。真正回归在未提交的 canonical 容器遍历 `block-decorations.ts:365-372`：把列表续行的**整个前缀**标成 `cm-active-list-source-prefix`（`position:absolute; width:0`）→ 吞掉引用块在流内的 caret 锚 → `.cm-line` 高度 0。旧代码只标行首水平空白。已按 Option A 派发修复（`consumeHorizontalSpace` 收窄 mark 范围 + 补回归测试），验收标准：oracle `unexpected 5 → 4`，且 `matrix-enter-path-8` 保持 verified。

**探针环境警告（重要）**：并发跑 Electron 探针会互相干扰——A 观测到一次 `unexpected=15` 的瞬时结果（紧接着的同环境复跑恢复 5），另有一次因硬上限 180s 直接 abort。**验收时必须在工作区静止、无并发探针的情况下单独跑一次 oracle**；单次异常计数不可当信号。

**E · 回归修复已完成，父在静止树上独立验收通过。** 修改仅 `block-decorations.ts` 列表续行分支 + `block-decorations.test.ts` 两条新合同（无既有期望改动）：`sourcePrefixEndOffset = consumeHorizontalSpace(source, line.range.startOffset, line.contentEndOffset)`，mark 范围与 `createListItemLineAttributes(..., "continuation", sourcePrefixLength)` 都用该空白末端。**父独立复跑 oracle（工作区静止、无并发探针）：`verified-runner=2363 / unexpected=5`，`list-blockquote-enter|primary|physical-geometry` 已从 unexpected 列表消失（转 verified-runner），`matrix-enter-path-8|primary|physical-geometry` 保持 verified** —— 与 E 预测的"恰好一条翻转"一致。

**剩余 5 条 unexpected 全部是冻结 fixture 记账类**（不是行为缺陷）：4 条 `matrix-arrowup-path-{3,6,8,9}:repeat:selection`（A 已深挖证明）+ 1 条 `matrix-enter-path-1:repeat:physical-geometry`（同样是 `active-calibration.ts:97-99` 里保留的 known-defect 键、记录的 `observed` 值已过期，与 arrowup 四条同类）。**owner 动作**：一次干净运行后重新记录这些保留键的 `observed` 值（`current-observations.ts`）并重推 `active-calibration.ts:132` 的 `calibrationHash`；这样能一并覆盖 `matrix-enter-path-1`。

**探针环境警告（已被父实测确认两次）**：并发跑 Electron 探针会产生**假阳性**——父在 E 收尾期间跑的一次得到 `unexpected=15`（多出 11 条 `physical-geometry`，连已修好的 `list-blockquote-enter` 都被误报为 mismatch），紧接着的静止树复跑恢复为 `unexpected=5` 且该项 verified。**任何探针验收都必须在无并发 Electron/Vite 的情况下单独运行；单次计数不得作为信号。**

## 证据

- `npm run typecheck` 通过（全配置）；变更文件 ESLint 无输出。
- `packages/editor-core/src/decorations/block-decorations.test.ts` 68 通过，含 3 条新增嵌套渲染合同：container 内 active 行点 widget 存活、跨软换行 replace 不重复、嵌套 heading marker 仅非 active 隐藏。
- `src/renderer/code-editor-canonical-rendering.test.ts` 5 通过（父的 2 条生产合同 + 本次新增 3 条：软换行图片不重复预览、active/inactive 列表行硬换行 widget 均为 1、嵌套 heading marker 只在非 active 行隐藏）。
- table-cursor-state 7、table-context 3、editor-derived-state 4、inactive-block-decorations 5、editor-performance-probe 4 通过。
- 全量 vitest（默认并行，含本轮 RF602 清理）：2688 passed / 1 skipped / 13 failed，失败文件 5 个。隔离复跑后，稳定失败为 11 条（全部在本次未触碰的 engine/metrics 路径）+ 1 条冻结 baseline 漂移；另有 `editor-performance-probe`（首条用例 15s 预算）在全量并行负载下超时，单独复跑 4/4 通过。本轮另观察到 `src/main/generate-icons.test.ts` 与 `src/main/editor-foundation-architecture.test.ts` 曾在全量运行中抖动、复跑通过。

## 必须由父决定的红色项（不得据此宣称 M6 通过）

1. **`fixtures/performance/editor-foundation-current-baseline.json` 漂移**（冻结 M5 证据，本次未改动该文件）：
   - `open`：`counters.fullParse` 4→2、`parserEntries.parseMarkdownDocument` 1→0。原因：本次移除扩展构造时对空串的真实解析调用，这正是 M6 审计要求的"计数器必须反映真实 parse"。相应地 `editor-performance-probe.test.ts` 中旧断言 `open.parserEntries.parseMarkdownDocument > 0` 改为断言真实 `open.counters.fullParse > 0` 且 legacy entry 为 0。
   - `edit` / `orderedListEdit`：`invalidatedNodes` 19501→20501。同一 fixture 的节点重建数变化，来自在飞的 canonical parse 改动（`fullParse`、`cacheHit`、`incrementalParseWindow` 均不变），与装饰层无关。请父决定重新生成 baseline，还是先修 engine 侧漂移。
2. **稳定预存失败 11 条（非本次引入，未修）**：`packages/markdown-engine/src/parse-block-map.test.ts` 8 条（bare `-` / `1.` 现在提交为列表、task marker 进入 item inline、blockquote multi-line inline 合并、CRLF 绝对偏移等）、`src/renderer/document-metrics.test.ts` 1 条、`src/renderer/code-editor.test.ts` 2 条（"commits a trailing (ordered) marker…"，与 engine bare marker 同一根因）。这三处都可在不涉及本次改动的文件里独立复现。
3. **并行负载抖动 2 条（非稳定失败）**：`packages/editor-core/src/performance/editor-performance-probe.test.ts`（首条用例 15s 预算，全量并行时超时；隔离 4/4 通过）与 `src/main/generate-icons.test.ts`（ICO 转换时序；隔离通过）。本轮曾在全量运行中观察到 `src/main/editor-foundation-architecture.test.ts` 同类抖动后自行通过。


## M6 未完（后续切片，不要越界）

- RF602 余项：装饰层与导航仍通过**富投影** `MarkdownDocument` 派生语义（`SemanticLineRole` 由 `projectMarkdownDocument` 的 blocks 计算，`block-decorations` 顶层仍按 `activeBlockState.blockMap.blocks` 路由）。要真正"清除 whole rich-document 生产派生"，需要把语义角色与装饰路由改成直接读 canonical tree / render plan（`ActiveBlockState.activeNodeId` 已具备），并把角色计算移入 editor-model；这一步必须连同 blank-line / structural-separator / extra-blank 与导航探针一起验证。
- RF603：widget 与异步生命周期、测量边界。
- RF604：删除 editor-core 与旧 physical/active 模型、renderer 工厂切换，并重跑 bundle 预算与完整行为探针。
- 包体积预算仍 FAIL，M5 最终性能验收 pending。

## 工作区状态

未提交改动原地保留，未以旧 worktree 覆盖，未提交、未推送，未标 M6 完成。

## M6 收尾续（owner 决策 A/B + RF-604 Phase A）、父独立复核

本节由父在静止工作树上独立复核后写入；**更正上一节两处由子代理给出但经实测不成立的结论**。

### 更正：ArrowUp 四条不是"6 条如实记录"的记账过期

- 上一节第 138 行称"10 条 arrowup path 中有 6 条如实记录了 `{4,4}`/`{6,6}`"、"`{2,2}` 在当前构建里不可达"。**实测否证**：历史 fixture 的真实值是 `path-1={0,0} path-2={2,2} path-5={4,4} path-7={9,9} path-10={8,8}`，`path-3/4/6/8/9` 全是 `{2,2}`；且 `path-2`/`path-4` 今天仍然落在 `{2,2}`（它们不是 unexpected），所以 `{2,2}` 可达。
- 更正后的成因：这 4 条的源首行是多段 marker 前缀（`- - alpha` / `> - alpha` / `- > alpha` / `- > - alpha`），`{2,2}` 是前缀内部的偏移、`{4,4}`/`{6,6}` 是**首个可见内容字符**。RF-602 canonical 容器前缀归一让"文档顶部 ArrowUp 退化到行首"之后的 normalizer 从停在 marker 内部推进到内容起点。**这是会话内真实行为变化**，期望契约（`{9,9}`/`{11,11}`）不变，因此仍是保留缺陷——不是纯记账过期，也不是修复。

### 更正：`matrix-enter-path-1` 的第 5 条是并发污染

上一节第 146 行把 `matrix-enter-path-1:repeat:physical-geometry` 与 ArrowUp 四条并列为"记账类"。父在静止树独占复跑（无并发探针）得到 `known-defect=95 / unexpected=4`，该键为 `known-defect-observed`。它是并发探针的假阳性（同族证据：`.artifacts/editor-behavior/report-1789830288*` 那次 `unexpected=15`）。**结论：验收探针必须在工作区静止、无并发 Electron/probe 的情况下单独运行。**

### owner 决策 A：oracle 冻结记账重录（已完成并验收）

范围由 5 条缩为 4 条（见上）。owner 在两种落盘方式中选择"历史文件不动"：`fixtures/editor-behavior/current-observations.ts`（RF-001 不可变历史记录，其文档明确"不得从当前失败回录历史基线"，身份 `fnv1a32-2a007600` 已被归档文档引用）保持 **byte-identical**；重录改以 `fixtures/editor-behavior/active-calibration.ts` 新增的显式列表 `editorBehaviorReObservedKnownDefects`（4 条）表达，每条写明被取代的历史值、未变的期望契约、成因与干净运行 provenance（run `e6e5abb8-19fa-4b5a-a645-03772d227b69`，8994 ms，4 条 mismatch）。保留集仍精确 **107**，其中 **103 条与历史对象 `toBe` 恒等**，另加 fail-closed 不变量（重复 / 非保留 / 缺失 / 未生效一律抛错）。`calibrationHash`：`fnv1a32-12fd6881` → **`fnv1a32-ec70a8b9`**（用仓库自身 `createCalibrationHash` 计算；并用同一路径对 107 条历史对象复现出旧 hash 作为正确性证明）；`manifestHash`/`contractHash`/`runId` 未改。`packages/test-harness/src/scenarios/editor-behavior-runner-protocol.test.ts` 的"与历史恒等"断言改写为"103 条恒等 + 4 条显式重录"，**严格更强、未删覆盖**。

**父独立验收**：独占静止树 `node scripts/probe-editor-behavior.mjs` → `pass true`、`verified-existing=79 / verified-runner=2363 / known-defect=99 / unexpected=0 / not-run=0`、exit 0（报告 `.artifacts/editor-behavior/decision-a-verify.json`）。测试侧 `vitest run packages/test-harness/src/scenarios` 10 文件 / 91 测试全绿。

### owner 决策 B：重新生成冻结性能基线（已完成）

`fixtures/performance/editor-foundation-current-baseline.json` 与旧基线相比**仅 4 个计数值变化**：`open.fullParse 4→2`、`open.parserEntries.parseMarkdownDocument 1→0`（M6 审计要求的"计数器反映真实 parse"：不再在扩展构造时解析空串），`edit`/`orderedListEdit` 的 `invalidatedNodes 19501→20501`（在飞 canonical parse 的节点重建数；`fullParse`/`cacheHit`/`incrementalParseWindow` 不变）。其余字节未动、未手改数值；生成走与契约测试相同的测量路径（一次性写入器跑完即删）。**`src/renderer/performance/editor-foundation-baseline.test.ts` 由 1 条失败转为 14/14 通过。**

### RF-604 Phase A / A2：性能计数契约 → adapter（已完成并验收）

`INCREMENTAL_STRUCTURE_CACHE_REASON` + `EditorPerformanceCounters` + `EditorPerformanceParserEntries` 迁入新模块 `packages/codemirror-adapter/src/performance-counters.ts`（**零 import**，不引入 `@codemirror/*`，`boundary.editor-core` 例外集保持 57 不变）。`measureEditorPerformanceProbe` 与其余 probe 类型留在 editor-core（Phase B5）；两个 renderer 消费者改指 adapter；`editor-core/src/index.ts` 直接从 adapter 重导出以保持公共面不变（`noUnusedLocals` 下无死的值导入）。**父独立验收**：`tsc -p tsconfig.renderer.json` 除一个在飞外来文件的 TS6133 外零诊断、`tsc -p tsconfig.vitest.json` 零诊断、architecture guard **234/234 绿**、guard fixture 未被该切片改动、`editor-performance-probe.test.ts` 4/4。

### RF-603 尾项 / `test:table-focus-scroll`：已定位根因（非产品回归，探针环境归一化缺口）

失败点是**第 0 步（点击之后、任何 ArrowDown 之前）**，不是滚动/视口问题。父的仪器化诊断：`document.hasFocus=false`、`activeElement` 已经是 `.cm-table-widget-input`、但全局没有任何 `data-active="true"`。该探针窗口是 `show:false`，所以 `:focus` 选择器**永不匹配**，探针实际完全依赖 `data-active`。根因：`packages/editor-core/src/decorations/block-decorations.ts:150-156` 的 `createSelectionScopedBlockDecorations` 在 `!options.hasEditorFocus` 时返回 `didUpdateDecorations:false`，`extensions/markdown.ts:683-694` 因此只记录签名、不派发；而 `runtime.hasEditorFocus` 只由 DOM focus 事件喂养，`show:false` 窗口永不投递 `focusin`，于是每次 selection-only 事务对装饰都是 no-op，表格 widget 一直保留构建时的 `activePosition:null`。`activeTableCursor` 本身**没有**被焦点门控（`createActiveBlockDecorations` 上下文 :279），所以产品的表格渲染规则与焦点无关，只有这条性能快路径提前返回。**引入提交为 `75e1f3c`（2026-05-16 性能优化），不是本次在飞的 RF-602 canonical 迁移**；`a9d15de`（引入该探针的提交，2026-05-06）时每次 selection-set 都会全量重建，所以当时通过。约定证据：其余 `show:false` Electron 探针都显式补发合成 `focusin`（`cursor-hit-geometry-probe.ts:204`、`empty-document-layout-probe.ts:256`、`list-geometry-probe.ts`、`markdown-editing-experience-probe.ts:221`），只有该探针没有。**修法：探针侧按同一约定归一化焦点，不改产品代码。**

**已修复并由父复跑确认（产品代码零改动）**：`src/renderer/table-focus-scroll-probe.ts` 现在按同一约定补发 `editorRoot.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))`，并把失败诊断增强为「CM selection + 派生 table cursor + widget start offsets + 合成 focusin 一次性恢复判定 + 真实 cell id（原先读 `.cm-table-widget-cell` 的 `dataset.tableCell` 恒为 `undefined`，id 实际在内层 input 上）」+ 10 帧有界重试；视口与外层页面滚动断言未放宽。父在静止树独占复跑：`npm run test:table-focus-scroll` exit 0，9 个采样（30:0 → 38:0），每个采样 active cell 都在 `.cm-scroller`（top 0 / bottom 420）内且 `window.scrollY`、`document.documentElement.scrollTop`、`document.body.scrollTop` 全为 0，`scroller.scrollTop` 2086 → 2491。

**仍然存在的潜在缺口（记录，未修，owner 决定）**：未聚焦期间（页面从未收到 `focusin`）的 selection-only 事务不会重建装饰，即 `runtime.hasEditorFocus === false` 时 activity 呈现保持陈旧。真实用户可见影响有限（真实点击/键盘都会先让编辑器获得焦点，随后快路径立即重绘）；可复现路径是"窗口从未获得焦点时程序化移动选区"。两种候选修法：① 收窄 `block-decorations.ts:150` 的提前返回，仅在表格光标未移动时跳过（比较 `mode/tableStartOffset/row/column`，影响面 = 失焦期间每次光标变化多重建两个根节点）；② 在 `extensions/markdown.ts:673` 把标志改为 `runtime.hasEditorFocus || view.dom.contains(view.root.activeElement)`（影响面更大：失焦时也会恢复 active-block 源标记，需要与 `syncBlurDecorations` 一起对齐）。两者都是产品行为改动，本会话均未应用。

## 本会话增量：RF-604 Phase A / A3-A5（已完成并父复核）

`editor-view-mode.ts` + `commands/{table-commands,table-context,list-commands,toggle-block-commands,toggle-inline-commands}.ts` + `context/block-tree.ts` + `extensions/markdown-shortcuts.ts` 与其 7 个测试文件共 **15 个文件**迁入 `packages/codemirror-adapter/src/`；`boundary.editor-core` 例外 **57 → 55 → 50 → 41 → 38**（四步各精确命中）。adapter 内部一律相对兄弟导入、零包内自引用；`@fishmark/editor-core` 公共导出面不变、`src/**` 零改动。两条经父仲裁的修法见 `docs/progress.md` 对应小节（`runMarkdownTab` 等价值替换；table/toggle 包装器必须与 shortcuts 同批迁出）。

**最终静止树验收（父独立执行）**：`npm run typecheck` exit 0；`npm run lint` 0 error / 8 既有 warning；guard **234/234**（38 例外）；adapter+editor-core **31 文件 / 362 测试**（搬迁前后总数不变）；全量 vitest **2769 passed / 1 skipped / 11 failed**（失败 = 已知预存 `parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2，无新增，冻结基线漂移已消失）；oracle `unexpected=0 / known-defect=99 / not-run=0`；`test:blockquote-typora-visual`、`test:mermaid-footnote-render`、`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` 全部 exit 0；`test:editing-experience` 失败恰为已记录的 5 条 bare-marker 族（无新增）；`perf:bundle` 仍 FAIL（初始 chunk 344027/300000、gzip 92194/90000、totalInitialGzip 267009/260000、totalJsGzip 1436858/1430000；所有 forbidden-group 与 required-lazy-chunk 检查 PASS）。

### 另一处本会话发现、未修（供 owner 仲裁）
`src/renderer/editor-behavior-manifest-runner.test.ts` 的运行会在 stderr 打出 `CodeMirror plugin crashed: Error: Calls to EditorView.update are not allowed while an update is in progress`：调用链为 `code-editor.ts:682 replaceDocument → view.setState → ViewPlugin 构造 → extensions/markdown.ts 构造器里的 recomputeDerivedState(force) → applyBlockDecorations:651 view.dispatch(...)`。插件在 `setState` 期间非法派发会被 CodeMirror 捕获并吞掉（测试仍通过），但该 ViewPlugin 实例的首次装饰应用会丢失，属"测试通过但运行时不可靠"的隐患；修法需要避开在 view plugin 构造期间 dispatch（例如改为 `requestMeasure`/微任务或在首次 update 时强制重建）。属产品行为改动，本会话未改。

## 剩余工作精确地图（供后续轮次，勿越界）

### RF-602 尾项（本会话 item 6）：富投影消费者清单
以下位置（`packages/editor-core` 已删除，故均为新坐标）仍消费富投影 `MarkdownDocument` / `MarkdownBlock`：`packages/editor-model/src/derived/editor-derived-state.ts`（导出派生状态的兼容字段 `markdownDocument`，并由 `createOutlineHeadings` 读投影 blocks 生成 outline id）、`packages/codemirror-adapter/src/extensions/markdown.ts`（`readStateMarkdownDocument`、链接与脚注查询、`findLinkAtOffset`/`findLinkInBlock`）、`packages/codemirror-adapter/src/decorations/{block-decorations.ts,canonical-leaf-view.ts,signature.ts}`（叶子 DTO）、`packages/codemirror-adapter/src/interactions/{types.ts,context.ts}` + `interactions/adapters/line-block-adapter.ts`（`activeState.blockMap.blocks`）、`packages/codemirror-adapter/src/table-context.ts`（`findBlockByStartOffsetDeep(activeState.blockMap.blocks, …)`）与 `.../block-tree.ts`（纯投影 DTO 遍历），以及兼容投影的制造者 `packages/editor-model/src/active/active-block.ts`（`blockMap` + `activeBlock`）。

**边界提醒（重要）**：`src/renderer/editor/App.tsx:1469-1473` 的 `activeBlock.type === "heading" ? activeBlock.id : null` **不能只改这一处**就删兼容投影——`setActiveHeadingId` 的值要与 outline 条目的 id 对齐，而 outline id 当前由 `createOutlineHeadings(markdownDocument)` 从**投影**生成。要真正删除兼容投影，必须先把 `createOutlineHeadings` 切到 canonical tree（并同步 outline 消费者的 id 语义）；而 M6 审计明确把 outline 消费者迁移划给 **RF-702**（"Do not silently enlarge M6 to their entire migration"）。因此建议：要么在 RF-602 尾项里先做 `createOutlineHeadings` 的 canonical 化与 id 契约重写，要么把兼容投影保留到 RF-702 一并收口，**不要**只改 App.tsx 造出两套 id 体系。

### RF-604 Phase B / C 的既有计划与两条新事实
- Phase B：B1 `interactions/**` → adapter；B2 装饰构建拆分（纯 plan → `markdown-presentation`，CM 部分 → adapter，保留 `EditorView.decorations.from(field)` 交付方式）；B3 widgets + 代码高亮 → adapter；B4 扩展工厂 → adapter + renderer 工厂切换（最高风险）；B5 性能探针 → adapter。
- **新事实 1**：`packages/editor-core/src/commands/codemirror-markdown-commands.ts` 依赖 `../interactions`（`resolveArrowUp`/`resolveArrowDown`），所以它**必须与 B1 同批**迁出；A3–A5 刻意把它留在原处。这也是 `table-commands.test.ts` 里 `runMarkdownTab` 调用被改写为等价的 `runSemanticCommand(view, planSemanticTab)` 的原因（见该文件的报告）。
- **新事实 2**：`context/block-tree.ts` 与 `commands/table-context.ts` 已随 A3-A5 迁入 adapter（现为 `packages/codemirror-adapter/src/block-tree.ts` 与 `.../table-context.ts`），但它们仍消费投影 DTO 与 `activeState.blockMap`（`table-context.ts` 里的 `findBlockByStartOffsetDeep(activeState.blockMap.blocks, …)`）——RF-602 尾项收口时**必须把这两处一起 canonical 化**，否则只是把投影债搬进 adapter 而不是消除它。同理，`commands/index.ts` 现在对这些命令是"经 adapter 的 re-export"，收口时要按新归属确定它是否还该存在。
- Phase C：C1 纯逻辑（语义角色/物理行/结构行/可见性/hidden-markers/source-utils/line-parsers 等）→ `editor-model`/`markdown-engine`（各自的 `*.test.ts` 同批搬）；C2 删包 + 5 处别名 + guard 的包条目/规则/例外 + `editor-foundation-architecture.test.ts` 的 `productionFiles` 真实路径读取（**先删测试里的读取再删文件**，否则 ENOENT）+ 文档声明。
- `npm run perf:bundle` 包体积预算仍 **FAIL**；M5 最终性能验收与 RF-702/703 都不在本会话范围。

### 验收纪律（本会话实测确认）
- oracle 探针**必须独占运行**：并发跑会产出假阳性（本会话两次实测：一次 `unexpected=15`、另一次把已修复项误报）；任何单次异常计数都要在静止树上复跑确认。
- 任何文件迁出 editor-core 若带动 `@codemirror`，必须在**同一次改动**里删掉对应 guard 例外（guard 强制"声明例外集合 == 扫描到的债集合"），且 guard fixture 同一时刻只能有一个写入者。

## M6 硬切换完成（RF-604 Phase B4/B5/C2，父已独立验收）

**已达成**：`packages/editor-core/` 被真正删除；生产 renderer 只经 `@fishmark/codemirror-adapter`(+`@fishmark/editor-model`) 公开 API；5 处路径别名移除；guard fixture 删除 `editor-core` 包条目与 `boundary.editor-core` 规则、`exceptions` 变为 `[]`，`boundary.editor-core` 的 57 条 CodeMirror 债务清零（38 → 33 → 8 → 3 → 0）。当前包列表就是 roadmap §4 的目标集合：`workspace-domain`、`workspace-application`、`workspace-infrastructure`、`markdown-engine`、`editor-model`、`markdown-presentation`、`codemirror-adapter`（+ `test-harness`）。

**最终验收证据（全部由父在静止树上独立执行）**：`npm run typecheck` exit 0；`npm run lint` 0 error / 8 既有 warning；`npm run build`（clean + renderer + electron + cli）exit 0；guard **234/234** 且 editor-core 例外 **0**；全量 vitest **2770 passed / 1 skipped / 11 failed**（失败恰为已知预存：`parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2，无新增）；oracle `unexpected-mismatch=0 / known-defect-observed=99 / not-run=0`；`test:blockquote-typora-visual`、`test:mermaid-footnote-render` pass，`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` exit 0，`test:editing-experience` 恰为已知 5 条 bare-marker 族（表格类 case 全 pass）；`perf:bundle` 仍为 4 个上限 FAIL（与 M6 前基线相比 ≤0.2%），15 个 forbidden-group（含 katex/mermaid）与 4 个 lazy-chunk 全 PASS，bundle source group 已无 `editor-core`。

**期间两处父仲裁**（细节见 `docs/progress.md`）：① `block-decorations.test.ts` 的 `createRequire("node:module")` 触犯 adapter 边界，改为静态 `import { JSDOM } from "jsdom"` + 新增类型声明文件 `packages/codemirror-adapter/src/jsdom-module.d.ts`（零断言变化、零抑制、零新增例外）；② `code-editor-semantic-runtime.test.ts` 原来 spy 公共入口取私有 adapter，工厂内迁后失效，改为两条真实公共 API 用例，并核对被移除的 stale-plan 断言在 `transaction-adapter.test.ts` 已有专门覆盖。

**仍未完成（不在"硬切换达成"的声明内，按依赖顺序）**：

**本次已一并收掉的两项**：
- **RF-602 尾项（完成）**：`createOutlineHeadings` 与渲染层 `deriveOutlineItems` 都切到 canonical tree，outline id 与 `ActiveBlockState.activeHeadingId` 统一为 canonical `node.id`（两侧同源）；`blockMap`/`activeBlock`/`projectSnapshotMarkdownDocument`/`EditorDerivedState.markdownDocument` **全部删除**（全仓残留 0），交互/表格层改 canonical（`TableCursorState.tableNodeId` + `findActiveTableBlock` + `interactions/canonical-blocks.ts`），`block-tree.ts` 与孤儿 `list-utils.ts` 删除。父验收：tsc 零诊断、guard 234/234、相关套件 54 文件 / 652 测试、全量 vitest 仅已知预存失败。仅按 owner 授权改了冻结基线**一个字段**（`outline.parserEntries.parseMarkdownDocument: 1 → 0`）。
- **RF-603 步 A（完成）**：表格 widget 的 7 组事件处理器与 12 处回调派发点加"cell 仍属本实例"活性判据，`destroy(dom)` 取消待发 IME 回落定时器；新增 7 条行为合同。**发现并消除真实潜在缺陷**：CodeMirror widget 池复用 DOM 元素时不调用旧 tile 的 `destroy`，旧实例的回落定时器从不取消且读陈旧 `data-table-start-offset`，可经 `runTableUpdateCell` 改写**另一张表**的 cell。

**仍需处理（按优先级）**：
0. **M6.5：外壳布局不变性 + VS Code 式侧栏（owner 已登记，与 M6 一起收尾）**。根因：正文可用宽度被外壳状态决定（`.app-layout` 的 rail 列 + `.workspace-shell` 的 outline 列 + `.cm-content` 的 `width:100%`/`clamp(64px,12vw,220px)` 视口相对 padding）⇒ 聚焦↔编辑自动切换与 outline 开合都会整篇重排（且带 transition 逐帧重排）。owner 已定：正文**固定 measure + 左右留白**；outline **与搜索都进同一个共享侧栏区域**（rail 图标切换 view container，**一块区域一份宽度**）；保留独立窄 rail（VS Code 模型，**阅读模式下不折叠**）；面板宽度**可拖拽**、写**全局偏好**（拖动中每帧只改 CSS 变量，**pointerup 落盘一次**；收起缓存宽度不写 0；加载时 clamp 但不回写被压小的值）；搜索取**单一实现**——`Ctrl/Cmd+F` 打开侧栏 Search 视图并删除现有内联查找 bar，两者共用同一份 CM search query；状态栏左侧偏移只跟随 rail、不跟随面板。决策已登记 `docs/decision-log.md`。参照 VS Code（已核 `src/vs/workbench/browser/layout.ts`）：单一 `sideBarPartView`，活动栏图标只切换区域内 pane composite，隐藏用 `getViewCachedVisibleSize()` 记住上次宽度，整张 grid 经 `IStorageService` 序列化 ⇒ **一块区域一份宽度**（非每面板一份）。切片：S1 固定 measure（**完成**：四组合 340px/16 换行行 → **0/0/0/0**，正文列恒 720.50px、首行 720.00、渲染行 31、换行行 16、文档高 1656.28，面板开合实测 0→248px 因此非空洞；附带修掉 `.cm-scroller` 单侧滚动条偷 10px 的偏心缺陷；S2 移除 rail 折叠后 −38px 残差归零）→ S2 共享区域骨架 + outline 迁入 **完成**（rail 常驻、`--fishmark-side-panel-width` 单值、`aside.side-panel[data-view-container]`、outline 作为嵌套视图保留主题钩子、`activeViewContainer + closingViewContainer` 状态）→ S3 搜索成为第二个 view container + 拖拽 + 全局偏好 **完成**（删除内联查找 bar、`Ctrl/Cmd+F` 打开侧栏 Search、唯一状态源仍是 CM search state；`.side-panel-resizer` 拖动中每帧只改 CSS 变量、pointerup 落盘一次、Esc 取消不写、键盘 ±16px；`ui.sidePanelWidth` 端到端偏好，收起不写 0、加载 clamp 只作用于显示、一份宽度共用；顺带修掉提示浮层与左停面板重叠）→ **S4 完成**（把"四组合绝对 X 一致"与"拖拽后面板宽度变化但正文行数/高度不变"固化为常备断言：`textColumnLeftModeTranslation = firstLineLeftModeTranslation = 0`、四项 spread 全 0、`failures: []`、`pass: true`；拖拽维度留白档 248/200 排版不变、`stored-360` 档因舞台 714px < 768px 触发 clamp 而单独报告）。**M6.5 全部切片完成，M6 + M6.5 父级最终验收通过（详见 `docs/progress.md` 文末"最终全量验收"与 `docs/test-report.md`）**；**owner 已明确认可全部验收（2026-09-20），M6/M6.5 标记 `ACCEPTED` 并收口**，按 owner 要求未提交未推送、工作区改动原地保留。
1. **RF-603 步 B 的锚点机制：owner 已决策移除（b），代码已删除**。过程留档：机制落地后契约始终未被证实（真实窗口残余 19–25px；且"机制锚光标 / 探针测停放锚点行"的歧义未澄清），并且引入了真实回归——`setViewMode` 读取 `view.coordsAtPos` 在 jsdom 下抛 `textRange(...).getClientRects is not a function`，使 `src/renderer/code-editor-canonical-rendering.test.ts` 从通过转为失败（父先防御式修复，随后按 owner 决策整体移除）。**现状**：`scroll-anchor.ts` 与其单测已删除，`editor-view-mode.ts` 按 HEAD 原文还原，`editor-view-mode.test.ts` 重写为不依赖几何的 5 条用例；adapter + 该文件 24 文件 / 270 测试全绿。**编辑器那条轴（wysiwym↔source 的 reflow）仍待解决**，正确做法是**块身份锚点**（CodeMirror `scrollSnapshot` 式：记录视口顶部所在块 + 块内相对偏移），它与下面第 2 条的异步高度变化缺陷共用同一机制；届时也需先定 A–E3 的度量/盒策略（见 `docs/progress.md` 的 M6.5 与 RF-603 步 B 记录）。
2. **未聚焦时异步预览长高会推移整个视口（已测量、未修）**：实测把视口推移**整整图片高度**（520.00px；页面级滚动 0/0/0）。根因：CodeMirror 在"编辑器未聚焦且近约 100ms 无滚轮/触摸"时跳过自身滚动锚定补偿。修法：复用 `scroll-anchor.ts` 在 `completeMountedWidget` 的测量前后补偿；原型卡在两点——`toDOM` 内不允许读布局（"Reading the editor layout isn't allowed during an update"），且 img `load` 触发时布局已移动，需块身份锚点，属单独改动。
2. **RF-603 附加发现（未修）**：同一条 DOM 复用路径每次重建会累积一整套 cell 监听器，旧实例被复用 DOM 长期保活；修法是把 cell 监听改成存放在 root 上的单份绑定集合，或让 `TableWidget` 放弃 DOM 复用——两者都触及挂载态行为。
3. **本会话更早发现、仍未修的两处产品行为候选**：未聚焦期间（页面从未收到 `focusin`）selection-only 事务跳过装饰重建（真实用户点击即恢复）；view plugin 构造期间非法 `dispatch` 被 CodeMirror 吞掉（测试通过但该实例首次装饰应用会丢）。
4. **RF-702 / RF-703**：HTML 导出切换；outline/metrics 改由 `EditorDerivedSnapshot` 驱动——注意渲染层 outline 与 `EditorDerivedState.outlineHeadings` 目前仍是**两条**派生（本次只统一了 id 契约与数据源语义），RF-703 应合并为"一套文档结构喂编辑器/大纲/指标/导出"。
5. **包体积预算**仍 FAIL（初始 chunk 344036/300000、gzip 92375/90000、`totalInitialGzipBytes` 267192/260000、`totalJsGzipBytes` 1437041/1430000；15 个 forbidden-group 与 4 个 lazy-chunk 全 PASS，source group 已无 `editor-core`）。
6. **M7–M10 其余**（RF-801/802/803 renderer/main 组合清理、RF-901/902/903 性能·E2E·安全门禁、RF-1001/1002 删除与最终验收）与 M5 最终性能验收。
7. **已知预存失败**：`parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2（全量 vitest 中恰为这 11 条），以及 `test:editing-experience` 的 5 条 bare-marker 族——同一引擎根因，非本次迁移引入。

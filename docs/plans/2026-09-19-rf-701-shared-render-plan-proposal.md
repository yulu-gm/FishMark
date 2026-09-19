# RF701 最小共享 render plan 提案

状态：只读设计，尚未启动实现；不计入 M5 验收完成项。依据 2026-09-19 当前工作区代码。

## 目标和事实

让真实编辑器的结构、物理行几何和 inline 都来自当前 revision 的 canonical snapshot。render plan 是带源码范围的显示决策，不是第二棵 Markdown AST；CodeMirror Decoration、DOM、widget、主题和测量仍留在 adapter/editor-core。

当前已有一棵真实递归树，但渲染链仍存在重新解释：

- `markdown-engine/src/parse/document-projection.ts` 的 `projectListRun/projectListWithin` 再调用 `readListScopes/readFlatListItems`；`promoteQuotedListItems` 再决定父子关系。`projectScopeItem` 和 `createBlockquoteLines` 再调用 `parseInlineAst`。共享函数减少规则分叉，但仍不是一次结构解释。
- `block-map.ts` 的 `ListItemBlock.children: readonly ListBlock[]` 无法表达列表项中的引用、代码块、数学块、表格或多个段落。`projectScopeItem` 把首个子列表之前的源码合成一段 inline；`flattenBlockquoteBlocks` 又压平引用层级。不能仅把该类型机械迁入 editor-model。
- `editor-core/src/decorations/block-decorations.ts` 的 `appendActive/InactiveListScopeDecorations` 只递归子列表；`appendListItemDecorations` 用首个子列表起点截断正文，再逐行解析 inline。引用分支依赖 `lines/innerBlocks`；列表样式深度用 `Math.floor(item.indent / 2)`，不是实际容器关系。
- `derived-state/editor-derived-state.ts` 仍由 rich document 构造旧 physical document、active block、table cursor 和 outline。仅替换一个装饰函数，不能宣称 rich projection 已退出运行链。
- `parse-markdown-document.ts` 在投影后识别、拆分脚注段落并补 inline；`decorations/table-widget.ts` 还会从单元格 text 重新解析 inline。它们必须有明确迁移边界。

## 最小接口和数据补齐

依 roadmap，在 `packages/markdown-presentation` 提供 `buildRenderPlan(tree, canonicalMetadata)`；首次提交必须接入 editor-core 的真实列表／引用装饰入口。返回按源码排序的语义角色、源范围、markers、inline 引用及 preview capability；引用 canonical node ID，不复制 `children` 成另一棵树，也不携带 CSS 类名或 DOM 对象。同一 document revision 复用同一 plan，编辑器和 export 均可消费。

adapter 单独按选区、焦点、source/rich 模式、活动表格坐标和 requestedRanges 投影 visibility/display state；这些交互状态不进入共享 plan，source-view gate 也保留在 adapter。物理行跨度来自 canonical 元数据及现有 snapshot 索引，显示层可请求 viewport 与活动容器所覆盖的范围；跨行 inline 在完整叶上解释，只裁剪显示范围，不逐行重解析。

| 数据 | 现状 | 必要处理 |
| --- | --- | --- |
| 容器关系、叶类型、源码范围、marker/task 范围、checked、list ordered/delimiter | canonical node 已有 | 直接引用，不添加镜像字段；样式深度按实际容器祖先计算 |
| 每行前缀、内容列、fence 角色、所属节点 | model physical snapshot 已有 | 共享该索引；为 lazy continuation、空行和跨行叶补完整性合同，禁止从 rich block 重建 |
| 段落／标题 inline | canonical leaf 已有 | 渲染完整叶 AST；inline 跨行节点按 range 裁剪，保留 original offsets |
| 表格单元格 inline | `MarkdownTableCell` 只有 text/source/content | 在 engine 首次语义构建时附加 cell inline，定义解析使用的源码范围和转义映射；widget 消费该 AST |
| 脚注定义和正文分段 | definition 索引已有，但显示段落在投影后拆分 | 将有效脚注定义的 source/content/marker 及正文分段纳入 canonical 构建；使用类型化 definition data，避免投影层造新段落 |
| list tight/loose 与空白显示 | list data 未记录 tightness；显示行为另行推断 | 仅在明确的间距合同需要时补 parser-owned tightness；共享 plan 只给 separator 角色，编辑器显示规则放 adapter，不能把 DOM 可见性写回 AST |

## 分步接入与删除边界

1. **先切列表／引用真实消费者。** plan 遍历 canonical 容器，调用已有叶装饰/widget adapter；同一源码段只能由一个入口生成 inline。生产 `createBlockDecorations` 和 selection-scoped 更新立即消费 plan，并使用 snapshot physical geometry。删除已替代的列表／引用逐行 inline、子列表专用递归和 marker/content 正则 fallback。此步仍允许其余块走旧入口，但不得并行渲染同一块；保留的 rich projection 依赖需明确列账。
2. **补齐 canonical 显示元数据并切其余叶。** 段落／标题直接用 leaf inline；表格和脚注按上表补齐。代码高亮、Mermaid/数学渲染、图片 URL 解析继续作为 adapter 能力，输入使用 canonical leaf 范围。删除 decorations 中 `parseInlineAst`、缺省定义扫描和脚注补解析。代码高亮 tokenization 不属于 Markdown 再解析。
3. **切活动态与物理行消费，收掉生产 rich 链。** active block、table cursor、outline、hidden markers、命中测试和结构空行使用同一 snapshot/plan 的查询；不复制旧 editor-core semantic context。逐个检查 `MarkdownDocument/ListItemBlock/InlineLine` 的运行期引用，移除 `createEditorDerivedState` 对旧 physical document 的构造，再停用 editor 的 rich-document cache。
4. **最后删除兼容投影语义。** 确认导出、CLI 等外部消费者后，将仍需要的旧形状改成只映射 canonical 的兼容 serializer，或迁移其消费者后删除。删除 projection 内 `readListScopes/readFlatListItems/promoteQuotedListItems` 及额外 inline 解析；保留 parser-owned `list-frames.ts` 所需的 scope 原语。不得因编辑器已切换就误删非编辑器 API。

每步必须同时交付调用点和旧路径删除；不提交无人调用的 render-plan sidecar，不先整体搬动 editor-core 文件再声称边界已经改变。

## 验收与性能约束

- 继续使用真实生产入口合同和 Electron manifest；不以旧 lossy projection 输出作为正确性 oracle。覆盖 List>Quote>List、同物理行嵌套、task 后字面量 `>`、lazy continuation、嵌套 fence/math/table、脚注与跨行 inline。方言变更另行批准。
- 断言 plan 保留 canonical 叶和源范围，且每个 inline 语义只解释一次；selection-only、focus 和 viewport 更新不得调用 Markdown/inline parser，真实 editor instrumentation 验证调用计数。
- selection-only 只更新受影响活动范围；viewport 滚动只生成新增可视区域显示结果。文档修改失效范围遵从 canonical cache，不把全文投影伪装成增量。
- 运行现有 production 273 + 27 合同、parser/cache differential、DOM 可见性与点击/选区合同。长文档基准分开记录 parser、plan、Decoration、布局耗时和计数；预算以 RF701 启动时基线定量，不预先承诺尚未测量的数字。

推荐首个可交付切片是步骤 1，而非先全量替换模型：其直接消除本轮验收暴露的任意叶丢失风险，并能在真实编辑器证明 plan 的价值。完整 RF701 完成条件仍是步骤 3 的生产 rich 链退出及步骤 4 的兼容边界明确。

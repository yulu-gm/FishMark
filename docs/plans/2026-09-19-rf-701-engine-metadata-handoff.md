# RF701 canonical 显示元数据交接

范围：仅 markdown-engine 及其测试。没有改 adapter/core/presentation 消费者；由其他 agent 接入。不是 RF701/M6 完成报告。

## 已落接口

- `MarkdownTableCell.inline: InlineRoot` 必需，所有 offset 指向原始 Markdown。兼容 `TableCell.inline?` 由 projection 直接透传。表格按既有 cell text 规则先解码 `\|`（包括 code span），仅解析一次，通过边界表将 AST offset 映回原始源码；引用定义在单元格之外的 destination/title offset 保持绝对值。源码窗口避免逐单元格分配文档前缀。
- `MarkdownDefinitionData { kind: "definition"; footnote?: FootnoteDefinitionBlockData }` 已公开导出。保留 valid/duplicate/malformed 状态；valid `lines.inline` 复用 canonical footnote index，不再次解析。正文段落在 canonical materialization 前切分，每个最终段落只解析一次 inline。
- `createMarkdownDocumentFromTree` 不再扫描／拆分脚注及补 parseInlineAst，只投影节点。旧列表／引用 projection 的其他重复语义仍需后续消费者迁移后退休，本交接不将其当作已删除。
- `MarkdownParseInstrumentation.onInlineParse?({startOffset,endOffset,sourceLength})` 在实际 `parseInlineAst` 执行入口触发，沿 canonical/full/incremental/table/footnote 参数传递，无全局状态。renderer observer 转发由 runtime agent 接入；未携带 instrumentation 的旧兼容调用不构成全应用零解析证明。

## 保留边界

脚注定义依照现有方言只附着顶层 paragraph/definition；引用和列表里的类似源码仍按原规则保留，不擅自新增方言。duplicate/malformed 定义不生成有效脚注索引，正文不会丢失。所有节点原文范围和编辑源码保持往返安全。

候选脚注按源码顺序分配给 root leaf run，避免每个容器间隙重复扫描全部候选。增量纯段落编辑移动 table inline 和 definition 内嵌范围时使用现有统一 offset 映射；依赖有效全局定义的编辑继续明确 full fallback。

## 验证

- 新 `parse/display-metadata.test.ts` 8 条精准合同通过：CRLF 与不同容器前缀、escaped pipe 的 strong/code span、跨单元格引用定义、footnote 三种状态／正文切分／对象复用、每个 cell 一次 inline 及 projection 复用、增量 metadata 差分。
- engine 全套 138 条通过：`.artifacts/rf701-engine-metadata.json`。
- 加入最后一条 cell 复用合同后，engine + model 396 条通过：`.artifacts/rf701-engine-model-metadata.json`。
- 15 组 fixture、600 次连续随机编辑 full/incremental 差分通过：`.artifacts/rf701-engine-parser-audit.json`。
- 本轮 engine 文件目标 ESLint 通过。首次元数据接入时 vitest TypeScript 通过；随后共享工作区消费者正在接入 required snapshot，新的全仓 typecheck 有消费者未补字段错误，未在 engine 范围代修。

父需独立复跑正式门禁、生产显示及原 bundle 预算。不得据上述单元测试宣称真实编辑器已无重复解析。

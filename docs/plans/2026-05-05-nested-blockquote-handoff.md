# TASK-044 Nested Blockquote Handoff

## 改了什么

- 在 `packages/markdown-engine` 新增 parser-owned blockquote prefix helper，统一解析 `> >`、`>>`、`>    >` 与 tab stop 边界。
- `parseMarkdownDocument()` 的 blockquote line 现在携带 `quoteDepth`、`markers`、`markerEnd`、`sourcePrefixEndOffset`、`contentStartOffset`，并从最深层 quote prefix 后开始构建 inline AST。
- `editor-core` 的 blockquote decorations 改为隐藏完整源码前缀，输出 `cm-inactive-blockquote-depth-N`，并用 CSS 显示最多 4 层 quote rail。
- `line-parsers`、Enter、Backspace 和 `toggleBlockquote` 统一复用 markdown-engine helper；嵌套引用按 Enter 续出同层前缀，toggle 对已引用行只移除一层。
- HTML export 跟随同一渲染契约，导出嵌套引用时隐藏完整前缀并保留 depth class。
- 更新 Markdown 文本渲染标准、测试用例、决策日志、测试报告、进度表与任务总结。

## 落点文件

- `packages/markdown-engine/src/blockquote.ts`
- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/parse-markdown-document.ts`
- `packages/markdown-engine/src/index.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`
- `packages/editor-core/src/decorations/block-lines.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/commands/line-parsers.ts`
- `packages/editor-core/src/commands/line-parsers.test.ts`
- `packages/editor-core/src/commands/blockquote-commands.ts`
- `packages/editor-core/src/commands/semantic-edits.ts`
- `packages/editor-core/src/commands/semantic-edits.test.ts`
- `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/export-html.ts`
- `src/renderer/export-html.test.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- `docs/progress.md`
- `docs/test-cases.md`
- `docs/decision-log.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-044.md`

## 推荐验证命令

- `npm.cmd run test -- src/renderer/export-html.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`

## 人工验收草稿

1. 启动应用并输入：
   ```md
   > outer
   > > **nested**
   >> compact
   >    > spaced

   Paragraph
   ```
2. 把光标移动到 `Paragraph`，确认引用块隐藏完整前缀，深度 2 行显示内层 quote rail，`nested` 为加粗。
3. 把光标移回三种嵌套引用行，确认原始 Markdown 前缀完整恢复并可编辑。
4. 在 `> > **nested**` 行末按 `Enter`，确认续出 `> > `。
5. 在空嵌套引用行按 `Enter`，确认退出引用块。
6. 选中嵌套引用行触发 `Shift+Ctrl/Cmd+9`，确认只移除一层 quote prefix。
7. 导出 HTML，确认导出的 blockquote 行也带 depth class，且隐藏 span 覆盖完整 source prefix。

## 已知风险与未做项

- 本轮不实现通用 nested container AST；blockquote 内嵌列表、代码块、表格的完整块级渲染和编辑语义仍需后续任务。
- 非激活渲染仍要求 committed quote prefix，半输入的 `>` 不会过早折叠；命令层会接受 `>quote` 这类 CommonMark 合法输入并在 Enter 时续成带空格前缀。
- 当前没有新增 Playwright / Electron 截图几何探针；视觉验收仍依赖 DOM class、CSS contract 与人工检查。
- 仓库没有活跃的 `MVP_BACKLOG.md` 文件，本轮按现有 `docs/progress.md` 任务表记录 `TASK-044`。

# TASK-044 嵌套引用块

日期：2026-05-05
状态：DEV_DONE

## 本轮完成内容

- 在 `markdown-engine` 中新增 blockquote prefix helper，把引用块 marker、深度、完整源码前缀和正文起点收敛为 parser-owned metadata。
- `parseMarkdownDocument()` 现在为 blockquote line 暴露 `quoteDepth`、`markers`、`markerEnd`、`sourcePrefixEndOffset` 与 `contentStartOffset`，并从最深层 quote prefix 后开始解析 inline AST。
- 非激活态引用块隐藏完整源码前缀，支持 `> > text`、`>> text`、`>    > text` 和 tab stop 边界，并输出 capped depth class。
- `markdown-render.css` 增加嵌套 quote rail 与递进缩进，保持原有 top-level 引用块视觉兼容。
- Enter、Backspace 与 `toggleBlockquote` 改为复用同一 parser helper；非空嵌套引用续出同层前缀，空嵌套引用退出引用块，toggle 对已引用行只移除一层。
- HTML export 跟随编辑器渲染契约，导出的嵌套引用也隐藏完整 source prefix 并带 depth class。
- 补齐 parser、decorations、commands、renderer 与 export 回归测试，并通过 spec review 与 code-quality review。

## 主要改动文件

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

## 已验证内容

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts` 通过，6 个文件、248 项测试。
- `npm.cmd run test -- src/renderer/export-html.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts` 通过，7 个文件、255 项测试。
- Spec review 通过。
- Code-quality review 先发现 HTML export 旧前缀截断问题；修复后复审通过。
- `npm.cmd run lint` 通过，保留既有 `src/renderer/editor/App.tsx:215` Fast Refresh warning。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run test` 通过，94 个测试文件、926 项测试。
- `npm.cmd run build` 通过，保留既有 Vite chunk-size warning。
- `git diff --check` 通过，无 whitespace error；仅输出 Windows LF/CRLF 归一化提示。

## 剩余风险

- 本轮不提供通用 nested container AST，引用块中嵌套列表、代码块、表格等完整块级语义仍需后续任务。
- 未新增真实浏览器截图几何探针；视觉层主要通过 DOM class、CSS contract 与人工验收步骤约束。
- 仓库没有活跃的 `MVP_BACKLOG.md` 文件，本轮只在 `docs/progress.md` 的任务表中登记 `TASK-044`。

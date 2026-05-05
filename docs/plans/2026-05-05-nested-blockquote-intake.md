# TASK-044 Intake: Nested Blockquote Semantics

Task: `TASK-044`

Goal: 让 FishMark 支持生产级嵌套引用块，包括嵌套 quote marker 的解析、非激活态渲染、激活态源码恢复、Enter 续行、Backspace 与快捷键切换语义。

In scope:
- 支持 CommonMark 常见写法：`> > nested`、`>> nested`、`>   > nested`。
- 在 `packages/markdown-engine` 中提供 parser-owned blockquote line prefix / depth 信息，避免 renderer 或 editor-core 复制 Markdown 语法判断。
- 让 blockquote line 的 inline AST 从最后一层 quote prefix 后开始，避免内层 `>` 被当作普通文本。
- 非激活态隐藏完整 quote prefix，并按 quote depth 输出稳定 class / CSS 变量，显示多层 quote rail。
- 激活态保持 Markdown 源码可编辑，同时保留现有 active blockquote content-edit 的视觉稳定性。
- `Enter` 在非空嵌套引用行后续出同层 quote prefix；空引用行按现有规则退出当前引用块。
- `Shift+Cmd/Ctrl+9` / `toggleBlockquote` 对已有引用行只移除一层 quote marker，对普通行增加一层 quote marker。
- 补 parser、decoration、command、renderer 回归测试。

Out of scope:
- 通用 container block AST，即 blockquote/list item 内嵌 heading/list/codeFence/table 的完整子块渲染。
- blockquote 内嵌列表或列表内嵌 blockquote 的生产级结构编辑。
- HTML/PDF export 的嵌套引用专门样式；本轮只保证编辑器渲染语义。
- 新 React 富文本层、widget replacement 或保存时 Markdown 重写。

Landing area:
- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/blockquote.ts`
- `packages/markdown-engine/src/parse-markdown-document.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`
- `packages/markdown-engine/src/index.ts`
- `packages/editor-core/src/decorations/block-lines.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/commands/line-parsers.ts`
- `packages/editor-core/src/commands/blockquote-commands.ts`
- `packages/editor-core/src/commands/semantic-edits.ts`
- `packages/editor-core/src/commands/semantic-edits.test.ts`
- `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-cases.md`
- `docs/decision-log.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-044.md`

Acceptance:
- `parseMarkdownDocument("> > **nested**")` 的 blockquote line `quoteDepth` 为 2，`contentStartOffset` 指向 `**nested**`，inline AST 不包含内层 `>`。
- 非激活态嵌套引用隐藏完整 quote prefix，并为行输出 `cm-inactive-blockquote-depth-2` 这类深度 class。
- 嵌套引用行点击 quote padding / marker 区域时落到该源码行起点，正文点击仍落到可见内容位置。
- 嵌套引用行按 Enter 续出同层 quote prefix；空引用行仍可退出引用块。
- 对已引用行执行 blockquote toggle 只移除一层 quote marker，多行选区逐行一致。
- CRLF 文档 offset 不错位，composition guard 不回归。
- 不改变磁盘 Markdown 源码，不进行保存时重排。

Verification:
- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`

Risks:
- blockquote marker 是逐行容器语法，offset 算错会直接破坏 inline formatting、鼠标命中、上下导航和 hidden selection normalization。
- active blockquote 目前会保留 presentation，新增 quote depth 后必须避免 active/inactive 几何位移。
- `toggleBlockquote` 和 `Enter` 如果各自解析 marker，会产生互相不一致的 Markdown 语义；必须共享 markdown-engine helper。
- 通用容器 block AST 是后续更大任务，本轮不能把所有嵌套块一起吞进来。

Doc updates:
- 新增 `TASK-044` 到 `MVP_BACKLOG.md`。
- 同步 `docs/progress.md`、`docs/test-cases.md`、`docs/decision-log.md`、`docs/test-report.md`。
- 写入 execution handoff：`docs/plans/2026-05-05-nested-blockquote-handoff.md`。
- 写入总结：`reports/task-summaries/TASK-044.md`。

Next skill:
- `$fishmark-task-execution`
- `superpowers:subagent-driven-development`
- `superpowers:test-driven-development`

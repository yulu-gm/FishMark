# 2026-05-06 inline hard break rendering handoff

## 改了什么

- 新增 inline AST 节点 `hardBreak`，只识别 `<br>` / `<br />` 这类行内 hard break 标签。
- 非激活 Markdown 渲染态会用真实 `<br>` widget 替换源码 `<br>`。
- active 编辑态保留源码 `<br>` 可见，并在标签后插入真实换行 widget，让后续文本进入下一视觉行。
- 表格单元格预览和 HTML export 复用同一 hard break 解析语义。
- 隐藏 marker 的 selection 归一化明确跳过 `hardBreak`，避免把光标位置污染成无效 range。

## 落点文件

- `packages/markdown-engine/src/inline-ast.ts`
- `packages/markdown-engine/src/parse-inline-ast.ts`
- `packages/editor-core/src/decorations/inline-decorations.ts`
- `packages/editor-core/src/decorations/table-widget.ts`
- `packages/editor-core/src/hidden-markers.ts`
- `packages/editor-core/src/line-visibility.ts`
- `src/renderer/export-html.ts`
- `src/renderer/outline.ts`

## 测试覆盖

- `packages/markdown-engine/src/parse-inline-ast.test.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/export-html.test.ts`

## 推荐验证命令

- `npm run test -- packages/markdown-engine/src/parse-inline-ast.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts src/renderer/code-editor.test.ts`
- `npm run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/export-html.test.ts packages/markdown-engine/src/parse-inline-ast.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 人工验收草稿

1. 新建 Markdown 文档，输入 `1111<br>22222222222`。
2. 光标停在这一行内，确认 active 行显示为 `1111<br>` 后接真实换行，下一视觉行显示 `22222222222`。
3. 把光标移到其他段落，确认 inactive 阅读态只显示真实换行，不显示 `<br>` 字面量。
4. 在表格单元格内用 `Shift+Enter` 插入换行，确认 cell preview 中真实换行。
5. 导出 HTML，确认对应位置输出真实 `<br>`。

## 已知风险

- 本轮只支持 hard break 语义，不支持任意 inline HTML 渲染。

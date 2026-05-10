# 2026-05-06 inline hard break rendering intake

## 背景

FishMark 已支持通过 `Shift+Enter` 在正文和表格单元格内写入字面量 `<br>`，但阅读态和导出链路没有把它渲染为真实行内换行。用户进一步确认 active 编辑态也需要保持视觉换行：源码 `<br>` 仍可见，但后续内容应换到下一行。

## 范围

- `packages/markdown-engine` 的 inline AST 需要识别 `<br>` / `<BR />` 这类 HTML hard break。
- `packages/editor-core` 的 inactive decorations 需要把 `<br>` 源码替换成真实 `<br>` widget。
- active decorations 需要保留 `<br>` 源码可见，并在源码后插入真实换行 widget。
- 表格 cell preview 与 HTML export 复用同一 hard break 语义。

## 非范围

- 不新增完整 inline HTML 渲染能力。
- 不改变 `Shift+Enter` 的写入格式，仍写入 `<br>`。
- 不自动重排或改写 Markdown 源码。

## 验收标准

- `parseInlineAst("Alpha<br>Beta")` 输出 hard break 节点。
- 非激活正文中 `Alpha<br>Beta` 渲染为 `Alpha`、真实换行、`Beta`。
- active 正文中仍显示 `Alpha<br>` 源码，但 `Beta` 出现在下一视觉行。
- 表格 cell preview 和 HTML export 对 `p<br>en` 输出真实换行。

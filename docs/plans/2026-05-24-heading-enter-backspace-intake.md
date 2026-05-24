# Heading Enter / Backspace Intake

Date: 2026-05-24
Task: heading-enter-backspace

## Context

用户观察到在标题末尾连续按 `Enter` 时，第一次会出现新行，第二次视觉上没有新增行，第三次开始才每次新增可见行；在新建空行开头按 `Backspace` 时，也需要两次才回到上一行。

代码排查后确认：
- `# Title` 被 Markdown parser 解析为 `heading` block，而不是 `paragraph` block。
- paragraph 专用 Enter 会创建独立空段落，heading 末尾 Enter 则落到 CodeMirror 默认换行。
- 块间第一条结构性空白行会被 `cm-inactive-blank-line` 折叠到 0 高度，所以只删除一个 source newline 时会出现视觉上无变化。

## Scope

- 让 heading 末尾普通 `Enter` 与 paragraph 末尾一样，创建一个可见、可编辑的空段落位置。
- 让从这个尾随空段落位置按 `Backspace` 一次即可回到前一个非空行末尾。
- 不改 list、blockquote、code fence、table 的既有专用 Enter / Backspace 语义。

## Non-Goals

- 不统一所有块类型的 raw source 插入字符串。
- 不修复现有 ordered-list Backspace 失败用例。
- 不调整 blank-line 折叠 CSS。

# List Indent Consistency Intake

## 背景

用户反馈 FishMark 中有序列表和无序列表的缩进不一致，希望二者缩进格式保持一致。

## 范围

- 只调整 Markdown 编辑器列表渲染几何。
- 保持 Markdown 源文本仍是唯一事实来源，不改解析、保存或列表编辑命令。
- 同步 canonical Markdown text rendering standard、CSS 契约测试和真实 Electron 几何探针。

## 初步判断

当前标准和 CSS 使用两套内容列偏移：无序列表 `1.16em`，有序列表 `3.02em`。根因在视图层 CSS 几何契约，不在 micromark 解析或 CodeMirror decoration class 分派。

## 验收标准

- 同一 nesting depth 下，无序列表和有序列表正文 content start x 坐标一致。
- marker 右边界到正文的 gap 仍遵守 `0.62em` 契约。
- active/inactive 切换不移动列表正文或 marker 列。
- 相关测试、typecheck、lint、build 通过。

## 任务属性

这是一次 ad-hoc 渲染 bugfix，没有对应 backlog TASK 编号；不更新 `MVP_BACKLOG.md` 的 task checkbox。

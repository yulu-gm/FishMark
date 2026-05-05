# List Indent Consistency Handoff

## 改了什么

- 将顶级无序列表、有序列表和任务列表的 marker 左边界对齐到普通标题/正文左边界，不再额外内缩。
- 将无序/有序列表正文偏移统一到稳定 marker column 之后；子列表只通过 depth offset 增加缩进。
- 将任务列表 checkbox 左边界也对齐到顶级正文左边界，并保留独立 checkbox-to-text 间距。
- 更新 Markdown 文本渲染标准，明确 `marker-to-text gap` 由稳定 marker column 右边界计算，避免可见 glyph 宽度造成微小漂移。
- 显式清零 CodeMirror `.cm-line` 默认水平 padding，避免列表 marker 的 absolute positioning 绕过正文 inset。
- 增加 CSS 契约测试，先复现 `1.16em` vs `3.02em` 的失败，再验证统一后的几何。
- 扩展 Electron 列表几何探针，测量同一 depth 下无序/有序列表正文列和 marker 右边界。
- 修复 active 任务列表 marker 继承 `word-break: break-all` 后把 `- [x]` 拆成两行的问题。

## 落点文件

- `docs/standards/markdown-text-rendering-standard.json`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/styles/editor-source.css`
- `src/renderer/editor-source-layout.test.ts`
- `src/renderer/list-geometry-probe.ts`

## 已运行验证

- `npm.cmd run test -- src/renderer/editor-source-layout.test.ts`：先失败，确认旧标准中无序 `1.16em` 与有序 `3.02em` 不一致。
- `npm.cmd run test -- src/renderer/editor-source-layout.test.ts`：修复后 8 tests passed。
- `npm.cmd run test -- src/renderer/editor-source-layout.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts`：348 tests passed。
- `npm.cmd run test:list-geometry`：pass；Electron 探针显示 heading/paragraph left delta 为 `0px`，顶级 unordered/ordered/task marker left 到 paragraph left 的 delta 均为 `0px`，同 depth ordered/unordered marker left 和 content left delta 均为 `0px`。
- `npm.cmd run test:list-geometry` 复核 active task marker：`[x]` 相对 `-` 的 top delta 为 `0px`，left-right delta 为 `3.859375px`。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：0 errors，保留既有 warning：`src/renderer/editor/App.tsx:215 react-refresh/only-export-components`。
- `git diff --check`：通过。
- `npm.cmd run build`：通过，保留既有 Vite chunk size warning。

## 人工验收草稿

1. 打开 FishMark，新建临时文档。
2. 输入同一层级的 `- 无序项目` 和 `1. 有序项目`，确认 marker 左边界和正文起始列一致。
3. 输入子级列表，例如 `  - 子级无序` 和 `  1. 子级有序`，确认子级只比顶级多一层缩进，且子级 marker 左边界一致。
4. 把光标分别放到无序和有序列表行，确认 active/source 状态下正文列不跳动。
5. 输入任务列表 `- [ ] Todo`，确认顶级 checkbox 左边界与标题/正文左边界一致。

## 已知风险或未做项

- 本轮未启动完整交互式 Electron app 手动点击验收；已使用 Electron geometry probe 做真实 Chromium 渲染测量。
- 本轮是无 backlog 编号的 ad-hoc bugfix，因此没有更新 `MVP_BACKLOG.md`、`docs/progress.md` 或 `reports/task-summaries/TASK-xxx.md`。

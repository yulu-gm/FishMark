# TASK-033 代码块渲染

日期：2026-04-16
状态：DEV_DONE

## 本轮完成内容

- 在 `packages/markdown-engine/src/` 为 top-level fenced code block 补齐 block map 支持，并保留 `info string`
- 在 `src/renderer/code-editor.ts` 的现有 CodeMirror decoration 派生链中补上代码块的非激活态渲染
- 非激活代码块现在显示为等宽字体的连续代码区域，保留缩进与换行，同时隐藏 opening / closing fence
- 光标重新进入代码块后，会移除代码块 decorations，完整恢复 Markdown 源码态
- 在仅输入 opening fence 后按 `Enter`，现在会自动补全 closing fence，并把光标放到中间空行，方便直接开始输入代码
- 保持代码块的编辑行为仍由 CodeMirror 默认文本语义处理，不额外劫持 `Tab`、`Shift+Tab` 或 `Enter`
- 为 parser 与 editor 补上回归测试，覆盖 info string 保留、inactive/active 切换和现有 block rendering 非回归

## 主要改动文件

- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/index.ts`
- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`
- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/styles.css`
- `docs/plans/2026-04-16-task-033-intake.md`
- `docs/decision-log.md`
- `docs/test-cases.md`
- `docs/test-report.md`
- `docs/progress.md`
- `MVP_BACKLOG.md`

## 已验证内容

- `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
- `npm run test -- src/renderer/code-editor.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 残余风险

- 当前只覆盖 fenced code block，不包含语法高亮或 indented code block
- 真实桌面壳下的代码块人工验收还未单独记录，因此 `docs/progress.md` 先记为 `DEV_DONE`，未提升到 `CLOSED`

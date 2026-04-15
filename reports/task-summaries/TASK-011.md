# TASK-011 段落渲染

日期：2026-04-15
状态：CLOSED

## 本轮完成内容

- 在 `src/renderer/code-editor.ts` 中把非激活 top-level paragraph 并入现有的 CodeMirror decoration 派生状态
- 非激活段落现在会获得轻量排版增强，激活段落保持 Markdown 源码态
- 段落与标题 decoration 现在共用同一条 inactive-state pipeline，不再各自维护独立 effect
- 段落 composition 结束时的 decoration flush 已通过回归测试确认只执行一次

## 主要改动文件

- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/styles.css`

## 已验证内容

- `npm run test -- src/renderer/code-editor.test.ts`
- 人工验收通过：段落轻量渲染、激活回源码态、与标题 decoration 共存、基础交互正常

## 合并前门禁

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 后续风险

- `TASK-012` 需要把列表和任务列表渲染并入同一 decoration pipeline，同时处理 Enter 行为，复杂度会高于标题和段落
- `TASK-013` 引用块会引入更敏感的块边界与光标首尾行为，仍需沿用 shared decoration pipeline + composition guard

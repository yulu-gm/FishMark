# TASK-010 标题渲染

日期：2026-04-15
状态：CLOSED

## 本轮完成内容

- 在 `src/renderer/code-editor.ts` 中为非激活 heading 增加 CodeMirror decoration 派生状态
- 非激活 heading 现在会弱化 `#` 前缀，并按标题层级应用 line 样式
- 激活 heading 保持 Markdown 源码态，不引入 widget replacement
- 复用了 `TASK-035` 的 composition guard，避免组合输入期间 decoration 抖动
- 修正了 composition 结束时 decoration 重复 flush 一次的问题

## 主要改动文件

- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/styles.css`

## 已验证内容

- `npm run test -- src/renderer/code-editor.test.ts`
- 人工验收通过：标题 `#` 弱化、激活回源码态、基础交互正常

## 合并前门禁

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 后续风险

- `TASK-011` 需要把 paragraph decoration 并入同一派生状态面，避免与 heading decoration 互相覆盖
- `TASK-012` 与 `TASK-013` 会进一步放大光标映射、选择边界和 IME 风险，仍需继续沿用 shared decoration pipeline + composition guard

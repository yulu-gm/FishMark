# TASK-012 列表与任务列表渲染

日期：2026-04-15
状态：DEV_DONE

## 本轮完成内容

- 2026-04-30：将 `Tab` / `Shift+Tab` 的列表层级操作统一到递归 item context，修复无序/任务列表只能嵌套到二级、继续按 `Tab` 会跳到外层 UI 焦点框选的问题。
- 2026-04-30：明确列表层级规则：`Tab` 只在当前 scope 存在前序同级项时缩进，`Shift+Tab` 只在非顶级项时反缩进，两者都以当前 item subtree 为单位递归影响子列表和延续行。
- 2026-04-30：将列表层级操作提交的 CodeMirror change 从 root list 整段替换收敛为原文本与归一化结果的最小 diff，避免改变层级时页面滚动跳动。
- 2026-05-05：将 document-level ordered-list normalization 同样收敛为 marker 级最小 changes，修复有序列表边界 `Backspace` 和列表项中间 `Enter` 后光标被整段 list replacement 映射到列表末尾的问题。
- 在 `packages/markdown-engine/src/` 为 `ListBlock` 增补 item-level metadata，覆盖 marker、indent、task marker 和 checked 状态。
- 在 `src/renderer/code-editor.ts` 现有 inactive-state decoration pipeline 中补齐无序列表、有序列表和任务列表的非激活态渲染。
- 在同一编辑器边界内实现列表 `Enter` 续项、ordered marker 递增、空项退出规则，并保持默认非列表 `Enter` 行为不变。
- 为 editor test driver 增加 `set-editor-selection` 与 `press-editor-enter` 两个最小命令。
- 在 `packages/test-harness` 中新增 `list-enter-behavior-basic` scenario 与 fixture，用于回归 task list 的续项与空项退出路径。

## 主要改动文件

- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/index.ts`
- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`
- `packages/editor-core/src/commands/list-edits.ts`
- `packages/editor-core/src/commands/list-edits.test.ts`
- `packages/editor-core/src/commands/list-commands.ts`
- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/code-editor-view.tsx`
- `src/renderer/editor-test-driver.ts`
- `src/renderer/editor-test-driver.test.ts`
- `src/renderer/App.tsx`
- `src/renderer/styles.css`
- `src/shared/editor-test-command.ts`
- `packages/test-harness/src/handlers/electron-ipc.ts`
- `packages/test-harness/src/handlers/electron.ts`
- `packages/test-harness/src/handlers/electron.test.ts`
- `packages/test-harness/src/scenarios/index.ts`
- `packages/test-harness/src/scenarios/list-enter-behavior-basic.ts`
- `packages/test-harness/src/registry.test.ts`
- `fixtures/test-harness/list-enter-behavior-basic.md`

## 已验证内容

- `npm run test -- packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts`（2026-04-30，新列表层级规则 focused 回归）
- `npm.cmd run test -- src/renderer/code-editor.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`（2026-05-05，有序列表边界 Backspace 与列表项中间 Enter 光标稳定性回归，192 项通过）
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts src/shared/markdown-text-rendering-standard.test.ts src/renderer/editor-source-layout.test.ts`（2026-05-05，列表、结构性空白行、导出与样式契约组合回归，239 项通过）
- `npm run test -- packages/editor-core/src/commands/list-edits.test.ts`（2026-04-30，列表层级最小 diff 与滚动稳定性回归，26 项通过）
- `npm run test -- packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/editor-source-layout.test.ts`（2026-04-30，列表层级、快捷键、装饰与主题几何 focused 回归，181 项通过）
- `npm run typecheck`（2026-04-30，滚动稳定性修复后复跑）
- `npm run lint`（2026-04-30，退出码 0；保留既有 fast-refresh warning）
- `npm run build`（2026-04-30；保留既有 Vite chunk size warning）
- `npm run lint`（2026-04-30，退出码 0；保留既有 fast-refresh warning）
- `npm run typecheck`（2026-04-30）
- `npm run build`（2026-04-30；保留既有 Vite chunk size warning）
- `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`
- `npm run test -- src/renderer/code-editor.test.ts`
- `npm run test -- src/renderer/editor-test-driver.test.ts`
- `npm run test -- packages/test-harness/src/handlers/electron.test.ts packages/test-harness/src/registry.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 残余风险

- 本轮没有做真实桌面壳的人体验收，因此 `docs/progress.md` 先记为 `DEV_DONE`，未提升为 `CLOSED`。
- 空项退出当前采用“清空当前 list line 文本”的最小策略，后续若要更贴近 Typora 的多层 dedent 语义，还需要继续补细分回归。
- `list-enter-behavior-basic` scenario 目前覆盖 task list 的续项与退出；若后续 ordered / nested list 语义继续演进，建议再补独立 scenario。

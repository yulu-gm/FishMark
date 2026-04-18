# TASK-041 默认 Markdown 切换型快捷键

日期：2026-04-18
状态：DEV_DONE

## 本轮完成内容

- 在 `packages/editor-core/src/commands/` 落地三层语义切换器架构：
  - `semantic-context.ts`：从 `EditorState` + `ActiveBlockState` 读出 selection / source / activeBlock
  - `semantic-edits.ts`：6 个纯计算函数 (`computeStrongToggle`、`computeEmphasisToggle`、`computeHeadingToggle`、`computeBulletListToggle`、`computeBlockquoteToggle`、`computeCodeFenceToggle`)，每个返回 `{ changes, selection } | null`
  - `toggle-inline-commands.ts` / `toggle-block-commands.ts`：CodeMirror 命令入口，单事务 `view.dispatch`
- 在 `packages/editor-core/src/extensions/markdown.ts` 的 keymap 中接入九条默认绑定：
  - `Mod-b` 粗体、`Mod-i` 斜体
  - `Mod-1` / `Mod-2` / `Mod-3` / `Mod-4` 标题切换
  - `Mod-Shift-7` 无序列表、`Mod-Shift-9` 引用块、`Mod-Alt-Shift-c` 代码块
- 选区优先：有非空选区时执行包裹 / 解包，空选区时插入成对 marker 并把光标放到中间
- 行为可逆：再次触发同一快捷键可恢复 marker / 解包结构
- 命令级、扩展级与 renderer 回归测试均覆盖到位

## 主要改动文件

- `packages/editor-core/src/commands/semantic-context.ts`
- `packages/editor-core/src/commands/semantic-context.test.ts`
- `packages/editor-core/src/commands/semantic-edits.ts`
- `packages/editor-core/src/commands/semantic-edits.test.ts`
- `packages/editor-core/src/commands/toggle-inline-commands.ts`
- `packages/editor-core/src/commands/toggle-inline-commands.test.ts`
- `packages/editor-core/src/commands/toggle-block-commands.ts`
- `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- `packages/editor-core/src/commands/index.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `src/renderer/code-editor.test.ts`
- `docs/superpowers/specs/2026-04-18-keyboard-shortcuts-design.md`
- `docs/superpowers/plans/2026-04-18-keyboard-shortcuts.md`
- `docs/plans/2026-04-18-keyboard-shortcuts-intake.md`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/decision-log.md`
- `docs/test-report.md`

## 已验证内容

- `npx vitest run packages/editor-core/src/commands/semantic-context.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-inline-commands.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` 通过（6 个文件、94 条测试）
- `npm run typecheck` 通过
- `npm run build` 通过

## 剩余风险

- 本轮不支持自定义快捷键、菜单栏 accelerator 文案同步、有序列表 / 任务列表 / 链接 / 行内代码快捷键、多光标格式切换
- 仓库现有 `npm run lint` 在 `src/renderer/editor/App.tsx` 上仍有 3 条 `useEffectEvent` 历史报错（来自上一次重构，未在本任务范围内）
- 仓库现有 `npm run test` 中 `src/main/after-pack-win-icon.test.ts` 偶发 5s timeout（未在本任务范围内）

Task: keyboard-shortcuts
Goal: 为现有 Markdown 编辑器增加一批默认“切换型”快捷键，覆盖标题、无序列表、引用块、代码块、粗体和斜体，并保证选区优先、行为可逆、光标稳定。
In scope:
- 默认快捷键绑定
- 语义切换器命令层
- 标题 1~4 级切换
- 无序列表、引用块、代码块切换
- 粗体、斜体切换
- 相关单测与集成测试
Out of scope:
- 自定义快捷键
- 菜单栏显示快捷键文案
- 有序列表、任务列表、链接、行内代码快捷键
- 多光标支持
Landing area:
- `packages/editor-core/src/commands/`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `src/renderer/code-editor.test.ts`
- `docs/superpowers/specs/2026-04-18-keyboard-shortcuts-design.md`
Acceptance:
- `Cmd/Ctrl+B`、`Cmd/Ctrl+I` 支持选区包裹/解包与空选区插入
- `Cmd/Ctrl+1..4` 支持对应等级标题切换
- `Shift+Cmd/Ctrl+7` 支持无序列表切换
- `Shift+Cmd/Ctrl+9` 支持引用块切换
- `Alt+Shift+Cmd/Ctrl+C` 支持代码块包裹/解包
- 再次触发可逆
- 不破坏 undo/redo、IME、autosave、现有 block rendering
Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- 针对快捷键的 renderer / editor-core 定向测试
Risks:
- IME composition
- 光标与选区映射
- undo/redo 语义
- autosave 链路
- Markdown round-trip
Doc updates:
- `docs/superpowers/specs/2026-04-18-keyboard-shortcuts-design.md`
- `docs/plans/2026-04-18-keyboard-shortcuts-intake.md`
- 实现完成后按需要更新 `MVP_BACKLOG.md`、`docs/progress.md`、`docs/decision-log.md`、`docs/test-report.md`
Next skill: writing-plans

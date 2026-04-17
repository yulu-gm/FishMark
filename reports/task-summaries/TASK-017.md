# TASK-017 大纲侧栏

日期：2026-04-17
状态：DEV_DONE

## 本轮完成内容

- 新增 `src/renderer/outline.ts`，直接复用 `parseMarkdownDocument()` 的 heading + inline AST，把当前文档提取成可渲染的大纲项
- 在 `src/renderer/editor/App.tsx` 中把大纲改成右侧平级悬浮面板，并提供默认收起的小型展开入口
- 大纲项点击后通过 `CodeEditorView` / `code-editor` 新增的 `navigateToOffset()` 把光标跳到对应标题，并调用 CodeMirror 原生滚动定位
- 调整 `src/renderer/styles/app-ui.css` 与 `src/renderer/styles/base.css`，恢复窄 rail，并为右侧面板补上更紧凑的目录树密度、悬浮卡片观感与折叠状态
- 补充 `outline`、`code-editor-view`、`code-editor`、`app.autosave` 四组回归测试，覆盖标题提取、句柄透传、跳转接口和右侧可折叠 outline UI

## 主要改动文件

- `src/renderer/outline.ts`
- `src/renderer/outline.test.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/code-editor-view.tsx`
- `src/renderer/code-editor-view.test.tsx`
- `src/renderer/app.autosave.test.ts`
- `src/renderer/styles/base.css`
- `src/renderer/styles/app-ui.css`
- `docs/plans/2026-04-17-task-017-intake.md`
- `docs/decision-log.md`
- `docs/test-cases.md`
- `docs/progress.md`
- `docs/test-report.md`
- `MVP_BACKLOG.md`

## 已验证内容

- `npm.cmd run test -- src/renderer/outline.test.ts`
- `npm.cmd run test -- src/renderer/code-editor-view.test.tsx`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run test -- src/renderer/app.autosave.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`

## 残余风险

- 当前大纲只提供最小点击导航，不包含折叠、拖拽重排、键盘导航或搜索
- 右侧面板在窄窗口下仍沿用当前最小宽度策略，后续如果要做更激进的响应式抽屉或覆盖式行为，需要再单独切 task
- 本轮还没有补独立的桌面人工验收记录，因此 `docs/progress.md` 先记为 `DEV_DONE`

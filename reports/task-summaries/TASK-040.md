# TASK-040 New Markdown Document

日期：2026-04-17
状态：DEV_DONE

## 本轮完成内容

- 在原生 `File` 菜单中新增 `New`，快捷键为 `CmdOrCtrl+N`
- 新建文档会直接进入编辑态，创建一个仅存在于内存中的 `Untitled.md`
- 未保存文档的 `path` 为空，首次执行 `Save` 会自动走现有 `Save As` 对话框
- 未保存文档不会误触发 autosave 到磁盘，状态栏会显示 `Not saved yet`
- `Save As` 现在支持从 untitled 文档开始创建新的 `.md` 文件

## 主要改动文件

- `src/shared/open-markdown-file.ts`
- `src/shared/save-markdown-file.ts`
- `src/shared/menu-command.ts`
- `src/main/application-menu.ts`
- `src/main/save-markdown-file.ts`
- `src/preload/preload.ts`
- `src/renderer/document-state.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/editor-test-driver.ts`
- `src/main/application-menu.test.ts`
- `src/main/save-markdown-file.test.ts`
- `src/preload/preload.contract.test.ts`
- `src/renderer/document-state.test.ts`
- `src/renderer/app.autosave.test.ts`
- `docs/decision-log.md`
- `docs/test-report.md`

## 已验证内容

- `npm.cmd run test -- src/main/application-menu.test.ts src/main/save-markdown-file.test.ts src/preload/preload.contract.test.ts src/renderer/document-state.test.ts src/renderer/app.autosave.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

## 剩余风险

- 当前 `New` 还没有“存在未保存改动时是否拦截切换”的确认流程；本轮只交付最小创建链路
- untitled 文档目前不会做 crash recovery 或磁盘 autosave，后续若要补齐需与 `TASK-021` 一起设计

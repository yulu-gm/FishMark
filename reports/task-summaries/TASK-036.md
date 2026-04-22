# TASK-036 外部文件变更检测

日期：2026-04-22
状态：DEV_DONE

## 本轮完成内容

- 新增当前文档路径的主进程 watcher，并把外部修改 / 删除事件安全桥接到 renderer。
- 在 renderer 建立外部文件冲突状态机，出现冲突时暂停 autosave，避免静默覆盖磁盘变化。
- 交付统一冲突提示 UI，支持“重载磁盘版本 / 保留当前编辑 / 另存为新文件”三条路径。
- 将“保留当前编辑”后的 `Save` 自动转为 `Save As`，确保用户显式选择新路径后再落盘。
- 补齐 document-state、main watcher、preload 合同、renderer autosave/交互回归测试。

## 主要改动文件

- `src/shared/external-file-change.ts`
- `src/main/external-file-watch-service.ts`
- `src/main/main.ts`
- `src/preload/preload.ts`
- `src/renderer/document-state.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/styles/app-ui.css`
- `src/renderer/app.autosave.test.ts`
- `docs/test-cases.md`
- `docs/test-report.md`
- `docs/decision-log.md`
- `docs/progress.md`
- `MVP_BACKLOG.md`

## 已验证内容

- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test` 通过（75 个文件、749 条测试）
- `npm run build` 通过（保留现有 Vite chunk size warning，但 exit code 为 0）

## 剩余风险

- 本轮尚未在真实桌面壳完成外部修改 / 删除的人肉验收，因此状态先同步为 `DEV_DONE`，等待 acceptance 阶段补最后一轮桌面验证。
- 未覆盖多窗口同时打开同一路径、权限变化后恢复、以及更复杂的文件版本合并策略。

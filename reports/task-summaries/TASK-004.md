# TASK-004 总结

日期：2026-04-15

完成内容：
- 建立 `Save` 与 `Save As` 的最小主进程写入闭环，并继续把文件系统访问限制在 `src/main/`
- 新增 `src/shared/save-markdown-file.ts`，统一保存结果结构、错误码和 IPC channel
- 在 `src/preload/preload.ts` 中暴露最小保存 bridge
- 在 `src/renderer/document-state.ts` 中加入 `saveState`、`isDirty` 和保存结果状态迁移
- 在 `src/renderer/App.tsx` 中接入 Save / Save As 按钮、保存中状态和最小保存反馈
- 补充主进程保存测试、renderer 状态测试与开发启动脚本覆盖

验证结果：
- `npm run test -- src/main/save-markdown-file.test.ts src/renderer/document-state.test.ts src/main/package-scripts.test.ts` 通过
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test` 通过
- `npm run build` 通过

人工验收：
- 尚未在本轮会话内完成桌面文件对话框的人工验收；建议按 `docs/acceptance.md` 中的当前阶段步骤验证 Save / Save As 的实际桌面交互

说明：
- 本任务只覆盖“已打开文档”的 Save / Save As 闭环，未包含未命名新建文档首次保存
- autosave、CodeMirror 6、crash recovery 仍属于后续任务

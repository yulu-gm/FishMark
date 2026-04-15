# TASK-032 总结

范围：
- 把 `Open / Save / Save As` 接入原生 `File` 菜单
- 通过受限 `preload` 事件把菜单命令传给 `renderer`
- 收敛当前 renderer 临时壳，去掉网页 demo 卡片感

本轮完成：
- 新增 `src/main/application-menu.ts` 与 `src/shared/menu-command.ts`
- 在 `src/main/main.ts` 中安装应用菜单，并把 `Open...`、`Save`、`Save As...` 命令发送给当前窗口
- 在 `src/preload/preload.ts` 中新增 `window.yulora.onMenuCommand()`
- 在 `src/renderer/App.tsx` 中订阅菜单命令并复用现有打开/保存链路
- 调整 `src/renderer/styles.css`，把界面改成更像桌面编辑器的单栏壳层
- 移除编辑器内部的 `Save / Save As` 快捷键绑定，避免与应用菜单 accelerator 双触发

验证：
- `npm run test -- src/main/application-menu.test.ts src/main/save-markdown-file.test.ts src/renderer/code-editor.test.ts src/renderer/document-state.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

人工验收：
- 运行 `npm run dev`
- 打开 `File` 菜单，确认存在 `Open...`、`Save`、`Save As...`
- 从 `File > Open...` 打开一个 UTF-8 `.md` 文件，确认文档名、路径和文本正确显示
- 修改文本后确认显示 `Unsaved changes`
- 按 `Ctrl/Cmd + S` 或从 `File > Save` 保存，确认文件写回原路径
- 按 `Shift + Ctrl/Cmd + S` 或从 `File > Save As...` 另存为，确认界面路径切到新文件

剩余不在本任务范围内：
- 最近文件
- 自定义标题栏
- Typora 式块级渲染
- autosave、crash recovery、IME 专项修复

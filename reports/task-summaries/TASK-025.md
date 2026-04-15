# TASK-025 总结

范围:
- 增加独立测试工作台启动模式
- 让测试工作台窗口与普通编辑器窗口分离
- 暴露最小 runtime bridge，并允许工作台拉起独立 editor 测试窗口

本轮完成:
- 新增 `dev:test-workbench` 与 `dev:electron:test-workbench` 启动脚本，用环境变量驱动测试模式启动
- 为 workbench dev 流程拆出独立 `dev:renderer:test-workbench`，固定使用 `5174`，避免 worktree 与主工作区共用 `5173` 时误连旧 renderer
- 新增 `src/main/runtime-windows.ts`，把 primary window 与 editor test window 的窗口配置、runtime 参数和 reopen 行为集中管理
- 更新 `src/main/main.ts`，让应用启动时根据 runtime mode 打开独立测试工作台窗口，并响应工作台发起的 `open editor test window` IPC
- 更新 `src/preload/preload.ts`，把 runtime mode 解析内联到 preload 单文件入口，通过 `window.yulora.runtimeMode` 与 `window.yulora.openEditorTestWindow()` 暴露最小 bridge，避免 preload 本地模块导入导致 bridge 缺失
- 更新 `src/renderer/App.tsx` 与 `src/renderer/styles.css`，为测试模式渲染独立 workbench 页壳，展示 `Scenario Catalog`、`Debug Stream`、`Test Process` 三个基础面板
- workbench 页面现在可以直接请求主进程拉起独立 editor 测试窗口，为后续具体测试场景预留窗口生命周期基础

验证:
- `npm run test -- src/main/runtime-windows.test.ts src/main/package-scripts.test.ts src/renderer/test-workbench.test.tsx src/renderer/app.autosave.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

人工验收:
- 运行 `npm run dev:test-workbench`
- 确认首个窗口显示 `Yulora Test Workbench`，并包含 `Scenario Catalog`、`Debug Stream`、`Test Process`
- 点击 `Open Editor Test Window`，确认会拉起第二个独立 editor 窗口
- 关闭第二个 editor 窗口，确认测试工作台仍然保持打开
- 重新运行 `npm run dev`，确认正常开发壳仍然进入普通编辑器界面

剩余不在本任务范围内:
- 场景注册表与场景元数据模型
- 统一测试运行器与步骤状态机
- debug 实时事件流与结果工件
- CLI 统一入口与 visual-test 能力

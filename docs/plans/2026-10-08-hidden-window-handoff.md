# TASK-UX-LAUNCH-001 execution handoff

本切片已实现 `activateEditorWindow`：活窗口依次 restore（最小化时）、show（隐藏时）、focus；销毁窗口短路。`main.ts` 在文件事件交付前激活窗口，无参数 second-instance 则激活已有编辑窗口，必要时创建窗口。没有移植旧机未提交补丁。

落点：`src/main/activate-editor-window.ts`、相邻测试、`src/main/main.ts`。

验证命令：`npm run build`、`npm run lint`、`npm run typecheck`、`npm run test:regression`；定向 `npm exec vitest -- run src/main/activate-editor-window.test.ts src/main/launch-open-path.test.ts src/main/runtime-windows.test.ts src/main/workspace-window-registration-application.test.ts`。

真实双进程探针与原始 JSON/PNG/log 在 `.artifacts/hidden-window/`。入口 probe.cjs 包装实际编译 main，隔离 userData，仅本测试进程退出；未使用系统关联。baseline-final 入口由精确 main 的 main.ts 用当前 TypeScript 转译到 dist-electron/main/main.baseline.cjs，其他 build 依赖相同；fixed-final 使用完整 build 的 main.js。二者使用同一最终探针。

整体结果 FAIL，待独立 review；详细结果及人工步骤见 `reports/task-summaries/TASK-UX-LAUNCH-001.md`。后续必须解决/验证多文件、未 ready、发送失败、销毁竞态，以及原 Windows symlink 门禁；不要据激活切片通过宣称 M9 完成。

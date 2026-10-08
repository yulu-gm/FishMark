# TASK-UX-LAUNCH-001 execution handoff

首轮e338实现 `activateEditorWindow`。续轮已完成多文件FIFO、renderer初始化后ready、preload处理完成ACK与重试去重、发送失败有界恢复、销毁/重载未确认路径保留，以及quit暂停/取消恢复/确认退出。没有移植旧机未提交补丁。

落点：`src/main/activate-editor-window.ts`、`launch-open-path.ts`、`launch-open-coordinator.ts`、`ipc/register-launch-open-handlers.ts`、各测试及main接线；preload/product-api、shared请求契约和renderer/editor/App初始化订阅。

验证命令：`npm run build`、`npm run lint`、`npm run typecheck`、`npm run test:regression`；定向 `npm exec vitest -- run src/main/activate-editor-window.test.ts src/main/launch-open-path.test.ts src/main/runtime-windows.test.ts src/main/workspace-window-registration-application.test.ts`。

真实双进程探针与原始 JSON/PNG/log 在 `.artifacts/hidden-window/`。入口 probe.cjs 包装实际编译 main，隔离 userData，仅本测试进程退出；未使用系统关联。baseline-final 入口由精确 main 的 main.ts 用当前 TypeScript 转译到 dist-electron/main/main.baseline.cjs，其他 build 依赖相同；fixed-final 使用完整 build 的 main.js。二者使用同一最终探针。

续轮定向223、真实边界8场景+激活4场景、正式121/121/2541、build/lint/typecheck/bundle及独立review均通过。最后精确main3151+10exact+1symlink，补丁3175+10exact+同一symlink；原完整门禁整体仍FAIL，最后控制新增异常0。此前两次全量搜索timeout保留，最终顺序控制不再复现。证据在phase2命名工件中，详见任务总结。

独立意见：可作为窄bugfix候选交付；正式发布需明确symlink门禁例外批准，或获准且具备文件symlink能力的Windows环境完成原门禁。打包版Explorer关联、远端CI未运行，renderer崩溃自动重启未承诺，M9/cp16不变。本轮只本地checkpoint，不push。

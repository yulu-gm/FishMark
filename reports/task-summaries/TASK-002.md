# TASK-002 总结

日期：2026-04-15

完成内容：
- 建立 `apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e` 目录边界
- 为边界目录补充 README，占位说明各目录职责
- 保持根目录当前 Electron 开发壳可继续运行，没有提前迁移应用代码

验证结果：
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test` 通过
- `npm run build` 通过

说明：
- 本任务只建立 monorepo 边界，不引入新的产品能力
- 当前可运行 MVP 骨架仍位于仓库根目录
- 后续 task 可按 backlog 逐步把能力落到对应边界目录中

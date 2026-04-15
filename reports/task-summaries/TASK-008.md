# TASK-008 总结

日期：2026-04-15

完成内容：
- 在 `packages/markdown-engine/src/` 下新增了首个真实 Markdown engine 实现，提供 `parseBlockMap()` 入口与最小 block-map 类型定义
- 接入 `micromark` 的 `parse` / `preprocess` / `postprocess` 事件流，按源码顺序提取顶层 `heading`、`paragraph`、`list`、`blockquote`
- 为每个 block 输出稳定 `id`、`startOffset`、`endOffset`、`startLine`、`endLine`，并补充 heading depth 与 ordered-list 元数据
- 补充 `packages/markdown-engine/src/parse-block-map.test.ts`，覆盖混合文档、setext heading、有序/无序列表、空输入，以及 list / blockquote 内部 paragraph 不应泄漏为顶层 block 的回归
- 更新 `vitest.config.ts` 与 `tsconfig.vitest.json`，把 `packages/markdown-engine` 纳入 repo 的测试与类型检查门禁

验证结果：
- `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` 通过
- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test` 通过
- `npm run build` 通过

说明：
- 本任务只交付最小 top-level block map，不包含 renderer 接线、active block 跟踪、块渲染、list item 分解或 inline token 映射
- 当前 heading depth 仍按 block 源码切片做最小推导；后续如果 renderer 或 outline 需要更多结构，再在 `packages/markdown-engine` 上增量扩展即可

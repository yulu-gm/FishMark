# TASK-056 Enter / Backspace line-first 路由

日期：2026-05-24

状态：DEV_DONE

## 本轮完成

- 将普通 `Backspace` 路由调整为先处理非空 selection / native deletion，再处理 whitespace-only 物理行内单字符删除，随后进入 code fence / blockquote / ordered-list detach / list marker / trailing empty block / structural separator / native fallback。
- 修复 ordered-list content-start Backspace 回归：中间有序项从内容起点 Backspace 时保留可见 marker 文本并插入结构分隔，结果为 `1. 内容\n\n2.内容2\n3. 内容3`。
- ordered-list detach 现在使用 active list block/scope metadata 作为 gate：只有当前 item 在同一 ordered scope 内存在前序 sibling 时才 detaches；`Intro\n1. first` 这类段落后的首个有序项会回退到 list marker Backspace。
- 将普通 `Enter` 的 generic fallback 从 `activeBlock.type === "paragraph"` 扩展为 physical paragraph fallback，覆盖 activeBlock 为 `null` 的 empty / whitespace / trailing physical line；heading repeated Enter 现在按 oracle 累积空段并保持 caret 在末尾。
- 保留 table / code fence / list / blockquote / thematic break / heading 的语义 Enter 优先级。
- 将 whitespace-only 行从 structural blank selection normalization 中排除，避免真实空白内容被归一回行首。
- 更新 TASK-056 probe oracle，使 active empty / whitespace line 视觉断言对齐 TASK-055 的 `pre-wrap` physical line surface。

## 测试证据

- RED：`npm.cmd run test -- src/renderer/code-editor.test.ts -t "breaks ordered list rendering from the current item when Backspace is pressed at content start"` 失败，实际 `1. 内容\n内容2\n3. 内容3`，期望 `1. 内容\n\n2.内容2\n3. 内容3`。
- RED：`npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts -t "deletes one real whitespace character|detaches a non-first ordered list item"` 失败，两个新命令测试均返回 `false`。
- RED：`heading-end-repeated-enter` probe 在 Enter physical fallback 前失败，实际 `# Title\n\n\n\n` / selection 11，期望 `# Title\n\n\n\n\n\n` / selection 13。
- RED：`npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts -t "whitespace-only line end"` 失败，命令把 `0..3` 全部删除而不是只删 `2..3`。
- RED：`npm.cmd run test -- src/renderer/code-editor.test.ts -t "end of a whitespace-only physical line"` 失败，实际 source 为空字符串而不是 `"  "`。
- RED：`npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts -t "first ordered item after paragraph"` 失败，ordered detach handler 抢先处理，`runListBackspace` 未被调用。
- RED：`npm.cmd run test -- src/renderer/code-editor.test.ts -t "first ordered item after paragraph"` 失败，实际 `Intro\n\n1.first`，期望 `Intro\nfirst`。
- GREEN：`npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts` 通过，97 tests。
- GREEN：`npm.cmd run test -- src/renderer/code-editor.test.ts` 通过，189 tests。
- GREEN：指定 10 个 editing-experience probe 均通过：`empty-type-hash`、`empty-type-one-space`、`empty-type-three-spaces`、`paragraph-end-enter`、`paragraph-middle-enter`、`paragraph-start-enter`、`heading-end-enter`、`heading-end-repeated-enter`、`heading-empty-paragraph-backspace`、`heading-empty-paragraph-space`。
- GREEN：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build` 均通过。

## 已知风险

- 本轮只做了 TASK-056 需要的窄 selection normalization guard：whitespace-only 行不再被 structural blank normalization 吞掉。没有拆分 hidden marker 与 structural navigation normalization；该边界仍属 TASK-057。
- `structural-blank-arrow-down` 仍未处理，保持 TASK-057 / TASK-058 后续范围。

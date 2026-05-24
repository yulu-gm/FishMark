# TASK-054 物理编辑行模型

结果：PASS

## 本轮完成内容

- 新增 `PhysicalEditingDocument` / `EditingLine`，由 source 直接生成物理编辑行。
- 空文档暴露一条 active-capable empty line；非空 source 每个物理行都有稳定 offset、text、line break boundary 与 kind。
- 新增 `SemanticLineMap`，把 physical lines 与 parser-owned Markdown block 做 optional overlay。
- `createEditorDerivedState` 暴露 `editingDocument` 与 `activeLine`。
- 移除 parser-first whitespace fake paragraph 方向；whitespace-only source 的 `markdownDocument.blocks` 保持 parser 输出，`activeBlock` 可以为 null。

## 验证

- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts packages/editor-core/src/active-block.test.ts`：通过，3 个文件、18 项。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过。
- `git diff --check -- <TASK-054 files>`：通过，仅有 Windows LF/CRLF warning。

## 人工验收

1. 在代码中查看 `packages/editor-core/src/physical-editing-document.ts`，确认 `EditingLine` 包含 line number、offset、text、line break boundary、kind 和 document edge flags。
2. 查看 `packages/editor-core/src/derived-state/editor-derived-state.ts`，确认 derived state 返回 `editingDocument` 与 `activeLine`。
3. 查看 `packages/editor-core/src/active-block.test.ts`，确认 whitespace-only source 不再得到 fake paragraph active block。
4. 运行目标单测命令，确认 18 项通过。

## 剩余风险

- TASK-055 仍需把物理行模型接到可见 line surface decoration。
- TASK-056 仍需把 Enter / Backspace 改为 line-first routing。
- TASK-057 仍需拆分 selection normalization 边界。
- `SemanticLineMap` 当前以顶层 block 行范围为主，嵌套 list 更细粒度 ownership 可在 command routing 需要时扩展。

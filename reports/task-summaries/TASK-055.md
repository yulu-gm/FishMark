# TASK-055 基于物理行的编辑表面 decoration

状态：DEV_DONE

## 本轮完成

- 基于 TASK-054 的 `PhysicalEditingDocument` 为每个 CodeMirror source line 输出 `cm-fm-line-*` decoration。
- active empty / whitespace line 现在有稳定 class、正常 editable line box、`white-space: pre-wrap` 与可测 caret geometry。
- inactive structural separator 继续通过 `cm-inactive-blank-line` 折叠，但 active physical line 不再被折叠。
- whitespace-only 输入保留真实空格，不新增 hidden source marker 或 sentinel。
- Probe 已覆盖 `empty-type-one-space`、`empty-type-three-spaces`、`heading-empty-paragraph-space` 的物理行 class 与 caret 前进。

## 验证

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts`：通过，2 files / 76 tests。
- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts`：通过，1 file / 10 tests。
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "active empty and whitespace-only physical lines|active physical blank and whitespace line CSS|selection after inserted spaces"`：通过，3 focused tests。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过。
- `empty-type-one-space` / `empty-type-three-spaces` / `heading-empty-paragraph-space` editing-experience probes：通过。

## 已知问题

- `npm.cmd run test -- src/renderer/code-editor.test.ts` 在 TASK-055 交付时仍有 1 个既有失败：`breaks ordered list rendering from the current item when Backspace is pressed at content start`。该失败在 TASK-055 红灯阶段已存在，属于 TASK-056 的 Backspace 路由范围，后续已由 TASK-056 修复。

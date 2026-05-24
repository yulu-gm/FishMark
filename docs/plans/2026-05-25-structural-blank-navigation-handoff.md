# Structural Blank Navigation Handoff

## 改了什么

- 将 Backspace、ArrowUp、ArrowDown 统一到“可见物理行”移动模型：
  - 连续空行中的结构分割行会被跳过。
  - table/code fence/blockquote/list/heading 等样式块上方的结构空行也会被跳过。
  - 空格行仍然是可编辑行，不会被当作分割行跳过。
- 修复列表下方连续空行或空格行场景中 Backspace 直接跳回列表的问题。
- 修复上下方向键在结构分割行上需要多按一次或进入隐藏行的问题。
- 更新物理行 decoration/semantic role，使 whitespace-only 行保持 visible extra blank，而不是 structural separator。

## 落点文件

- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/physical-editing-document.ts`
- `packages/editor-core/src/structural-blank-lines.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/physical-editing-document.test.ts`
- `src/renderer/code-editor.test.ts`

## 已跑验证

- `npm.cmd test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/interactions/registry.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`

## 人工验收草稿

1. 在 ordered list 后连续按 Enter 产生多段空行，Backspace 每次只回到上一条可见行，不直接跳回列表。
2. 在 list/table/code fence/blockquote 上下方插入连续空行，用 ArrowUp/ArrowDown 移动，光标不进入隐藏结构空行。
3. 在任意块上下方插入只有空格的行，用 Backspace/ArrowUp/ArrowDown 验证光标能进入该空格行，不会跳过。
4. 从 table 第一行按 ArrowUp，应该跳过 table 上方结构空行，落到上一条可见行。

## 已知风险

- 本轮只调整结构空行与空格行的编辑导航模型，没有重做所有块级 Enter 生成策略。

# Heading Enter List Context

日期：2026-06-02

## 结果

PASS

## 完成内容

- 复现 `C:/Users/wuche/Desktop/todo.md` 的标题消失路径：文档开头有空行，`### Todo` 上执行 `Enter` 后，标题行被错误叠加 `cm-inactive-blank-line`。
- 修复 `resolveLineStartOffset(source, 0)` 在首字符为换行时错误返回 `1` 的边界问题。
- 补充 `source-utils` 单测和 renderer 回归测试，锁定标题上方/下方有空行且后接有序列表时，标题不能被结构空白行折叠。

## 根因

`appendLeadingBlockSeparatorDecoration` 用 `resolveLineStartOffset` 找 styled block 前一行。旧实现对 offset `0` 调用 `lastIndexOf("\n", 0)`，当文档首字符就是换行时会返回 `0`，最终把 line start 推到 `1`。这样首个结构空白行 decoration 落到了下一行标题上，CSS 的 `cm-inactive-blank-line` 把整行高度折成 `0`，标题视觉上消失。

## 验证

- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "keeps a heading visible after Enter when it sits above an ordered list gap"`：先失败后通过
- `npm.cmd run test -- packages/editor-core/src/source-utils.test.ts`：通过，2 项
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "creates a visible empty paragraph block on Enter at heading end"`：通过
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts`：通过，48 项
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts`：通过，35 项
- `npm.cmd run test -- src/renderer/code-editor.test.ts`：通过，209 项
- `npm.cmd run test`：通过，107 个文件、1178 项
- `npm.cmd run typecheck`：通过
- `npm.cmd run lint`：通过
- `npm.cmd run build`：通过
- scoped `git diff --check`：通过

## 人工验收

1. 打开 `C:/Users/wuche/Desktop/todo.md`。
2. 将光标放在 `### Todo` 行末，按 `Enter`。
3. 确认 `### Todo` 没有消失，仍以标题渲染态显示。
4. 确认光标停在 `1. 脚注` 上方的可见空行中。
5. 再按用户复现路径：在列表第一项开头删掉 marker，按 `Enter` 创建列表上方空行，在空行输入 `## 标题` 后按 `Enter`。
6. 确认新输入的标题仍可见，且后续列表内容没有被清空或并入标题。

## 剩余风险

- `npm.cmd run test:editing-experience -- --case heading-end-enter` 在本机两次超时，未取得 Electron probe PASS；已清理残留 probe 子进程。
- plain `git diff --check` 仍受本轮开始前已有的 `tmp/test.md` 尾随空格影响，本轮只对触碰文件执行 scoped whitespace check。

# 列表 Enter Typora 行为实现计划

日期：2026-05-30

## 目标

把 FishMark 列表内 `Enter` 收敛为 Typora-like 的结构编辑行为：

- 默认拆分当前列表项，创建新的同级列表项，并把光标右侧内容放入新项。
- 光标位于列表项内容开头时，升级当前列表项。
- 带子列表的嵌套项升级时，子树一起上移一级。
- 当前项已经是顶级列表项时，升级为正文内容，并保留 Markdown 块分割所需的结构空行。
- 带子列表的顶级项升级为正文时，子列表上移为正文后的后续列表。
- 顶级中间项升级为正文时，正文上下都保留结构分隔，避免后续 sibling 列表被解析成正文延续。
- 除顶级列表项升级为正文这一种情况外，不额外创建空行。
- 连续退出深层列表时，光标停在新创建或升级出来的位置，不跳回上一项内容末尾。

## 范围

修改范围限制在列表 Enter 行为及其验证：

- `packages/editor-core/src/commands/list-commands.ts`
- `packages/editor-core/src/commands/list-edits.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/test-report.md`

不修改 `Tab` / `Shift+Tab`、阅读态空行折叠、Markdown parser 数据结构、非折叠选区编辑和 `Shift+Enter` 行为。

## 执行步骤

- [x] 增加 renderer 回归测试，覆盖列表项拆分、嵌套项升级、顶级项升级正文、空嵌套项升级和空顶级项退出。
- [x] 先用失败用例复现空顶级有序列表项在后续 sibling 前错误继续列表的问题。
- [x] 补充失败用例复现顶级中间项升级正文时，后续 sibling 列表缺少结构分隔的问题。
- [x] 按 code review 补充带子列表 item 的内容开头升级逻辑，避免掉回旧 continuation fallback。
- [x] 在 `list-edits.ts` 中集中实现 `computeListItemEnter`，按 selection 上下文分派拆分、升级和顶级退出。
- [x] 在 `list-commands.ts` 中把列表 `Enter` 入口统一委派给新的语义 helper。
- [x] 复用现有有序列表编号归一化，避免手写后续 sibling 编号更新。
- [x] 保留顶级列表退出时的 `input.list-exit`，让 selection normalization 接受用户主动停在结构空白行。
- [x] 增加真实 Electron/Chromium editing-experience probe，验证深层列表连续 Enter 和顶级项升级正文时的 caret 几何位置。
- [x] 更新 `docs/test-report.md`，记录 RED/GREEN、相关测试、真实 probe 和最终质量门禁。

## 验证计划

- `npm run test -- src/renderer/code-editor.test.ts -t "upgrades an empty top-level ordered list item before later siblings" --reporter=verbose`
- `npm run test -- src/renderer/code-editor.test.ts --reporter=verbose`
- `npm run test -- packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts --reporter=verbose`
- `npm run test:editing-experience`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 验收标准

- 列表项中间或末尾按 `Enter` 创建同级新项，右侧内容进入新项。
- 列表项内容开头按 `Enter` 升级当前项；嵌套项升到父级，顶级项变正文。
- 顶级列表项变正文时有结构空行，其余列表 Enter 场景不额外创建空行。
- 带子列表的 item 在内容开头按 `Enter` 时不会创建空 sibling。
- 顶级中间项变正文后，后续 sibling 列表仍与正文分隔。
- 有序列表在拆分、升级、退出后编号保持正确。
- 深层列表连续 Enter 退出时，caret 不跳回上方列表项。
- 现有正文、引用、代码块、表格、inline marker、列表 Backspace 行为不回归。

# TASK-061 引用块内部 block 渲染与结构空行

状态：DEV_DONE

## 本轮完成

- `markdown-engine` 为 rich `parseMarkdownDocument()` 的 blockquote 增加 parser-owned `innerBlocks`，通过 quote-content 虚拟 source 复用现有 block parser，再用 offset map 映射回原始 Markdown offset，避免二/三层引用被误判为缩进代码。
- `editor-core` 的 blockquote 非激活态 decoration 先渲染连续 quote rail / marker，再让内部 paragraph / list / code fence / block math / Mermaid 复用外部 block 渲染路径。
- 引用块内 list 的视觉几何现在显式叠加 quote content column offset 与 list depth offset；引用内父子列表缩进继续遵守外部列表 `1.4em` 规则。
- blockquote Enter 行为改为：非空引用行生成 `\n>\n> `；空嵌套引用行像列表一样逐级退出到父引用层级，只有顶级引用空行 Enter 才退出引用块。
- 嵌套 blockquote Enter 的结构空行使用已提交的同层级前缀，例如 `> > text` 行末 Enter 生成 `> > text\n> > \n> > `，避免把结构空行误渲染为外层引用正文里的裸 `>`。
- HTML export 改为消费 `innerBlocks`，引用内 list / code / math 不再退化为普通文本。
- 引用块视觉改为按 Typora 导出 HTML 对齐：透明背景、4px `#dfe2e5` 左 rail、15px 左右内边距、0.8em 引用内结构空行、无圆角、无 inset shadow，并让 bundled Markdown theme 不再覆盖回卡片式 blockquote。
- 引用内 code fence 现在位于 quote 内容列内，使用 Typora export 的 `#f8f8f8` / `#e7eaed` 代码盒样式并隐藏语言角标；引用内 block math 保持透明背景，不再显示 FishMark 数学卡片底色。
- 顶层 blockquote marker 提交规则改为不要求 marker padding：裸 `>` 是活动空引用锚点，继续输入正文形成 `>text` 后进入提交态并隐藏 marker。
- 嵌套 blockquote marker 提交规则同步顶层：已提交引用内输入 `>` 时形成嵌套引用活动行，继续输入正文得到 `> >text` 后保持二层引用并隐藏完整 quote prefix。
- 引用块激活态继续隐藏原始 `>` marker，光标和正文起点对齐到引用内容列。
- 激活空引用行的 marker 隐藏方式从 `display:none` 改为透明零宽 caret anchor，避免 `> ` 后继续输入正文时被浏览器插到引用块前面。
- 引用内列表编辑同步外部列表语义：非空项 Enter 续同级项，空子项 Enter 升级为父项，空顶级项 Enter 先插入引用内结构空行再退出为引用正文；Tab / Shift+Tab、非空 marker Backspace、空嵌套 marker 后缩进清理，以及有序列表 content-start Backspace 断开列表都只改 quote 前缀后的 list marker / indent / 结构空行。
- 引用内列表 active decoration 现在只作用于当前列表行；同一引用块内的父项 / 兄弟项继续保持 inactive list marker，不会因为 active block 是外层 blockquote 而整段列表退回 raw marker。
- 修复嵌套引用内空列表项连续 Enter 的作用域选择：裸列表 marker 只沿最后列表项的尾部祖先链按 marker 类型和缩进匹配 scope；空子项升级到顶级后再次 Enter 会退出为原引用层级正文，不会回溯误选较早兄弟分支，也不再额外增加 quote depth。
- 修复引用内裸列表 marker 的 Tab 路径：即使 micromark 把 `> > -` 当作上一列表项的 lazy continuation，Tab 也会复用 active list root，在 quote prefix 后缩进并补 marker padding，得到可解析的 `> >   - ` 嵌套列表项。
- 补齐单层引用 padded empty list item 的 Tab 验证，并修复引用列表/嵌套引用退出后的尾部 marker 累积：同深度 structural separator 与活动空引用行成对 outdent 或退出，顶层最终只保留外部结构空行。
- 新增 parser、decoration、command、renderer、export 与 Electron editing-experience probe 覆盖。

## 2026-06-06 结构行模型验收补充

- 在 `editor-core` 新增共享 `StructuralLineModel`，把 body structural blank 与 blockquote 内部 bare `>` separator 统一成显式 line role / separator metadata。
- `line-visibility` 与 `line-block-adapter` 改为通过共享结构行模型处理 selection normalization、ArrowUp / ArrowDown 和 collapsed separator navigation，不再让 quote separator 与 body separator 分走两套判断。
- `runBlockquoteBackspace` 通过 `StructuralLineModel` 删除或合并结构 separator；从 quote 内下一条内容行行首 Backspace 会删除中间 bare `>` separator，同层 paragraph 可直接合并。
- 引用内列表 Enter / Backspace 补齐 bare marker、quoted ordered-list promotion、top-level quote list exit 和 quote prefix 后缩进清理边界，继续复用正文列表语义。
- editing-experience probe 新增 `blockquote-bare-separator-rendering`、`blockquote-structural-separator-navigation`、`blockquote-trailing-empty-separator-backspace`，覆盖 quote 内结构空行不可进入、Backspace 删除和 trailing separator 合并。

## 2026-06-06 macOS 验收结论

结果：PASS。

本轮按用户要求不把 Windows/打包图标测试作为 mac 验收阻断项；`src/main/after-pack-win-icon.test.ts` 与 `src/main/generate-icons.test.ts` 未纳入最终 mac 通过门禁。

验证：
- `npm run test -- packages/editor-core/src/structural-line-model.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts`：6 文件 504 项通过。
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote npm run test:editing-experience`：通过，`failures: []`。
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=list npm run test:editing-experience`：通过，`failures: []`。
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=structural-blank npm run test:editing-experience`：通过，`failures: []`。
- `npm run test:blockquote-typora-visual`：通过，`pass: true`。
- `npm run test -- --exclude src/main/after-pack-win-icon.test.ts --exclude src/main/generate-icons.test.ts`：110 文件 1277 项通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，保留既有 Vite chunk-size warning。
- `git diff --check`：通过。

## 2026-06-06 引用块末尾空行 Backspace 回归修复

- 修复引用块末尾空引用行 Backspace 暴露裸 `>` 的回归。
- `>` 与 `> ` 现在都按引用内 empty line 处理；当前空引用行和上方紧邻的同深度末尾空引用行会一次删除。
- 删除后光标落在上一条实际内容行文本末尾，quoted list 场景中为 `child list` 行尾。
- 新增 command、renderer 和 editing-experience probe 覆盖；本轮 macOS 验收不运行 Windows 打包测试。

## 关键验收

- `> 第一段\n>\n> 第二段` 渲染为连续引用块，中间裸 `>` 作为结构空行隐藏。
- `> - item\n> - item 2` 在引用块内按列表渲染，列表深度从引用内容起点计算。
- `>   - child`、`> > - nested item`、`> >   - nested child` 在引用块内继续按嵌套列表渲染，不把 quote 前缀算入 list depth。
- `> > 第二层` 与 `> > > 第三层` 在非激活态保留 blockquote 字体、offset 与行距；二/三层 quote content left delta 与 Typora 对照均为 19px / 38px。
- 引用内 fenced code 与 block math 复用外部代码块 / 公式预览规则。
- 引用块基础视觉样式与 `C:/Users/wuche/Desktop/4.1 引用：简单样例.html` 导出的 Typora blockquote / nested code fence computed style 对齐。
- 裸 `>`、`>text`、`> >` 与 `> >text` 不再要求 marker padding；继续输入正文得到 `>quote` / `> >nested` 时，文本留在引用块内且 quote prefix 隐藏。
- 光标位于活动裸 marker 行时保留可见 caret 锚点；光标移出裸 `>` 空引用行后，inactive 阅读态隐藏 raw marker 并保留 quote rail。
- 激活提交态引用块不显示 quote prefix，`>quote` / `> quote` 中光标位于引用正文列。
- 非空引用行 Enter 后光标位于新 `> ` 行；空嵌套引用行 Enter 先退出到父引用层级，顶级引用空行 Enter 才退出引用块。
- 非空嵌套引用行 Enter 后结构空行与新编辑行都保持同层级 quote depth，真实 Electron probe 确认 marker 装饰之外没有可见裸 `>`。
- 空三层引用行 Enter 后源码变为 `> 11\n> > 222\n> > > 33333\n> > `，真实 Electron probe 确认 active 行降为 depth 2 且 caret geometry 存在。
- `> - item` 行末 Enter 生成 `> - `；`>   - ` 空子项 Enter 生成父级 `> - `；`> - ` 空顶级项 Enter 生成 `>\n> `，让列表和后续引用正文之间有引用内结构空行。
- 二级引用中的 `> >   -` 连续 Enter 会先升级为 `> > -`，再退出为 `> > \n> > `；最终 active 行仍为 depth 2，不产生 depth 3 / 4 rail。
- 光标位于 `> - child` 时只有该行显示 active list marker，`> - parent` / `> - sibling` 仍显示 inactive list marker。
- 引用内有序列表 Enter 会归一后续编号，引用内列表 Tab / Shift+Tab 保留 quote 前缀并调整列表层级；Backspace 删除非空 list marker 时保留 `> `，空嵌套 list marker 删除后继续逐次清理 quote 前缀后的缩进。
- 引用内有序列表第二项正文开头 Backspace 与外部有序列表一致，会在引用内插入结构空行并把当前项断开为引用正文，例如 `> 1. 内容\n> 2. 内容2` 变为 `> 1. 内容\n>\n> 2.内容2`。
- HTML export 使用 parser-owned `innerBlocks`。

## 自动验证

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/markdown-engine/src/parse-markdown-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `npm.cmd run test -- src/renderer/app.autosave.test.ts -t "renders markdown lists and quotes"`
- `npm.cmd run test:blockquote-typora-visual`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote npm.cmd run test:editing-experience`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=nested-blockquote-marker-commits-after-text npm.cmd run test:editing-experience`
- `npm.cmd run test -- packages/editor-core/src/commands/line-parsers.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts src/renderer/editor-source-layout.test.ts src/shared/markdown-text-rendering-standard.test.ts`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=list npm.cmd run test:editing-experience`
- `npm.cmd run test -- packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts`
- `FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_PHASE=nested-final npm.cmd run test:blockquote-typora-visual`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/app.autosave.test.ts src/renderer/editor-source-layout.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='nested-quote-list-repeated-enter-exit'; npm.cmd run test:editing-experience`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## 人工验收

按 `docs/test-cases.md` 中 `TC-015B 引用块内部 block 同构` 执行。

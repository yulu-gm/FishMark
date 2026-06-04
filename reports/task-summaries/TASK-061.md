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
- 顶层 blockquote marker 提交规则改为 `> `：裸 `>` 与 `>text` 保持 paragraph，输入 marker padding 后才进入 blockquote。
- 嵌套 blockquote marker 提交规则同步顶层：已提交引用内输入 `>` 时仍保持当前层级并显示光标，输入后续 padding 形成 `> > ` 后才进入二层引用。
- 引用块激活态继续隐藏原始 `>` marker，光标和正文起点对齐到引用内容列。
- 激活空引用行的 marker 隐藏方式从 `display:none` 改为透明零宽 caret anchor，避免 `> ` 后继续输入正文时被浏览器插到引用块前面。
- 引用内列表编辑同步外部列表语义：非空项 Enter 续同级项，空子项 Enter 升级为父项，空顶级项 Enter 先插入引用内结构空行再退出为引用正文；Tab / Shift+Tab、非空 marker Backspace、空嵌套 marker 后缩进清理，以及有序列表 content-start Backspace 断开列表都只改 quote 前缀后的 list marker / indent / 结构空行。
- 引用内列表 active decoration 现在只作用于当前列表行；同一引用块内的父项 / 兄弟项继续保持 inactive list marker，不会因为 active block 是外层 blockquote 而整段列表退回 raw marker。
- 新增 parser、decoration、command、renderer、export 与 Electron editing-experience probe 覆盖。

## 关键验收

- `> 第一段\n>\n> 第二段` 渲染为连续引用块，中间裸 `>` 作为结构空行隐藏。
- `> - item\n> - item 2` 在引用块内按列表渲染，列表深度从引用内容起点计算。
- `>   - child`、`> > - nested item`、`> >   - nested child` 在引用块内继续按嵌套列表渲染，不把 quote 前缀算入 list depth。
- `> > 第二层` 与 `> > > 第三层` 在非激活态保留 blockquote 字体、offset 与行距；二/三层 quote content left delta 与 Typora 对照均为 19px / 38px。
- 引用内 fenced code 与 block math 复用外部代码块 / 公式预览规则。
- 引用块基础视觉样式与 `C:/Users/wuche/Desktop/4.1 引用：简单样例.html` 导出的 Typora blockquote / nested code fence computed style 对齐。
- 裸 `>` 与 `>text` 不进入 blockquote；`> ` 后进入 blockquote，继续输入 `quote` 得到 `> quote`，光标不跳到引用块外。
- 引用块内输入 `>` 得到 `> >` 时仍是 depth 1，selection 为 3 且光标可见；继续输入空格得到 `> > ` 时提交为 depth 2，selection 为 4 且光标可见。
- 激活引用块不显示 `>` marker，`> quote` 中光标位于 `quote` 正文列。
- 非空引用行 Enter 后光标位于新 `> ` 行；空嵌套引用行 Enter 先退出到父引用层级，顶级引用空行 Enter 才退出引用块。
- 非空嵌套引用行 Enter 后结构空行与新编辑行都保持同层级 quote depth，真实 Electron probe 确认 marker 装饰之外没有可见裸 `>`。
- 空三层引用行 Enter 后源码变为 `> 11\n> > 222\n> > > 33333\n> > `，真实 Electron probe 确认 active 行降为 depth 2 且 caret geometry 存在。
- `> - item` 行末 Enter 生成 `> - `；`>   - ` 空子项 Enter 生成父级 `> - `；`> - ` 空顶级项 Enter 生成 `>\n> `，让列表和后续引用正文之间有引用内结构空行。
- 光标位于 `> - child` 时只有该行显示 active list marker，`> - parent` / `> - sibling` 仍显示 inactive list marker。
- 引用内有序列表 Enter 会归一后续编号，引用内列表 Tab / Shift+Tab 保留 quote 前缀并调整列表层级；Backspace 删除非空 list marker 时保留 `> `，空嵌套 list marker 删除后继续逐次清理 quote 前缀后的缩进。
- 引用内有序列表第二项正文开头 Backspace 与外部有序列表一致，会在引用内插入结构空行并把当前项断开为引用正文，例如 `> 1. 内容\n> 2. 内容2` 变为 `> 1. 内容\n>\n> 2.内容2`。
- HTML export 使用 parser-owned `innerBlocks`。

## 自动验证

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/markdown-engine/src/parse-markdown-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `npm.cmd run test -- src/renderer/app.autosave.test.ts -t "renders markdown lists and quotes"`
- `npm.cmd run test:blockquote-typora-visual`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote npm.cmd run test:editing-experience`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=nested-blockquote-marker-commits-after-padding npm.cmd run test:editing-experience`
- `npm.cmd run test -- packages/editor-core/src/commands/line-parsers.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts src/renderer/editor-source-layout.test.ts src/shared/markdown-text-rendering-standard.test.ts`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=list npm.cmd run test:editing-experience`
- `npm.cmd run test -- packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts`
- `FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_PHASE=nested-final npm.cmd run test:blockquote-typora-visual`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/app.autosave.test.ts src/renderer/editor-source-layout.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## 人工验收

按 `docs/test-cases.md` 中 `TC-015B 引用块内部 block 同构` 执行。

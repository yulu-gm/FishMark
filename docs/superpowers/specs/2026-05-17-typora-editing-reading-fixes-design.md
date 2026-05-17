# Typora 式编辑与阅读体验修复设计

日期：2026-05-17

## 背景

`docs/problem.md` 汇总了一组 Markdown 编辑体验问题。经过源码和现有探针复核，本轮不直接照单全修，而是只处理已经确认真实存在、且符合 FishMark 产品方向的问题。

本轮产品基准是：FishMark 的编辑体验和阅读体验都参考 Typora，但不做像素级复刻。Markdown 文本仍然是唯一事实来源，保存时不自动重排整篇文档。

## 已核实结论

纳入本轮：

- 正文 `Enter` 当前是单换行语义，不符合 Typora 式新段落体验。
- 段落中间或段落末尾已有下一行时，当前光标落点会跳到原下一行内容开头。
- 分割线 `---` / `+++` 缺少专属 `Enter` 处理，落到通用 fallback 后光标行为不稳定。
- active inline 编辑 `**bold**`、`*italic*`、`~~del~~` 时，marker 字符完全不可见。
- 引用块 content-edit 分支使用 inactive inline decoration，导致引用块内 active inline 样式不一致。
- 代码高亮语言别名缺少 `c++` / `cpp` / `rust` / `go` / `java` 等常见语言。
- 快捷键提示面板缺少独立背景板，文字容易和正文重叠。

不纳入本轮：

- IME 列表重叠问题：当前 `npm run test:editing-experience` 通过，现有代码已有 active list marker widget 和 padding anchor；`docs/problem.md` 中的根因与当前实现不一致。除非出现新的复现步骤，否则本轮不改。
- 阅读/编辑模式切换大状态机：当前 CSS 已有基于 data attribute 的 transition。本轮不做大状态机重构，后续若视觉验收仍认为生硬，再单独开视觉任务。

## 目标行为

### 1. 正文 Enter 创建独立 block

正文 paragraph 中按 `Enter` 默认创建独立新 block，而不是同段落内软换行。

当源文本为：

```md
Alpha|
Beta
```

按 `Enter` 后应成为：

```md
Alpha

|

Beta
```

视觉上是 `Alpha`、一个光标所在的空 block、`Beta` 三个独立 block。用户继续输入时，会填充中间这个空 block。

### 2. 上下文优先级保持不变

`Enter` 必须区分上下文：

- 列表内容中按 `Enter` 创建新列表项。
- 空列表项按 `Enter` 继续使用现有退出列表规则。
- 引用块、代码块、表格继续走各自 handler。
- 只有普通 paragraph 才使用新的 block split 规则。
- `Shift+Enter` 继续表示同 block 内硬换行。

### 3. 阅读态与编辑态都参考 Typora

阅读态中，结构空行不作为正文内容行展示，段落间距由 block 样式控制。

编辑态中，用户创建出来且光标所在的空 block 必须可见、可定位、可输入。连续创建的额外空 block 不应被全部吞掉；只有纯结构分隔符可以折叠。

### 4. Active inline marker 可见且内容样式保留

编辑 inline 语法时，marker 和内容都要保留各自含义：

- `**bold**`：`**` 可见但弱化，`bold` 仍然加粗。
- `*italic*`：`*` 可见但弱化，`italic` 仍然斜体。
- `~~del~~`：`~~` 可见但弱化，`del` 仍然删除线。
- 嵌套样式继续叠加，例如 `***bold italic***` 不能丢失加粗或斜体效果。

### 5. 引用块 active inline 与普通段落一致

在引用块内编辑时，引用块保留 blockquote 视觉外观，但 inline active 规则与普通段落一致。当前行 marker 可见、内容样式保留；非当前行或非当前块继续保持阅读态渲染。

### 6. 代码高亮保持 lazy loading

补齐常见语言支持时，不允许把低频 parser 放进初始 chunk。新增语言 parser 必须沿用现有按需加载与缓存机制。

如果某个语言 parser 会显著增加包体积，应优先选择明确降级策略，而不是牺牲初始启动体验。

### 7. 快捷键提示面板可读

快捷键提示保留现有 `open` / `closing` 状态机和 item 动画。面板本体增加独立半透明背景、边框、阴影和毛玻璃效果，使提示文字不和正文直接重叠。

## 架构落点

### 命令层

主要落点：

- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/codemirror-markdown-command-adapter.ts`

新增或调整 paragraph structural split helper。它只处理普通 paragraph，不接管 list、blockquote、code fence、table。

分割线 `Enter` 可以作为独立 helper 接入 `runMarkdownEnterCommand`，位置应在 paragraph fallback 前，避免落入 CodeMirror 通用 fallback。

### Decoration 层

主要落点：

- `packages/editor-core/src/decorations/inline-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `src/renderer/styles/markdown-render.css`

active inline decoration 需要补 marker mark decoration。marker 使用新的 active marker class，避免复用 inactive marker 造成阅读态与编辑态含义混淆。

blockquote content-edit 分支应使用 active inline decoration，并保留 blockquote line / marker 的现有处理。

### Code Highlight

主要落点：

- `packages/editor-core/src/decorations/code-highlight-language-loader.ts`
- `packages/editor-core/src/decorations/code-highlight.test.ts`
- `package.json`
- `package-lock.json`

语言支持必须保持 lazy import。新增依赖后需要用 bundle 检查确认 parser 不进入 initial chunk。

### Renderer UI

主要落点：

- `src/renderer/editor/shortcut-hint-overlay.tsx`
- `src/renderer/styles/app-ui.css`
- `src/renderer/editor/shortcut-hint-overlay.test.tsx`

优先用现有 overlay 根节点承载背景板；只有测试或样式隔离需要时才增加额外 DOM wrapper。

## 错误处理与边界

- paragraph split 对非空选区应替换选区并创建新 block，光标落到新 block。
- paragraph split 不应自动格式化整篇文档，不应重排其他 block。
- 空 block 的可见性必须只依赖当前编辑态与选择状态，不能破坏阅读态结构空行折叠。
- code highlight parser 加载失败时保持静默降级，不阻塞编辑器输入。
- shortcut overlay 在 reduce-motion 场景下仍应可读。

## 测试计划

需要更新或新增：

- `packages/editor-core/src/commands/markdown-commands.test.ts`
  - paragraph 中间 `Enter` 创建独立空 block。
  - `Alpha|\nBeta` 变成 `Alpha\n\n|\n\nBeta`。
  - paragraph 末尾 `Enter` 创建新 block。
  - thematic break `Enter` 光标进入下一空 block。
- `src/renderer/code-editor.test.ts`
  - 真实 CodeMirror keydown 下 paragraph block split 与 selection 落点。
  - 列表、引用、代码块、表格 Enter 语义不回退。
  - active 空 block 可见且 caret 可定位。
- `packages/editor-core/src/decorations/block-decorations.test.ts`
  - active inline marker 可见。
  - active inline 内容仍保留 bold / italic / strikethrough 样式。
  - 引用块 content-edit 使用 active inline decoration。
- `packages/editor-core/src/decorations/code-highlight.test.ts`
  - 新语言别名解析。
  - 新 parser 仍按需加载。
- `src/renderer/editor/shortcut-hint-overlay.test.tsx`
  - overlay 仍保留 open / closing 状态。
  - 面板背景结构或可读性 class 存在。
- CSS contract 测试
  - active inline marker 样式不隐藏文本。
  - shortcut overlay 背景包含半透明背景和 blur。

最终验证命令：

```bash
npm run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/decorations/code-highlight.test.ts src/renderer/code-editor.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx
npm run test:editing-experience
npm run typecheck
npm run lint
npm run build
git diff --check
```

若新增代码高亮依赖，还需要补跑：

```bash
npm run perf:bundle
```

## 验收标准

- 正文 `Enter` 创建独立新 block，`Shift+Enter` 才创建同 block 内换行。
- `Alpha|\nBeta` 按 `Enter` 后得到 `Alpha\n\n|\n\nBeta`。
- 列表、引用、代码块、表格 Enter 语义不被正文规则覆盖。
- 分割线末尾按 `Enter` 后光标进入下一空 block。
- active inline marker 可见且淡化，内容样式保留。
- 引用块内 active inline 与普通段落表现一致。
- 常见语言代码块高亮支持补齐，且 parser 不进入 initial chunk。
- 快捷键提示面板文字不和正文直接重叠。
- IME 列表输入、列表 Backspace、表格外输入等现有真实探针不回退。

## 风险

- Paragraph Enter 语义会修改既有测试和文档中锁定的旧行为，属于产品语义变更，不是单点 bugfix。
- 空 block 可见性和结构空行折叠容易互相影响，需要用 renderer 测试和真实探针同时覆盖。
- 新增语言 parser 可能影响 bundle，需要保留 lazy import 和 bundle budget 检查。
- inline marker 可见后，selection normalization 与隐藏 marker 逻辑可能暴露旧假设，需要重点回归 marker 边界选择。

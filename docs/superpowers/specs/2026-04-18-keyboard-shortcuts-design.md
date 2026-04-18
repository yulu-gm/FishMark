# Keyboard Shortcuts Design

## Goal

为 Yulora 增加一批默认 Markdown 结构快捷键，让用户可以直接通过键盘切换常见结构，同时保持：

- Markdown 文本仍是唯一事实来源
- 行为可逆，再按一次可恢复
- 选区和光标落点稳定
- 不破坏现有 IME、undo/redo、autosave 与 block rendering 链路

本轮覆盖的快捷键范围：

- `Cmd/Ctrl+B`：粗体
- `Cmd/Ctrl+I`：斜体
- `Cmd/Ctrl+1`：一级标题
- `Cmd/Ctrl+2`：二级标题
- `Cmd/Ctrl+3`：三级标题
- `Cmd/Ctrl+4`：四级标题
- `Shift+Cmd/Ctrl+7`：无序列表
- `Shift+Cmd/Ctrl+9`：引用块
- `Alt+Shift+Cmd/Ctrl+C`：代码块

## Scope

本设计覆盖：

- 默认快捷键绑定
- 行内与块级“语义切换器”命令
- 基于现有 `parseMarkdownDocument()` 与 `ActiveBlockState` 的语义分析
- 语义分析到文本 edits 的转换
- CodeMirror keymap 接线
- editor-core 与 renderer 测试补强

本设计不覆盖：

- 用户自定义快捷键
- 菜单栏同步显示这些新快捷键
- 命令面板、工具栏按钮
- 多光标格式切换
- 任务列表、有序列表、链接、行内代码快捷键

## Current Context

当前项目已经具备三类相关基础设施：

1. Electron + React + CodeMirror 6 的桌面编辑器壳
2. `packages/markdown-engine` 中的 block map 与 inline AST
3. `packages/editor-core` 中现有的 keymap 与编辑命令链

现有链路是：

1. CodeMirror keymap 命中按键
2. `editor-core` 命令直接修改文本
3. 现有 `parseMarkdownDocument()`、active block 与 decorations 自动刷新

这条链已经用于：

- `Enter`
- `Backspace`
- `Tab`
- 列表续项
- 引用块续行
- 代码块围栏补全

缺口在于：当前还没有一套“先理解当前 Markdown 语义，再执行切换”的命令层。现有命令偏向单点编辑行为，不足以支撑一组成熟的结构切换快捷键。

## Recommendation

采用 **B 方案：语义切换器（semantic toggler）**。

核心思想：

- 快捷键入口仍放在 CodeMirror keymap
- 命令不直接做简单字符串替换
- 命令先读取当前选区、active block、block map、inline AST
- 基于当前语义判断“应该包裹、解包、升级、降级还是切换目标结构”
- 最后生成一组最小必要文本 edits，一次性 dispatch

这样做的原因：

- 行内命令需要识别当前选区是否已经处于 `strong` / `emphasis` 语义中
- 块级命令需要识别当前 block 是否已经是 `heading` / `list` / `blockquote` / `codeFence`
- 未来如果要把同一批命令复用到菜单、命令面板和工具栏，语义切换器比单纯字符串命令更容易复用

## Architecture

实现分三层：

### 1. Keymap entry layer

位置：

- `packages/editor-core/src/extensions/markdown.ts`

职责：

- 注册默认快捷键
- 把快捷键映射到对应语义命令

这一层不做语义判断，也不直接操作字符串。

### 2. Semantic command layer

建议新增：

- `packages/editor-core/src/commands/toggle-inline-commands.ts`
- `packages/editor-core/src/commands/toggle-block-commands.ts`

职责：

- 定义用户意图，例如：
  - `toggleStrong`
  - `toggleEmphasis`
  - `toggleHeading(level)`
  - `toggleBulletList`
  - `toggleBlockquote`
  - `toggleCodeFence`

这层负责把“按了什么快捷键”翻译成“要切到什么 Markdown 语义”。

### 3. Semantic analysis + edit planning layer

建议新增：

- `packages/editor-core/src/commands/semantic-context.ts`
- `packages/editor-core/src/commands/semantic-edits.ts`

职责拆分：

- `semantic-context.ts`
  - 从 `EditorState`、当前 selection、`ActiveBlockState`、`parseMarkdownDocument()` 中整理出语义上下文
  - 输出当前选区覆盖的行范围、命中的 block、选区命中的 inline node 信息

- `semantic-edits.ts`
  - 接收目标语义和上下文
  - 计算最小必要 edits
  - 计算新的 selection / cursor 落点

这样可以把“读懂文档”和“修改文本”分离，避免 toggle 命令文件本身变成巨型条件分支。

## Default Shortcuts

- `Cmd/Ctrl+B`：粗体
- `Cmd/Ctrl+I`：斜体
- `Cmd/Ctrl+1`：一级标题
- `Cmd/Ctrl+2`：二级标题
- `Cmd/Ctrl+3`：三级标题
- `Cmd/Ctrl+4`：四级标题
- `Shift+Cmd/Ctrl+7`：无序列表
- `Shift+Cmd/Ctrl+9`：引用块
- `Alt+Shift+Cmd/Ctrl+C`：代码块

选择依据：

- `Cmd/Ctrl+B` 与 `Cmd/Ctrl+I` 是最常见的行内格式快捷键
- `Cmd/Ctrl+1..4` 直接映射标题等级，比“循环切换标题等级”更可预测
- `Shift+Cmd/Ctrl+7` 与 `Shift+Cmd/Ctrl+9` 接近成熟文档编辑器里的常见模式
- `Alt+Shift+Cmd/Ctrl+C` 用 `C = code` 作为助记，并避开未来更可能用于链接的 `Cmd/Ctrl+K`

## Semantic Rules

### Shared rule: selection-first

全局优先级：

- 有非空选区时：优先以选区为中心执行切换
- 无选区时：作用于当前光标位置、当前行或当前 active block

### Inline: strong

目标命令：`toggleStrong`

行为：

- 选中普通文本时，包裹为 `**selected**`
- 若选区完整命中某个 `strong` 节点的内容区，则解包为普通文本
- 若选区部分落在 `strong` 中，先扩到最近可成立的 `strong` 内容边界，再执行切换
- 无选区时，插入 `****`，并把光标放到中间
- 若光标已位于空的 `****` 中间，再次触发时去掉 marker 并退出该状态

结果要求：

- 切换后选区仍尽量保持在正文内容上，而不是落到 marker 外侧

### Inline: emphasis

目标命令：`toggleEmphasis`

行为：

- 选中普通文本时，包裹为 `*selected*`
- 若选区完整命中某个 `emphasis` 节点的内容区，则解包为普通文本
- 若选区部分落在 `emphasis` 中，先扩到最近可成立的 `emphasis` 内容边界，再执行切换
- 无选区时，插入 `**`，并把光标放到中间
- 若光标已位于空的 `**` 中间，再次触发时去掉 marker 并退出该状态

### Block: heading

目标命令：

- `toggleHeading(1)`
- `toggleHeading(2)`
- `toggleHeading(3)`
- `toggleHeading(4)`

行为：

- 当前行不是目标等级标题时，切成目标等级
- 当前行已经是目标等级标题时，再按一次去掉 heading marker，恢复普通段落
- 当前行是其他等级标题时，直接改成目标等级
- 多行选区时，对覆盖到的每一行应用同一等级
- 只修改行首 heading marker，不改变正文文本

示例：

- `Paragraph` + `Cmd/Ctrl+2` -> `## Paragraph`
- `# Title` + `Cmd/Ctrl+3` -> `### Title`
- `### Title` + `Cmd/Ctrl+3` -> `Title`

### Block: bullet list

目标命令：`toggleBulletList`

行为：

- 普通行 -> 加 `- `
- 已有无序列表项 -> 去掉当前层列表 marker
- 多行选区时逐行批量切换
- 保留原有缩进与正文内容

### Block: blockquote

目标命令：`toggleBlockquote`

行为：

- 普通行 -> 加 `> `
- 已在引用块内 -> 去掉当前层 `> `
- 多行选区时逐行批量切换
- 保留原有正文与换行

### Block: code fence

目标命令：`toggleCodeFence`

行为：

- 有选区时：把选区包成 fenced code block
- 无选区时：插入成对 fence，并把光标放到中间空行
- 当前 `activeBlock` 已是完整 `codeFence` 时，再按一次解包
- 解包只移除 opening / closing fence，不修改内部内容

示例：

选中：

```md
alpha
beta
```

切换后：

```md
```
alpha
beta
```
```

再次切换时，恢复为原始纯文本内容。

## Execution Flow

固定命令执行流：

1. CodeMirror keymap 命中快捷键
2. `toggle-*` 命令读取当前 `EditorState`
3. `semantic-context` 生成语义上下文
4. `semantic-edits` 计算最小必要文本 edits 与目标 selection
5. 通过一次 `view.dispatch()` 提交事务
6. 现有 active block、decorations、autosave 链路自动刷新

实现约束：

- 每次快捷键触发只提交一次主事务
- 除代码块包裹外，只改必要 marker，不重写正文文本

## Edge Cases

本轮明确支持：

- 单选区
- 单选区跨多行
- 行内格式的包裹、解包、空选区插入
- 标题 1 到 4 级直接切换
- 列表 / 引用块逐行批量切换
- 完整代码块的包裹与解包

本轮明确不做：

- 多光标格式切换
- 跨多个不连续 inline AST 节点的复杂语义重写
- 混合选区中“部分已加粗、部分未加粗”的最优归并
- 有序列表、任务列表快捷键
- 菜单栏 accelerator 与 UI 文案同步显示

## Risks

### 1. IME / composition stability

风险：

- 快捷键切换与 composition guard 交错时，可能导致过早结构重写或选区漂移

控制方式：

- 语义命令继续运行在现有 CodeMirror extension 边界内
- 不绕开现有 composition guard 机制

### 2. Undo/redo semantics

风险：

- 一次快捷键如果拆成多次 dispatch，会让撤销体验变差

控制方式：

- 每个命令只允许提交一个主事务

### 3. Round-trip safety

风险：

- 语义切换器可能引入超出 marker 变更范围的文本改写

控制方式：

- `semantic-edits` 只允许最小必要 marker edits
- 禁止顺手重排正文、缩进或空行

### 4. Selection drift

风险：

- 包裹 / 解包后，选区可能落到 marker 外、行首或错误 block

控制方式：

- 每个命令的测试都必须同时断言文本结果和 selection 结果

## Tests

### editor-core

新增命令级测试，重点验证：

- 输入文本
- 初始选区
- 触发命令
- 输出文本
- 输出选区

建议新增：

- `packages/editor-core/src/commands/toggle-inline-commands.test.ts`
- `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- `packages/editor-core/src/commands/semantic-edits.test.ts`

### renderer

补真实 keymap 集成测试，验证：

- 快捷键能真正触发命令
- 不破坏现有 inactive decorations
- 不破坏 active block 更新
- 不破坏 autosave / blur 保存链路

建议补强：

- `src/renderer/code-editor.test.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`

### Regression focus

重点回归：

- undo / redo
- composition guard
- heading / list / blockquote / code fence 现有渲染
- 保存后 Markdown 文本只发生预期 marker 变化

## Acceptance

1. `Cmd/Ctrl+B` 与 `Cmd/Ctrl+I` 可对选区执行包裹与解包，并支持空选区成对 marker 插入
2. `Cmd/Ctrl+1..4` 可把当前行或多行选区切为对应等级标题；再次按同级快捷键可恢复普通段落
3. `Shift+Cmd/Ctrl+7` 可切换无序列表
4. `Shift+Cmd/Ctrl+9` 可切换引用块
5. `Alt+Shift+Cmd/Ctrl+C` 可包裹或解包代码块
6. 每个命令都可逆，undo / redo 语义自然
7. 不破坏现有 IME、autosave、active block 与 block rendering 基线

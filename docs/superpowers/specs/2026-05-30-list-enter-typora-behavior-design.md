# 列表 Enter Typora 风格行为设计

日期：2026-05-30

## 背景

FishMark 的目标是提供类似 Typora 的单栏 Markdown 编辑体验。当前列表 `Enter` 行为已经覆盖了一部分场景：非空列表项可以继续创建列表项，列表项内容开头可以升级，空列表项可以退出列表，且上一轮已经修复了嵌套列表后空顶级列表项退出时光标跳回上一条子列表内容末尾的问题。

这次需求不是扩展新的 Markdown 语法，而是把列表内 `Enter` 的产品规则收敛成稳定、可预测、接近 Typora 的结构编辑语义。

## 目标

列表内 `Enter` 按当前光标上下文分为三类：

1. 默认行为：在列表内容中间或末尾按 `Enter`，创建一个新的同级列表项，并把光标右侧内容移动到新列表项内。
2. 内容开头行为：当光标位于当前列表项内容开头时，升级当前列表项。
3. 顶级升级行为：如果当前列表项已经是顶级列表项，则升级为正文内容；当它前面仍有列表内容时，必须创建 Markdown 块分割所需的结构空行。

除“顶级列表项升级为正文”之外，列表 `Enter` 不应额外创建空行。

## 目标示例

### 普通拆分

```md
1. ab|cd
```

按 `Enter` 后：

```md
1. ab
2. |cd
```

后续同级有序列表项需要继续按范围归一化编号。

### 嵌套列表项升级

```md
1. parent
  1. |child
```

按 `Enter` 后：

```md
1. parent
2. |child
```

这里不插入空行，因为仍在列表结构内，只是把当前 item 升到父级 scope。

如果当前嵌套项自身还有子列表，升级时子树一起上移一级，等价于对当前 item subtree 执行一次 outdent。

### 顶级列表项升级为正文

```md
1. previous
2. |body
```

按 `Enter` 后：

```md
1. previous

|body
```

空行是列表 block 与正文 block 的 Markdown 结构分隔，不是额外的视觉空行。

如果被升级的是中间顶级列表项，并且后面仍有列表 sibling，则正文上下都需要保留结构分隔，避免后续列表被解析成正文段落延续。

如果顶级项下面还有子列表，则当前项内容变成正文，子列表上移为正文后的后续列表。

### 深层连续退出

从如下状态开始：

```md
1. 111
2. 222
  1. 2.1
    1. 2.1.1|
```

连续按 `Enter` 时，第一次创建当前深度的新空列表项；再次按 `Enter` 逐级升级空项；到顶级空项再按 `Enter` 后退出为正文空 block。光标应始终停留在用户看到的新位置，不允许跳回上一条列表内容末尾。

## 非目标

- 不改变 `Tab` / `Shift+Tab` 的列表缩进快捷键语义。
- 不重写 Markdown parser 或列表 block 数据结构。
- 不把阅读态空行折叠规则改成新的视觉模型。
- 不处理 `Shift+Enter`。它继续表示同 block 内硬换行或现有上下文行为。
- 不处理非空选区的复杂结构编辑。本轮只保证折叠光标场景。

## 架构落点

### 命令入口

`packages/editor-core/src/commands/list-commands.ts` 仍然是列表 `Enter` 的入口。它负责读取 CodeMirror selection、当前 physical line、list marker 和 semantic context，然后委派给列表编辑 helper。

入口层只做上下文判断和分派，不直接拼接复杂列表 source。

### 语义编辑

`packages/editor-core/src/commands/list-edits.ts` 是核心落点。新增或调整 helper，使列表 `Enter` 有明确的优先级：

1. 非折叠 selection：返回 `null`，交给上层 fallback。
2. 光标在内容开头，且当前项有右侧内容或当前项为空：执行升级。
3. 光标不在内容开头，当前行非空：执行同级拆分。
4. 光标在空列表项末尾：执行空项升级或顶级退出。

有序列表编号仍由现有 `finalizeListEdit` / `normalizeOrderedListBlock` 统一处理，避免局部手算导致后续 sibling 编号漂移。

### Selection 与结构空行

顶级列表项升级为正文时，如果它前面还有列表内容，需要生成一个结构分割空行，并把 selection 放到正文内容开头或正文空 block 上。

上一轮引入的 `input.list-exit` 语义仍然保留，用于告诉 selection normalization：这次光标停在结构空白处是用户主动退出列表，而不是需要折回上一块内容的隐藏 selection。

### 编辑体验探针

`src/renderer/markdown-editing-experience-probe.ts` 继续作为真实 Chromium/Electron 证据。新增列表 Enter 专项 case，验证不只是 source 和 selection offset 正确，还要验证 caret 几何位置不跳回上一项。

## 测试策略

本轮属于用户可见编辑行为变化，需要补测试，但不做“所有任务都加测试”的无脑扩张。测试只覆盖高风险和新增语义：

- `src/renderer/code-editor.test.ts`
  - 列表项中间 `Enter` 拆分同级项，右侧内容进入新项。
  - 嵌套列表项内容开头 `Enter` 升级到父级列表。
  - 顶级列表项内容开头 `Enter` 升级成正文并保留结构空行。
  - 空嵌套列表项 `Enter` 升级为空父级项且不额外创建空行。
  - 空顶级列表项 `Enter` 退出到正文空 block，光标保持在可见空 block。
- `src/renderer/markdown-editing-experience-probe.ts`
  - 深层有序列表连续 `Enter` 退出时，caret 始终落在当前可见位置。
  - 顶级内容开头升级为正文时，caret 位于列表下方正文行，不回到上一项。
- `docs/test-report.md`
  - 记录最终验证命令和结果，文档使用中文。

## 验收标准

- 列表内容中间或末尾 `Enter` 创建同级新列表项，右侧内容进入新项。
- 列表项内容开头 `Enter` 升级当前项；嵌套项升到父级，顶级项变正文。
- 除顶级项变正文所需结构空行之外，不产生额外空行。
- 带子列表的嵌套项升级时，子树一起上移一级。
- 带子列表的顶级项变正文时，子列表上移为后续列表。
- 顶级中间项变正文时，后续列表 sibling 仍保持列表结构。
- 有序列表编号在拆分、升级、退出后保持正确归一化。
- 空列表项连续 `Enter` 的退出路径符合 Typora 风格，光标不跳回上一项。
- 现有正文、引用、代码块、表格、inline marker、列表 Backspace 行为不回归。
- `npm run test:editing-experience` 的新增真实探针通过。

# 统一变形块交互层设计

## 目标

为 Yulora 的变形块建立统一的交互层，彻底解决 `code fence`、表格、引用块、列表、标题、分割线等视觉布局与源码布局不一致时产生的光标跳转、上下导航和鼠标命中错误。

## 背景

当前编辑器已经把多种 Markdown block 渲染成“视觉上更接近成品”的形态，但输入层仍然大量依赖 CodeMirror 默认的源码坐标映射：

- 源码偏移和活跃块判定由 `active-block.ts` 驱动。
- decoration / widget / CSS 会隐藏标记、增加 padding、替换整块 DOM。
- 鼠标与方向键逻辑仍然大多直接依赖 `posAtCoords`、`posAtDOM` 和默认垂直移动。

这导致交互层和渲染层不一致。一旦某个块隐藏了源码行、隐藏了前缀、或者用视觉 padding 代替了真实文本区域，默认映射就会在边界处失真。

## 根因

根因不是单个块的特例遗漏，而是项目缺少一层正式的“视觉块交互映射”能力。

当前系统里：

- table 已经有半套独立模型：`TableCursorState` + widget 回调。
- 其它变形块仍然以分散特判方式补洞。
- 块的视觉布局信息只存在于 decoration/CSS 中，没有统一暴露给交互系统。

因此每增加一种变形块，或者每给现有块增加新的视觉 padding / 隐藏标记，都可能重新引入同类问题。

## 设计原则

- Markdown 文本仍然是唯一事实来源。
- 不保留兼容路径，不继续堆块级特判。
- 交互规则按 block 类型集中定义，而不是散落在 keymap 和 DOM 事件中。
- 只在“视觉布局不等于源码布局”的地方接管输入，其余情况回退到普通源码映射。
- 测试以跨块导航矩阵为主，而不是单个 bug 回归。

## 新架构

新增统一的 `transformed-block interaction` 层，核心由三部分组成：

1. `BlockInteractionAdapter`
   为每种 block 类型声明统一交互能力：
   - 指针命中修正
   - `ArrowUp` / `ArrowDown` 进入与退出
   - 左右边界命中修正
   - 视觉前缀与边界 anchor 映射

2. `BlockInteractionContext`
   在一次输入事件中统一提供：
   - 当前文档源码
   - `MarkdownDocument`
   - 当前 selection
   - 活跃 block
   - 当前行信息
   - 相邻块 / 相邻行
   - DOM 命中行元素与样式信息

3. `BlockInteractionRegistry`
   按 block 类型注册 adapter，并在输入路径中统一调度：
   - `mousedown`
   - `ArrowUp`
   - `ArrowDown`
   - 必要的左右边界导航

## 适用块

首批统一纳入：

- `table`
- `codeFence`
- `blockquote`
- `list`
- `heading`
- `thematicBreak`
- `paragraph`

其中：

- `table` 迁移现有 `TableCursorState` 与 widget 回调逻辑，变成统一交互层的一个 adapter。
- `paragraph` 主要承担普通块基线行为，作为统一回退项。

## 交互模型

### 1. 视觉前缀命中

适用于标题、引用块、列表、任务列表、分割线等视觉上隐藏或替换前缀的块。

点击以下区域时，不能直接信任 CodeMirror 默认命中：

- 隐藏 marker 区域
- padding-left 区域
- block 装饰生成的伪元素区域

统一策略：

- 命中视觉前缀时，直接落到该视觉行的 block 起始 anchor。
- 需要暴露 marker 编辑时，优先落到源码 marker 开始位置。
- 需要优先落到内容区时，由 adapter 返回 `contentStartOffset`。

### 2. 视觉边界导航

适用于 code fence、table、blockquote、多行 list 等上下存在“视觉块边界”的情况。

统一策略：

- `ArrowUp` 从块的第一条可见内容行进入块的上边界 anchor。
- `ArrowDown` 从块的最后一条可见内容行进入块的下边界 anchor。
- 从块外相邻空行进入块时，沿用相同 adapter 的 `enterFromAbove` / `enterFromBelow` 规则。

### 3. 整块替换型块

table 已经是 `Decoration.replace + Widget`。

重构后：

- table 不再拥有一套旁路式的专有输入系统。
- 它继续保留 widget DOM，但选择、上下出入、边界列定位都通过统一 adapter 暴露给扩展层。

## 文件改动方向

- 新增 `packages/editor-core/src/interactions/`
  - `types.ts`
  - `registry.ts`
  - `context.ts`
  - `pointer.ts`
  - `vertical-navigation.ts`
  - `adapters/`
- 重写 `packages/editor-core/src/extensions/markdown.ts` 中的输入调度
- 收敛 `packages/editor-core/src/commands/markdown-commands.ts` 的块级导航逻辑
- 迁移 `packages/editor-core/src/table-cursor-state.ts` 相关能力到统一交互层
- 删除旧的 code fence/table 特判分支
- 扩展 `src/renderer/code-editor.test.ts`

## 风险

- 方向键行为会跨多个块类型统一重写，容易牵动现有 table 行为。
- `mousedown` 捕获会更早接管，需要避免误伤普通文本命中。
- `jsdom` 下的坐标测试脆弱，需要尽量使用可控 DOMRect 和样式值断言。

## 验收标准

- 从 `code fence` 第一/最后一条可见内容行上下移动时，进入正确 fence。
- 点击 `code fence` 的顶部/底部视觉 padding 时，落到正确 fence。
- 点击 heading/list/blockquote 的视觉前缀区域时，落到稳定、可预期的源码 anchor。
- 表格上下进出、空行进入、点击单元格、点击空白边界保持稳定。
- 分割线点击与上下导航不再跳错块。
- 相关测试、lint、typecheck、build 全部通过。

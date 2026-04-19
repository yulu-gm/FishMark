# 表格 Rail Icon Tools 设计

## 背景

当前表格编辑模式进入后，左侧 rail 会切换到一组表格结构工具，但现状存在两个问题：

1. 工具以纵向文字按钮形式出现，视觉密度偏低，和 rail 的窄轨道形态不匹配。
2. 工具按钮更像一块独立面板，没有真正收敛进 rail 的图标化控件语言。

这次改造只解决表格编辑模式下 rail tools 的呈现问题，不改表格命令语义，不扩展主题 manifest，不让主题接管图标资源。

## 目标

- 将表格 rail tools 改为图标按钮形态，稳定收纳在 rail 内部。
- 鼠标悬停和键盘聚焦时显示 tooltip，减少常驻文字占位。
- 图标资源由 app 内置提供，避免把资源映射引入主题包 schema。
- 主题继续只负责样式层，能够控制按钮壳层、tooltip、间距和状态观感。
- 保持现有表格结构命令、焦点行为和 rail 模式切换逻辑不变。

## 非目标

- 不修改 `table-commands`、`table-edits`、`table-context` 的行为。
- 不把表格工具改成浮出 rail 的独立面板。
- 不让主题包提供自定义 SVG 或 icon 映射。
- 不把 tooltip 文案交给主题或主题包配置。

## 现状

当前实现位于：

- `src/renderer/editor/App.tsx`
- `src/renderer/styles/app-ui.css`

表格模式下，`App` 在 `.table-tool-strip` 中直接渲染 7 个文字按钮：

- Row Above
- Row Below
- Column Left
- Column Right
- Delete Row
- Delete Column
- Delete Table

这些按钮直接调用现有的表格命令入口，因此业务行为本身已经满足需求，问题集中在 renderer 层的结构和样式表达。

## 方案概述

采用“内置 SVG 资源 + 通用 icon button 组件 + 主题样式控制”的方案：

1. app 内置一组表格 rail 专用 SVG 图标。
2. renderer 把表格 action 列表收敛成结构化配置，而不是直接手写 7 个文字按钮。
3. 新增轻量的 rail icon button 渲染单元，统一负责图标、可访问标签、危险态和 tooltip 锚点。
4. 主题继续通过 `styles/ui.css` 和基础 token 控制外观，不接管图标内容。

这样可以把“哪些工具存在、点了触发什么命令”保留在 app 代码内，把“这些工具看起来像什么”继续交给主题 CSS。

## 组件与数据结构

### 1. 表格 rail action 描述收敛为配置

把当前散落在 JSX 中的 7 个 `<button>` 收敛成静态 action 列表。每个 action 至少包含：

- `id`
- `label`
- `icon`
- `tone`
- `onClick`

其中：

- `label` 同时用于 tooltip 文案和 `aria-label`
- `icon` 指向 app 内置 SVG 资源
- `tone` 至少区分 `default` 与 `danger`

这样可以减少 JSX 重复，也让后续测试可以围绕 action 列表和渲染结果建立稳定断言。

### 2. 新增表格 rail icon button 渲染单元

新增一个专用的小组件或同文件内的局部渲染函数，用于统一输出单个 table tool：

- 外层仍然是原生 `button`
- 内部显示 SVG 图标
- `aria-label` 使用 action label
- 通过 `data-tone` 或同等属性标记危险态
- 在 hover / focus 时驱动 tooltip 显示

该渲染单元只负责 UI 表达，不承载业务逻辑，不缓存命令状态，不修改表格焦点。

### 3. SVG 资源内置在 renderer

表格工具图标由 app 提供，建议以独立图标模块或同目录图标常量形式存在。要求：

- 优先使用 `currentColor`
- 视口与线宽统一，确保在 rail 小尺寸按钮里清晰可读
- 风格保持几何化、简洁，不依赖主题资源

首批图标覆盖：

- 插入上方行
- 插入下方行
- 插入左侧列
- 插入右侧列
- 删除当前行
- 删除当前列
- 删除整表

## 交互设计

### 1. Rail 内布局

表格工具列继续挂在现有 `.app-rail-mode-group-table` 内，不改变 rail 模式切换机制。

布局调整为：

- 工具按钮使用固定方形或近方形尺寸
- 在 rail 中纵向堆叠
- 间距控制为紧凑但可点按
- 工具列宽度不再追随文字长度

这保证工具是真正“塞进 rail 框内”，而不是在 rail 里放一列文字卡片。

### 2. Tooltip 行为

tooltip 由 renderer 自绘，文案由代码提供。

规则如下：

- 鼠标悬停按钮时显示 tooltip
- 键盘聚焦按钮时同样显示 tooltip
- tooltip 默认出现在 rail 右侧，避免遮挡图标本体
- tooltip 只显示单条 action label，不扩展为说明面板
- rail 退出表格模式或按钮失焦后，tooltip 隐藏

tooltip 不需要单独的主题配置入口，只需要暴露稳定类名和数据属性，让主题 CSS 可以控制外观。

### 3. 危险态表达

删除类工具不再用大块文字按钮提示风险，而是保留 icon button 形态，通过样式表达危险态：

- 使用 `data-tone="danger"` 或等效 class
- 主题可对边框、背景、前景色、hover 状态做差异化
- 不改变 tooltip 文案

这样既能保留风险提示，又不会打破 rail 的图标一致性。

## 主题控制边界

本次不扩 `ThemePackageManifest`。

主题可控制的范围：

- 按钮尺寸
- 圆角
- 边框
- 背景
- 文本和图标颜色
- hover / focus / active / danger 状态
- tooltip 背景、描边、阴影、字体、偏移和动效
- rail 内工具组间距与内边距

主题不可控制的范围：

- tool 的存在与顺序
- tool 对应的命令行为
- icon 的 SVG 内容
- tooltip 文案

这保持了主题系统的职责边界：主题负责视觉语言，app 负责交互语义和产品结构。

## 文件级改动方向

### `src/renderer/editor/App.tsx`

- 把当前手写文字按钮改成基于 action 配置的 icon button 列表
- 接入 tooltip 所需的状态或悬停锚点逻辑
- 保持现有表格命令回调不变

### `src/renderer/styles/app-ui.css`

- 重写 `.table-tool-strip` 的布局样式
- 新增 table rail icon button、SVG 容器、tooltip 的结构样式
- 保留并扩展 rail 模式切换动画，不引入硬切

### `src/renderer/styles/primitives.css`

如果 rail icon button 与现有实体按钮原语足够接近，可以把共性收敛到 primitives；如果差异明显，则维持在 `app-ui.css` 中，避免为单一场景过度抽象。

### 测试文件

- `src/renderer/app.autosave.test.ts`
- 如有必要，补充组件级或样式选择器断言所在测试文件

## 状态流与行为边界

这次改造只替换“命令触发入口的呈现层”，不改变下游状态流：

1. 用户进入表格编辑模式
2. renderer 仍依据现有 shortcut group / rail mode 切换到 table rail
3. 用户点击 icon button
4. 仍调用既有 `insertTableRowAbove` 等命令回调
5. 命令继续通过当前表格编辑链路更新文档与焦点

因此，本次不会改变：

- active editing context 的判定
- 表格焦点回落策略
- Markdown rewrite 逻辑
- shortcut hint overlay 的上下文切换

## 可访问性

虽然视觉上改为纯图标按钮，但必须保留基础可访问性：

- 每个按钮都有明确 `aria-label`
- 键盘 Tab 可访问
- `focus-visible` 有足够清晰的 ring
- tooltip 只是辅助信息，不作为唯一可访问名称来源

## 错误处理与回退

本次不引入外部资源加载，因此错误处理以“稳定回退”为主：

- 若某个 icon 配置遗漏，渲染层应优先回退到安全的默认占位图形或不渲染图标，但不能使 rail 整体崩溃
- tooltip 状态异常时，按钮点击行为仍应可用
- 即使主题未覆盖任何新样式，默认样式也必须可用且布局正确

## 测试策略

### 1. Renderer 结构回归

更新现有 rail mode 测试，验证：

- 表格模式下仍切到 `table-editing`
- `table-tool-strip` 仍存在
- 文字按钮不再直接作为可见内容出现
- icon button 数量与 action 数量一致
- 每个按钮存在 `aria-label`

### 2. Tooltip 交互回归

补充 hover / focus 相关测试，验证：

- hover 某个 tool 时出现对应 tooltip 文案
- 失焦或退出表格模式后 tooltip 消失

如果测试环境对真实 hover 有限制，可以退一步断言 tooltip 状态属性或受控渲染结果。

### 3. 样式约束回归

沿用现有 CSS 规则断言方式，验证：

- `.table-tool-strip` 使用适合 rail 的紧凑布局
- tool button 为固定 icon button 尺寸而不是文字块级按钮
- tooltip 存在稳定选择器和基础定位规则
- danger 态存在独立样式钩子

### 4. 行为不回归

保留或复用现有表格 rail 操作测试，确认：

- 增删行列和删表仍然可触发
- 焦点仍落在逻辑合理的单元格

## 验收标准

- 进入表格编辑模式后，rail 中展示的是 icon tools，而不是文字按钮列表
- tools 视觉上完整收纳在 rail 宽度内
- hover / focus 时会弹出 tooltip，文案正确
- 删除类工具具备明显但克制的危险态
- 切换进出表格模式时，rail 过渡仍然平滑
- 默认主题与现有主题在未扩 manifest 的前提下都能正常显示
- 相关 renderer 测试更新并通过

## 风险与取舍

### 1. Tooltip 位置与 rail 边界

rail 靠近窗口边缘，tooltip 若定位不当，容易遮住工作区或与其它浮层打架。首版应优先选择简单稳定的右侧锚定，不做智能碰撞求解。

### 2. primitives 抽象过度

rail icon button 和 settings icon button 虽然有相似之处，但交互语义与视觉目标并不完全相同。首版应谨慎复用 primitives，只提炼明确共性，避免为“看起来类似”而耦合。

### 3. 测试对文案断言的迁移

原有测试若直接依赖按钮文本，需要迁移到 `aria-label`、数量和 tooltip 文案断言，避免把“视觉不再常驻显示文字”误判为功能缺失。

## 结论

本次改造采用“app 内置 SVG + icon button 组件/渲染单元 + 主题 CSS 控制壳层样式”的路径，以最小范围完成表格 rail tools 的视觉收敛。它不改变表格编辑命令链，不扩主题 schema，只优化 renderer 呈现与交互反馈，符合当前项目“稳定 UX 优先于功能数量”的产品原则。

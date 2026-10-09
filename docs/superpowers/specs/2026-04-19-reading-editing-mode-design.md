> The automatic mode entry/exit rules below are historical. The user-approved [2026-10-09 explicit F11 interaction](../../plans/2026-10-09-explicit-reading-presentation.md) supersedes them in the current local candidate.

Date: 2026-04-19
Scope: renderer shell, workspace layout, renderer tests, shared runtime naming, design docs

## Goal

用明确的 `阅读模式` / `编辑模式` 取代旧的 `focus mode` 概念。

这次改造的目标不是给旧聚焦模式换文案，而是重定义 shell 交互模型：

- 已有文档默认以阅读方式打开
- 新建文档默认直接进入编辑
- 正文获取光标时立即进入编辑模式
- 编辑模式可通过 `Esc` 或点击正文空白区退出到阅读模式
- 阅读模式下收起非必要 shell UI，并让工作区真正居中、左右留白对称

这次改造必须移除旧的手动 / 自动聚焦模式、空闲计时和相关设置项，不保留兼容层。

## Problems To Solve

当前实现里的 `focus mode` 仍然是“写作时安静一点”的 shell 状态，而不是产品意义上的模式：

- 触发方式依赖手动切换或自动空闲计时
- 命名与真实体验不匹配，用户无法直觉理解“当前是在阅读还是编辑”
- rail 收起后仍保留占位列，主工作区不会真正回到窗口中心
- 大纲与状态条等 UI 关系仍然围绕旧的聚焦语义组织

新的模式模型需要把“正在看文档”和“正在编辑文档”变成明确的二元状态，而不是旧聚焦逻辑的别名。

## Approved Interaction Model

### 1. Mode Definitions

应用运行时只保留两个 shell 模式：

- `reading`
- `editing`

其中：

- `reading` 表示以阅读为主的极简壳层
- `editing` 表示以输入、导航和结构编辑为主的工作壳层

这两个模式只改变 shell chrome、布局和部分运行时交互，不改变 Markdown 文本事实来源、CodeMirror 事务语义、autosave 语义或 round-trip 保真。

### 2. Entry Rules

模式入口规则如下：

- 打开已有 Markdown 文档时，默认进入 `阅读模式`
- 新建文档时，默认直接进入 `编辑模式`
- 用户在正文区域点击并让光标进入正文时，立即进入 `编辑模式`

这里的“进入编辑模式”不要求内容已经发生变化；只要正文获得明确编辑光标，就应切换。

### 3. Exit Rules

从 `编辑模式` 退出到 `阅读模式` 有两个入口：

- 按 `Esc`
- 点击正文空白区

退出后应立即收起阅读模式对应的 shell UI，不保留延迟计时或过渡中的兼容状态。

### 4. Body Blank Area Definition

“正文空白区”只在文档画布内部成立，指：

- 属于正文工作区的留白区域
- 不属于真实文本内容
- 不属于可交互块或控件

以下区域都不应被算作“正文空白区”：

- 标题栏
- 左侧 rail
- 设置抽屉
- 大纲面板
- 表格工具
- 图片交互控件
- 其他 shell 或块级交互控件

### 5. Outline Behavior

阅读模式要保证主工作区居中，因此大纲面板在阅读模式下需要临时收起。

规则：

- 进入阅读模式时，如果大纲当前打开，则临时隐藏
- 回到编辑模式时，恢复进入阅读模式前的大纲开关状态
- 阅读模式不永久修改用户的大纲偏好，它只覆盖运行时可见性

## Layout And Chrome Behavior

### 1. Reading Mode Shell

阅读模式下收起以下 shell UI：

- 左侧 rail
- 顶部 workspace header
- 底部状态条
- 大纲面板

阅读模式不保留模式提示条，不保留状态条里的当前模式显示，也不提供额外的显式切换按钮。回到编辑模式的入口就是正文交互与 `Esc`。

### 2. Editing Mode Shell

编辑模式恢复完整工作壳层：

- 显示左侧 rail
- 显示顶部 workspace header
- 显示底部状态条
- 按阅读模式前的记录恢复大纲可见性

### 3. Workspace Centering

阅读模式下，主工作区必须真正回到窗口中心，而不是继续为 rail 保留静态列宽。

具体要求：

- rail 收起时释放原有列宽占位
- workspace 改成对称居中的阅读布局
- 正文列保留舒适的最大阅读宽度，不无限拉伸
- 多出来的窗口宽度优先分配给左右留白，且两侧留白保持一致

目标体验是：

- 窗口变宽时，内容仍然稳定居中
- 阅读模式看起来像“只剩文档本身”，而不是“编辑器 UI 被藏起来一点”

### 4. Transition Behavior

模式切换应通过稳定的 class / data attribute 驱动 layout state，而不是通过卸载大块结构节点来完成。

要求：

- 编辑器主体持续挂载
- 切换模式时不 remount 编辑器
- 布局和 chrome 的进入 / 退出继续使用现有动画体系，但语义从 focus mode 改为 reading / editing mode

## Runtime State Model

renderer shell 应维护明确的模式状态，而不是旧的 focus source 状态：

- `shellMode: "reading" | "editing"`
- `isOutlineOpen`
- `isOutlineClosing`
- `outlineVisibilityBeforeReading: boolean`
- `isSettingsOpen`
- `isSettingsClosing`

本轮移除：

- `focusModeSource`
- 手动 focus toggle 入口状态
- auto focus idle timer
- keyboard / pointer 驱动的 auto focus controller

## Preferences And Settings

本轮不再保留旧的 `focus` 偏好模型。

需要删除：

- `preferences.focus.triggerMode`
- `preferences.focus.idleDelayMs`
- 设置面板中的 `Focus` 分组
- 任何“Manual / Auto focus”文案
- 任何编辑区角落的 focus toggle

阅读模式 / 编辑模式是运行时交互状态，不新增新的持久化偏好项。

## Theme Runtime Naming

这次改造不做“旧 focus 命名继续存活”的兼容方案。

因此凡是直接暴露给 renderer runtime、CSS env、shader uniform、文档说明的 `focus mode` 命名，都应改为与阅读 / 编辑模式一致的术语。

推荐方向：

- `focusMode` -> `readingMode`，值仍为 `0 | 1`
- `0` 表示 editing
- `1` 表示 reading

这样可以保持主题 runtime 仍是简单二值输入，同时彻底消除旧概念。

## Testing Strategy

需要新增或改写 renderer 回归测试，覆盖：

1. 模式入口与默认态
   - 打开已有文档默认进入 `阅读模式`
   - 新建文档默认进入 `编辑模式`
   - 点击正文进入 `编辑模式`

2. 模式退出
   - `Esc` 从 `编辑模式` 退出到 `阅读模式`
   - 点击正文空白区从 `编辑模式` 退出到 `阅读模式`

3. 壳层可见性
   - 阅读模式收起 rail、header、status bar
   - 编辑模式恢复这些 shell UI
   - 阅读模式收起大纲
   - 回到编辑模式后恢复进入阅读模式前的大纲状态

4. 布局行为
   - 阅读模式释放 rail 占位列宽
   - workspace 在阅读模式下采用居中对称布局
   - 编辑器主体在切换过程中不被卸载

5. 设置与偏好移除
   - settings 中不再渲染旧 focus 设置
   - shared preferences 不再暴露旧 focus 字段

6. 主题 runtime
   - runtime env / shader state 使用新的 `readingMode` 语义
   - 任何旧 `focus mode` 暴露点都被替换

## Non-Goals

这轮不包括：

- 改变 Markdown 内容语义
- 改变 autosave 触发规则
- 改变编辑器 block 渲染模型
- 为阅读模式新增工具栏、状态条或模式提示组件
- 为模式切换新增菜单项或额外快捷键

## Documentation Impact

因为这是一次明确的用户可见行为变化，实现时还需要同步更新：

- `docs/design.md`
- 相关 renderer 测试说明
- 涉及 focus mode 的设计文档与文案
- 完成任务时对应的 test report / task summary / backlog 记录

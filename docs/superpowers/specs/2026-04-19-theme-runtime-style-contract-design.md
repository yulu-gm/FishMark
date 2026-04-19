# Theme Runtime Style Contract Design

## Goal

重新定义 Yulora 的主题与基础样式规范，让主题包成为唯一正式的视觉扩展协议，并尽可能把 app 的视觉决策暴露给主题。

这次设计需要同时满足：

- 主题协议保持唯一，不做任何兼容层
- 内置 `default` 与外部主题包遵循完全相同的协议
- renderer 内部样式不再依赖零散硬编码颜色或局部私有变量
- 主题不仅能控制静态 CSS，也能消费一小组正式 runtime 环境数据驱动 shader 或动态样式
- 设置页提供统一的主题安装目录入口，并在 macOS / Windows 上走各自原生打开方式

## Scope

本设计覆盖：

- `ThemePackageManifest` 的正式协议升级
- 主题 CSS contract 的重新分层与命名空间
- renderer 的主题 runtime 输入、挂载顺序和数据桥接
- CSS / shader 共享的 runtime env 设计
- settings 里的主题目录入口与平台行为
- 默认主题与现有外部主题包的同步升级
- 相关文档、测试与人工验收更新

本设计不覆盖：

- 在线主题市场
- 主题签名、权限或沙箱增强
- 新的主题参数类型
- 新的 shader surface 类型
- 平台特定主题协议分叉
- 让主题自定义请求任意运行时数据

## Current Problems

当前主题系统已经统一到单一 `theme package` 架构，但“主题能控制什么”仍然不够正式，也不够完整。

### 1. 样式暴露面不系统

当前主题主要通过 `tokens`、`styles.ui`、`styles.editor`、`styles.markdown` 等文件参与渲染，但 app 内部仍然保留不少局部视觉约定：

- 有些颜色和表面变量已经主题化
- 有些组件样式仍带有实现细节层的硬编码
- 未来表格、代码高亮、更多 markdown 结构接入时，还没有一套稳定的正式 slot 体系

结果是主题作者无法清楚知道“哪些是稳定接口，哪些只是当前实现细节”。

### 2. 动态主题数据还是补丁式桥接

当前 runtime 已经支持：

- 主题参数进入 settings
- 参数同步到 CSS 变量
- 参数映射到 shader uniform

但这套路径更像“参数桥接”，不是“主题 runtime 的正式环境数据模型”。如果后续继续把字数、聚焦状态、窗口尺寸等数据逐项外挂，会让 contract 很快变得碎片化。

### 3. renderer 内部仍缺少强约束

如果没有一套明确的样式 contract，renderer 很容易继续出现：

- 组件直接消费硬编码颜色
- 某些新功能先写死样式，再临时补主题变量
- 主题专用变量名渗透到 app 自身样式里

这会让主题协议看起来存在，但实际上 app 仍然保留大量隐式视觉决定。

### 4. 主题目录入口还不完整

设置页当前可以刷新主题包，但缺少直接打开主题安装目录的入口。用户安装新主题仍需要自己去找 `userData/themes`，这对真实使用不够友好。

## Recommendation

采用“唯一 theme package 协议 + 正式样式 contract + 内建 runtime env”的模型。

### Recommendation Summary

- 升级唯一 `ThemePackageManifest`，引入 `contractVersion`
- 保持 `manifest` 只声明能力，不承担样式本体
- 用“foundation tokens + semantic slots”两层变量体系统一 CSS contract
- renderer 只允许消费正式 `--yulora-*` 样式接口
- 新增内建 `theme env`，同时服务 CSS 与 shader
- settings 提供统一的“打开主题目录”入口
- 平台差异只保留在 `main` 的原生打开逻辑，不进入主题协议
- 现有主题包与默认主题一起升级，不保留旧协议兼容层

## Manifest Contract

### Contract Direction

本次不另起第二种主题 schema，也不把大量视觉细节塞进 `manifest`。唯一正式协议仍然是 `theme package`，但它升级为带版本号的正式 contract：

```ts
type ThemePackageManifest = {
  contractVersion: 2;
  id: string;
  name: string;
  version: string;
  author: string | null;
  supports: { light: boolean; dark: boolean };
  tokens: Partial<Record<"light" | "dark", string>>;
  styles: Partial<Record<"ui" | "editor" | "markdown" | "titlebar", string>>;
  layout: { titlebar: string | null };
  scene: {
    id: string;
    sharedUniforms: Record<string, number>;
    render?: ThemeSurfaceRenderSettings;
  } | null;
  surfaces: Partial<Record<ThemeSurfaceSlot, ThemeSurfaceDescriptor>>;
  parameters: ThemeParameterDescriptor[];
};
```

### Manifest Responsibilities

`manifest` 的职责固定为“能力声明”：

- 包身份：`contractVersion`、`id`、`name`、`version`、`author`
- mode 支持声明：`supports`
- 样式入口：`tokens`、`styles`
- 动态 surface 与 scene：`scene`、`surfaces`
- 用户可调参数：`parameters`

`manifest` 不负责：

- 声明平台分叉样式
- 声明主题想请求哪些 runtime 数据
- 声明 app 结构或布局权限
- 用额外字段承载具体颜色、字号、阴影本体

### Hard Rules

- `contractVersion` 必须匹配当前 app 支持的唯一版本
- 不匹配时整包忽略，不做旧版兼容
- 主题包里的所有路径仍必须留在包根目录内
- 动态 runtime env 不需要主题显式声明，所有主题默认可用

## CSS Contract

### Two-Layer Variable Model

主题 CSS contract 统一拆成两层。

#### 1. Foundation Tokens

这是主题最底层的设计原语，只定义数值、颜色和抽象属性，不绑定具体组件。

示例：

- `--yulora-color-bg-0`
- `--yulora-color-bg-1`
- `--yulora-color-fg-0`
- `--yulora-color-accent-0`
- `--yulora-radius-sm`
- `--yulora-radius-lg`
- `--yulora-space-2`
- `--yulora-font-ui`
- `--yulora-font-document`
- `--yulora-shadow-panel`
- `--yulora-blur-glass`
- `--yulora-duration-fast`

#### 2. Semantic Slots

这是 app 真正消费的正式样式接口。renderer 内置样式只能读取语义 slot，不允许直接依赖硬编码颜色或主题私有变量。

### Semantic Slot Groups

为避免未来表格、代码高亮、更多 markdown 结构再次长出补丁式变量，本次一次性定义完整 slot 组。

#### App Shell

- `--yulora-app-bg`
- `--yulora-workspace-bg`
- `--yulora-rail-bg`
- `--yulora-panel-bg`
- `--yulora-panel-border`
- `--yulora-panel-shadow`
- `--yulora-statusbar-bg`
- `--yulora-statusbar-border`
- `--yulora-titlebar-bg`

#### Text Hierarchy

- `--yulora-text-primary`
- `--yulora-text-secondary`
- `--yulora-text-muted`
- `--yulora-text-accent`
- `--yulora-text-danger`
- `--yulora-text-on-accent`

#### Controls And Feedback

- `--yulora-control-bg`
- `--yulora-control-bg-hover`
- `--yulora-control-bg-active`
- `--yulora-control-border`
- `--yulora-control-fg`
- `--yulora-focus-ring`
- `--yulora-selection-bg`
- `--yulora-selection-fg`
- `--yulora-banner-info-bg`
- `--yulora-banner-warning-bg`
- `--yulora-banner-error-bg`

#### Editor Source

- `--yulora-editor-bg`
- `--yulora-editor-fg`
- `--yulora-editor-muted`
- `--yulora-caret-color`
- `--yulora-current-line-bg`
- `--yulora-gutter-fg`
- `--yulora-active-block-bg`
- `--yulora-active-block-border`

#### Markdown Content

- `--yulora-markdown-body`
- `--yulora-markdown-heading`
- `--yulora-markdown-heading-marker`
- `--yulora-markdown-link`
- `--yulora-markdown-link-hover`
- `--yulora-markdown-strong`
- `--yulora-markdown-emphasis`
- `--yulora-markdown-quote-fg`
- `--yulora-markdown-quote-border`
- `--yulora-markdown-list-bullet`
- `--yulora-markdown-list-text`
- `--yulora-markdown-task-done`
- `--yulora-markdown-hr`
- `--yulora-markdown-inline-code-fg`
- `--yulora-markdown-inline-code-bg`
- `--yulora-markdown-code-fg`
- `--yulora-markdown-code-bg`
- `--yulora-markdown-code-border`

#### Reserved Future Content Slots

这些 slot 现在就进入正式协议，即使对应功能还没有完全接入：

- `--yulora-markdown-table-border`
- `--yulora-markdown-table-header-bg`
- `--yulora-markdown-table-header-fg`
- `--yulora-markdown-table-cell-bg`
- `--yulora-markdown-table-row-stripe`
- `--yulora-markdown-code-token-keyword`
- `--yulora-markdown-code-token-string`
- `--yulora-markdown-code-token-number`
- `--yulora-markdown-code-token-comment`
- `--yulora-markdown-code-token-function`
- `--yulora-markdown-code-token-type`

### CSS File Responsibilities

#### `tokens/light.css` and `tokens/dark.css`

- 只放 foundation tokens 和 mode 差异
- 不写具体组件 selector
- 这是 light/dark 的唯一 CSS 分叉点

#### `styles/ui.css`

- 只负责 app shell 与通用控件
- 包括 rail、settings、outline、status bar、button、input、select、banner、dialog
- 主要消费 semantic slots

#### `styles/editor.css`

- 只负责编辑态
- 包括 CodeMirror、选区、光标、当前块、gutter、编辑区表面、编辑字体

#### `styles/markdown.css`

- 只负责 markdown 渲染态内容
- 包括 heading、quote、list、inline code、code block、link、hr，以及未来的 table 与代码高亮

#### `styles/titlebar.css`

- 只负责受控标题栏的视觉
- 是否实际启用由宿主平台能力决定

### Renderer Rules

- `base.css`、`app-ui.css`、`settings.css`、`markdown-render.css`、`editor-source.css` 只保留结构、布局和最小 fallback
- 所有用户可感知视觉决策必须先落到正式 `--yulora-*` slot，再允许组件消费
- app 样式中不允许直接消费主题私有变量，例如 `--rain-glass-*`
- 主题包内部可以维护私有变量，但 app 只认正式 `--yulora-*` 接口

## Theme Runtime Env

### Goal

把少量运行时动态数据从“零散桥接”升级为主题 runtime 的正式内建能力。

第一阶段只暴露：

- `wordCount`
- `focusMode`
- `themeMode`
- `viewport`

### Single Source Of Truth

runtime env 只维护一份源数据，然后同时暴露给 CSS 与 shader。

不允许：

- CSS 看到一套值，shader 看到另一套值
- 主题自己声明还想拿别的运行时数据
- 主题通过 `parameters` 伪装请求 runtime env

### CSS Output

在 `document.documentElement` 上暴露正式环境变量：

```css
:root {
  --yulora-env-word-count: 1234;
  --yulora-env-focus-mode: 1;
  --yulora-env-viewport-width: 1440;
  --yulora-env-viewport-height: 900;
}
```

`themeMode` 不再额外暴露数值 CSS 变量，而是通过正式属性提供：

```css
:root[data-yulora-theme-mode="light"] {}
:root[data-yulora-theme-mode="dark"] {}
```

### Shader Output

为所有动态 surface 提供统一内建 uniforms：

```glsl
uniform float u_wordCount;
uniform float u_focusMode;
uniform float u_themeMode;
uniform vec2 u_viewport;
```

含义固定：

- `u_wordCount`: 当前文档字数
- `u_focusMode`: `0` 或 `1`
- `u_themeMode`: `0`=light，`1`=dark
- `u_viewport`: 当前 surface viewport 尺寸

这些 uniforms 属于 runtime 内建能力：

- 不需要主题在 `manifest` 中声明
- 不允许主题覆盖
- 与已有 `parameters`、`scene.sharedUniforms` 并存，但优先级和职责独立

### Default Values

当运行时数据暂时不可用时，统一使用稳定默认值：

- `wordCount = 0`
- `focusMode = 0`
- `themeMode` 仍按当前 resolved mode
- `viewport = vec2(0.0, 0.0)`

### Intended Use

这组 env 足够支持第一阶段的交互主题表达：

- 字数越多，shader 或 CSS 装饰越丰富
- 聚焦模式下自动收敛动画与视觉噪声
- light / dark 模式触发不同视觉分支
- 窗口尺寸驱动背景构图和密度

## Settings And Platform Behavior

### Theme Directory Entry

在 settings 的“主题包”选择区新增一个文件夹图标按钮：

- 保留现有“刷新主题”按钮
- 新增“打开主题目录”按钮
- 按钮永远打开统一安装根目录：`<userData>/themes/`
- 不打开当前选中主题目录
- 不区分 builtin / external

这样能保持安装心智唯一且稳定。

### Native Behavior

renderer 只调用一个统一受限 IPC，例如：

- `yulora:open-themes-directory`

平台差异只放在 `main`：

- macOS：用 Finder 打开 `<userData>/themes/`
- Windows：用 Explorer 打开 `<userData>/themes/`
- 如果目录不存在，先确保创建再打开

平台差异不进入主题协议，不进入 renderer settings schema。

### Settings Copy

设置页文案统一使用“主题包”：

- 不再出现“主题家族”概念
- hint 明确说明主题会从应用主题目录自动扫描并加载

## Error Handling

### Theme Package Failure

- `manifest` 非法：整包忽略
- `contractVersion` 不匹配：整包忽略
- 路径逃逸包根目录：对应字段丢弃
- CSS slot 缺失：由 app fallback 样式兜底，但不接受旧变量名
- shader 编译、资源加载或运行失败：动态层降级到静态 CSS

### App Contract Violation

renderer 自己也必须遵守 contract：

- 新功能不能先写死视觉样式、后补主题变量
- 任何正文、列表、表格、代码高亮相关视觉决策，都必须先有正式 slot

### Theme Directory Failure

- 目录不存在时先创建
- 原生打开失败时，只给出“无法打开主题目录”提示，不影响 settings 使用

## Verification

### Shared Contract Tests

- `ThemePackageManifest` 新字段与 `contractVersion` 校验
- 正式 CSS slot 清单与默认主题覆盖检查
- runtime env 数据结构、命名和默认值测试

### Main / Preload Tests

- 只识别新协议主题包
- 主题目录打开 IPC 可用
- macOS / Windows 分别验证原生打开逻辑与创建目录行为

### Renderer Tests

- 主题切换时 slot 能正确更新
- light / dark 切换时 `data-yulora-theme-mode` 与 token 层一致
- 字数、聚焦状态和 viewport 变化能同步到 `document.documentElement`
- shader surface 能拿到一致的 `u_wordCount`、`u_focusMode`、`u_themeMode`、`u_viewport`

### Theme Package Regression

- `default` 升级到新协议后仍是稳定 fallback
- 现有外部 shader 主题一起升级并通过回归
- 至少验证一个纯 CSS 主题和一个 shader 主题

### Manual Acceptance

1. 打开 settings，确认“主题包”区域存在文件夹图标按钮。
2. 点击按钮，确认系统打开 `<userData>/themes/`。
3. 在该目录安装或替换主题后，点击“刷新主题”，确认列表更新。
4. 切换主题与 light/dark 模式，确认基础视觉正常变化。
5. 打开支持动态效果的主题，确认字数、聚焦模式和窗口尺寸变化可驱动主题表现。
6. 分别在 macOS 和 Windows 上确认“打开主题目录”行为正常。

## Acceptance

本设计完成后，主题系统需要满足：

1. 仓库中只存在唯一正式 theme package 协议。
2. `default` 与外部主题包遵循相同 contract。
3. renderer 只消费正式 `--yulora-*` 语义样式接口。
4. 主题 runtime 内建提供 `wordCount`、`focusMode`、`themeMode`、`viewport`。
5. CSS 和 shader 看到的是同一份 runtime env 数据。
6. 设置页可以直接打开 `<userData>/themes/`。
7. macOS 与 Windows 的目录打开行为在 `main` 中原生实现。
8. 不保留旧 manifest、旧变量名或旧 bridge 的兼容逻辑。


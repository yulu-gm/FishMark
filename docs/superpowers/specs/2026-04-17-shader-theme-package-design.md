# Shader Theme Package Design

## Goal

把当前“CSS 主题家族”系统扩展为“统一主题包”系统，使外部主题包可以声明：

- 主题 tokens
- UI / editor / markdown / title bar 样式
- 标题栏布局
- 多个受控的动态 shader surface

第一阶段重点支持：

- 整个应用 workbench 的动态背景
- 自定义标题栏的动态背板
- 与 Shadertoy 风格写法部分兼容的 shader 作者体验

同时保持以下原则不变：

- Markdown 文本仍是唯一事实来源
- main / preload / renderer 严格分离
- renderer 不执行第三方任意 JS
- UX 稳定性、输入与保存安全性优先于视觉特效

## Scope

本设计覆盖：

- 统一主题包目录协议
- 主题包 manifest 模型
- 多 surface shader runtime 的能力边界
- 受控自绘标题栏的主题化模型
- 全局背景与标题栏共享场景状态的方式
- 安全边界、降级策略、性能预算
- 与当前主题系统的迁移方向

本设计不覆盖：

- 在线主题市场
- 主题包签名与发布流程
- 任意第三方 UI 组件注入
- 完整 Shadertoy 全量兼容
- 任意跨 surface 的 compositor / scene graph

## Current Context

当前实现特点：

- `main` 进程负责扫描 `<userData>/themes/<familyId>/<mode>/*.css`
- renderer 通过 `tokens/ui/editor/markdown` 四类 CSS part 挂载主题
- `theme.mode` 仍只表示 `system | light | dark`
- `theme.selectedId` 表示主题家族 id
- 当前主题系统没有 manifest、资源声明、标题栏布局协议，也没有 shader runtime

这套模型足够支撑纯 CSS 主题，但无法干净地扩展到：

- 整窗动态背景
- 自定义标题栏主题化
- Shader 资源与通道声明
- 复杂视觉效果的降级与性能控制

## Recommendation

采用“统一主题包 + 多 surface 渲染宿主”模型。

核心思路：

- 外部主题包是一个声明式目录，不是一个可执行扩展
- 主题包统一声明 tokens、styles、layout、surfaces
- shader 由 Yulora 自己的 runtime 托管，而不是让主题包运行任意 JS
- 标题栏主题化通过“受控自绘 title bar host”完成，而不是开放任意 DOM 注入
- 第一阶段只实现少数高价值 surface，但协议从一开始按可扩展模型设计

## Theme Package Layout

建议的主题包目录结构：

```text
my-rain-glass/
  manifest.json
  tokens/
    light.json
    dark.json
  styles/
    ui.css
    editor.css
    markdown.css
    titlebar.css
  layout/
    titlebar.json
  shaders/
    workbench-background.glsl
    titlebar-backdrop.glsl
    shared/
      noise.glsl
  assets/
    preview.png
    textures/
      noise-1024.png
      paper-grain.png
```

约束：

- `manifest.json` 必须存在
- `tokens/styles/layout/shaders/assets` 都是可选模块
- 主题包默认只从本地已安装目录加载
- 主题包不包含 JS entrypoint，不执行任意脚本
- CSS 只能作用在 Yulora 暴露的稳定宿主结构与变量上

## Theme Manifest Model

建议 manifest 具备如下结构：

```json
{
  "id": "rain-glass",
  "name": "Rain Glass",
  "version": "1.0.0",
  "author": "Example",
  "supports": {
    "light": true,
    "dark": true
  },
  "tokens": {
    "light": "./tokens/light.json",
    "dark": "./tokens/dark.json"
  },
  "styles": {
    "ui": "./styles/ui.css",
    "editor": "./styles/editor.css",
    "markdown": "./styles/markdown.css",
    "titlebar": "./styles/titlebar.css"
  },
  "layout": {
    "titlebar": "./layout/titlebar.json"
  },
  "scene": {
    "id": "rain-glass-scene",
    "sharedUniforms": {
      "rainAmount": 0.7,
      "glassBlur": 0.6
    }
  },
  "surfaces": {
    "workbenchBackground": {
      "kind": "fragment",
      "scene": "rain-glass-scene",
      "shader": "./shaders/workbench-background.glsl",
      "channels": {
        "0": { "type": "image", "src": "./assets/textures/noise-1024.png" }
      },
      "transparent": false,
      "quality": {
        "maxFps": 30,
        "maxPixelRatio": 1.5,
        "pauseWhenBlurred": true,
        "disableWhenReducedMotion": true
      }
    },
    "titlebarBackdrop": {
      "kind": "fragment",
      "scene": "rain-glass-scene",
      "shader": "./shaders/titlebar-backdrop.glsl",
      "transparent": true
    }
  }
}
```

设计约束：

- `supports.light/dark` 表示主题包支持的颜色模式
- `styles` 和 `tokens` 是完整主题的一部分，不再把 shader 看成外挂特效
- `surfaces` 的 key 只能使用 Yulora 预定义 surface 名
- `scene` 用来承载共享时间轴、随机种子、统一 uniforms 等共享状态

## Theme Package Semantics

主题包是统一定义，而不是“CSS 主题 + 特效插件”。

一个主题包可以同时控制：

- 基础色彩 token
- 编辑区与 Markdown 呈现样式
- 标题栏布局和标题栏样式
- 全局背景和标题栏背板等动态 surface

这样做的原因：

- 长期语义更统一
- 作者心智模型更清晰
- 后续支持更多动态区域时不需要重做协议

## Surface Model

第一阶段预定义的 surface：

- `workbenchBackground`
- `titlebarBackdrop`
- `welcomeHero`

这些 surface 是由宿主控制的稳定挂载点，不允许主题包任意定义新的挂载位置。

能力分级建议：

1. `fragment`
   单一 fragment shader，适合背景、标题栏背板、欢迎页头图

2. `buffered`
   允许少量 buffer pass，用于未来兼容更复杂的雨滴、模糊、后处理

3. `composited`
   更复杂的跨 surface 组合能力，本设计明确不在第一阶段实现

第一阶段仅要求实现：

- `fragment`
- 为后续 `buffered` 预留 manifest 扩展空间

## Shader Runtime

runtime 采用“部分兼容 Shadertoy”的策略。

兼容目标：

- 让主题作者能较低成本迁移常见 Shadertoy shader
- 保留 `mainImage(out vec4 fragColor, in vec2 fragCoord)` 这种熟悉写法
- 支持常见输入变量：
  - `iTime`
  - `iResolution`
  - `iMouse`
  - `iFrame`
  - `iChannel0..iChannel3`

不直接照搬的部分：

- 资源绑定不靠站内 UI，而靠 manifest 的 `channels`
- surface 绑定不在 shader 里声明，而由 manifest 决定
- 是否支持多 pass、pass 如何依赖，由 Yulora 协议控制
- 不承诺 100% Shadertoy 行为一致

除 Shadertoy 风格变量外，runtime 还可以暴露 Yulora 自己的扩展 uniform，例如：

- `uThemeMode`
- `uWindowFocused`
- `uAccentColor`
- `uPanelGlass`
- `uReduceMotion`

这些扩展 uniform 应保留 Yulora 命名空间，不伪装成 Shadertoy 原生变量。

## Shared Scene State

为了让整个应用看起来像“一张连续的动态背景”，建议采用：

- surface 分开挂载
- scene 状态共享

推荐模型不是“一个超大画布渲染全窗口再切片”，而是：

- `workbenchBackground` 与 `titlebarBackdrop` 各自渲染
- 两者共享相同 scene id
- 共享时间轴、随机种子、交互状态、主题 uniforms、通道资源
- 每个 surface 使用自己的 viewport 进行采样

这样可以兼顾：

- 视觉连续性
- 结构清晰
- 各 surface 独立降级和独立性能控制

## Title Bar Model

标题栏主题化采用“受控自绘 title bar host”，而不是主题包自行创建任意标题栏 DOM。

建议宿主结构：

```text
TitlebarHost
  ├─ WindowControlsSlot
  ├─ LeadingSlot
  ├─ CenterSlot
  ├─ TrailingSlot
  ├─ DragRegionLayer
  └─ BackdropSurface(titlebarBackdrop)
```

主题包只允许通过 `layout/titlebar.json` 配置有限布局，例如：

```json
{
  "height": 44,
  "windowControls": {
    "platform": "system",
    "placement": "leading"
  },
  "slots": {
    "leading": ["app-icon"],
    "center": ["document-title"],
    "trailing": ["theme-toggle", "window-actions"]
  },
  "dragRegions": ["leading", "center"],
  "compactWhenNarrow": true
}
```

边界约束：

- 主题包不能注入任意交互逻辑
- 只能从宿主预定义的标题栏 item 中选用
- 拖拽区由宿主解释，不由主题包直接绘制原生行为
- 窗口控制按钮仍按平台规则渲染，主题只影响其视觉风格与背板
- 标题栏 shader 仅作为 backdrop，不接管前景交互控件

这样可以在不牺牲窗口行为稳定性的前提下，达到“标题栏也由主题包控制”的效果。

## Security Model

外部主题包按“本地已安装、但不允许执行任意代码”的模型设计。

安全边界：

- 只读取 manifest、CSS、shader 源码、静态资源
- 不运行第三方 JS
- 不向 renderer 暴露新的 Node API
- shader 只能在 Yulora 的受控 runtime 中执行
- manifest 中只允许声明式字段，不允许表达式求值或脚本回调

这样既保留本地主题包灵活性，也给未来的在线主题市场留下更安全的演进空间。

## Performance And Fallback

shader 主题必须把“最差情况仍然可用”作为第一原则。

硬性要求：

1. 每个 surface 都必须有静态保底
   - shader 失败、资源丢失或能力不足时，回退到 token + CSS 的静态观感

2. 每个 surface 都有明确性能预算
   - `titlebarBackdrop` 第一阶段仅允许单 pass
   - `workbenchBackground` 第一阶段默认单 pass
   - 限制最大分辨率、像素比、帧率

3. 系统状态触发自动降级
   - `prefers-reduced-motion`
   - 节能模式
   - GPU 上下文失败
   - 连续掉帧或 shader 初始化失败

4. 资源和复杂度受限
   - 限制 channel 数量
   - 限制纹理尺寸和资源文件大小
   - 限制 shader 文件数量和 include 深度

建议 runtime 支持三档运行状态：

- `full`
- `reduced`
- `fallback`

用户体验要求：

- 动态主题绝不能明显影响输入、滚动、撤销、保存
- 失败时给轻量通知，不弹阻塞错误框
- Markdown 编辑体验始终优先于动态效果

## Migration Strategy

当前 CSS 主题系统不应被一次性推翻，而应逐步迁移：

第一阶段迁移目标：

- 现有内置与社区 CSS 主题继续可用
- 新增“统一主题包”发现与解析能力
- 新主题包内部仍可以映射到 `ui/editor/markdown/titlebar` 样式层
- 动态 surface 仅对新主题包开放

建议把迁移分成以下阶段：

1. 引入 manifest 驱动的新主题包发现与校验
2. 把现有 CSS part runtime 升级为“主题包样式层”
3. 新增 surface host，但先只支持 `workbenchBackground`
4. 引入受控 title bar host 与 `titlebarBackdrop`
5. 再评估是否开放受限 `buffered` surface

## Risks

1. 协议过大导致第一阶段交付过慢
   - 通过“协议先完整、实现先只做少数 surface”来控制范围

2. 标题栏主题化破坏平台行为
   - 通过宿主固定结构与平台窗口控件托管降低风险

3. Shader 兼容性预期过高
   - 明确标注为“部分兼容 Shadertoy”，不承诺全量行为

4. 动态效果拖慢输入体验
   - 把降级和暂停策略设计进 runtime，而不是后补

5. 主题包 CSS 过度耦合内部结构
   - 只暴露稳定宿主结构、数据属性和 CSS variables

## Acceptance

1. 外部主题包可通过单一 manifest 声明 tokens、styles、layout、surfaces
2. 主题包不执行第三方任意 JS，仅允许声明式资源和 shader 源码
3. `workbenchBackground` 可以实现整窗连续背景氛围
4. `titlebarBackdrop` 可以与 workbench 共享 scene 状态，实现视觉连续的标题栏背板
5. 标题栏主题化不破坏拖拽、窗口按钮和跨平台窗口行为
6. Shader 作者可以使用部分兼容 Shadertoy 的写法迁移常见效果
7. Shader 编译失败或性能不足时，应用自动回退到静态可读主题
8. Markdown 编辑、输入、撤销、保存的稳定性优先于动态视觉效果

# Yulora 主题编写指南

这份指南同时面向人类作者和 AI 代理。

目标只有一个：让新主题在遵守当前项目边界的前提下，能够被 Yulora 正常扫描、加载、回退和验收，不出现“主题做完后进软件直接失效或异常”的情况。

## 1. 当前主题系统是如何工作的

Yulora 现在使用的是单一的 `theme package` 模型，不再是旧的“主题家族 + light/dark 子目录自动拼装”模型。

当前主题链路如下：

1. `main` 进程扫描两个目录。

   - 内置主题：`src/renderer/theme-packages/`
   - 社区主题：`<userData>/themes/<themeId>/`

2. 每个主题目录都必须有 `manifest.json`。

3. `manifest.json` 会经过标准化。

   - `id` 和 `name` 为空会整包失效
   - 路径如果逃逸出主题根目录会被丢弃
   - 非法参数定义会被忽略

4. renderer 把 manifest 里的本地路径转换成 preview asset URL。

5. renderer 根据 `preferences.theme.selectedId` 和当前 light/dark 模式解析有效主题。

6. 若选中主题不存在，或不支持当前模式，则自动回退到内置 `default` 主题。

7. 有效主题样式按固定顺序挂载到 `<head>`。

   - `tokens`
   - `ui`
   - `titlebar`
   - `editor`
   - `markdown`

8. 如果主题声明了 shader surface，renderer 会单独挂载动态背景；失败时回退为静态 CSS，不会阻止应用继续运行。

一句话总结：主题本质上是一个由 `manifest.json` 驱动的资源包，Yulora 负责扫描、过滤、回退和按固定顺序挂载它。

## 2. 主题目录边界

一个可被扫描的最小主题包结构如下：

```text
my-theme/
  manifest.json
  tokens/
    light.css
    dark.css
  styles/
    ui.css
    editor.css
    markdown.css
```

进阶主题可以再加：

```text
my-theme/
  manifest.json
  tokens/
    light.css
    dark.css
  styles/
    ui.css
    editor.css
    markdown.css
    titlebar.css
  shaders/
    workbench-background.glsl
    titlebar-backdrop.glsl
  assets/
    textures/
  layout/
    titlebar.json
```

注意：

- `manifest.json` 是唯一强制文件。
- 其他文件在 schema 层面“可选”，不等于生产上建议省略。
- 当前真正安全的生产级主题，至少应提供：
  - 每个支持模式对应的 `tokens`
  - `styles/ui.css`
  - `styles/editor.css`
  - `styles/markdown.css`

原因很简单：schema 允许某些字段缺失，但运行时只会“跳过挂载”，不会帮你补一套可读的主题层。

## 3. manifest 边界

### 3.1 当前支持的字段

```json
{
  "contractVersion": 2,
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "author": "Your Name",
  "supports": {
    "light": true,
    "dark": true
  },
  "tokens": {
    "light": "./tokens/light.css",
    "dark": "./tokens/dark.css"
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
    "id": "my-scene",
    "sharedUniforms": {
      "rainAmount": 0.72
    },
    "render": {
      "renderScale": 0.75,
      "frameRate": 24
    }
  },
  "parameters": [],
  "surfaces": {
    "workbenchBackground": {
      "kind": "fragment",
      "scene": "my-scene",
      "shader": "./shaders/workbench-background.glsl",
      "render": {
        "renderScale": 0.65
      }
    }
  }
}
```

### 3.2 哪些字段是硬边界

| 字段 | 是否必须 | 当前是否真的生效 | 说明 |
| --- | --- | --- | --- |
| `contractVersion` | 必须 | 是 | 当前必须写 `2`，否则整包失效 |
| `id` | 必须 | 是 | 非空字符串，建议全项目唯一 |
| `name` | 必须 | 是 | 非空字符串 |
| `version` | 建议 | 是 | 缺失时回落为 `1.0.0` |
| `author` | 建议 | 是 | 缺失时回落为 `null` |
| `supports.light` / `supports.dark` | 必须明确声明 | 是 | 不写就等于 `false` |
| `tokens.light` / `tokens.dark` | 对应支持模式时必须提供 | 是 | 不然该模式即使被选中，也缺少基础 token 层 |
| `styles.ui` | 强烈建议视为必须 | 是 | 控件和壳层主题化的核心 |
| `styles.editor` | 强烈建议视为必须 | 是 | 编辑器字体、光标和编辑区调色 |
| `styles.markdown` | 强烈建议视为必须 | 是 | Markdown 渲染态调色 |
| `styles.titlebar` | 可选 | 是 | 仅在受控 titlebar 平台生效 |
| `scene` | 仅 shader 主题需要 | 是 | surface 使用的 uniform 场景 |
| `parameters` | 可选 | 是 | 设置页参数、CSS 变量、shader uniform |
| `surfaces.workbenchBackground` | 可选 | 是 | 工作区动态背景 |
| `surfaces.titlebarBackdrop` | 可选 | 是 | 受控 titlebar 动态背景 |
| `surfaces.welcomeHero` | 不建议依赖 | 否 | schema 已预留，当前 app 未挂载 |
| `layout.titlebar` | 不建议依赖 | 否 | schema 已预留，当前 renderer 未读取 |

### 3.3 路径边界

manifest 中出现的所有路径都必须留在主题包根目录内部。

允许：

- `./tokens/dark.css`
- `styles/ui.css`
- 主题根目录内的绝对路径

不允许：

- `../outside.css`
- 指向主题目录外部的绝对路径

如果路径逃逸出包根目录，Yulora 会直接丢弃这个字段。

### 3.4 Render 默认值与覆盖

动态主题现在可以声明可选的 `render` 配置：

- `scene.render`
  - 给同一 scene 下的 surface 提供默认渲染预算
- `surfaces.<slot>.render`
  - 只覆盖当前 surface，需要时可以只写一个字段

当前支持的字段：

- `renderScale`
  - `> 0` 且 `<= 1`
  - 控制 shader canvas 的内部渲染分辨率
  - `1` 表示按当前 viewport × devicePixelRatio 渲染
  - `0.75` 表示用约 75% 的内部尺寸计算，再放大铺满
- `frameRate`
  - `> 0`
  - 只影响 `full` 动态模式下的动画节流
  - 不会改变 `reduced` / `off` 的回退语义

推荐做法：

- 先在 `scene.render` 里写保守默认值
- 只有某个 surface 明显更重或更轻时，再在 `surfaces.<slot>.render` 里单独覆盖
- 背景型 shader 可先从 `renderScale: 0.7 - 0.85`、`frameRate: 18 - 30` 开始试

## 4. 当前真正可依赖的能力

### 4.1 可稳定依赖

- light/dark 模式支持声明
- `tokens`、`ui`、`editor`、`markdown`、`titlebar` 样式挂载
- 缺失主题或不支持模式时回退到内置 `default`
- 主题参数写入设置页
- 参数同步为 CSS 变量
- 参数映射到 shader uniform
- shader surface 失败后回退静态样式

### 4.2 已建模但当前不要依赖

- `layout.titlebar`
- `surfaces.welcomeHero`

这两项目前最多只能当“预留字段”或“未来兼容占位”，不能作为新主题必须成立的功能点。

## 5. CSS 层如何分工

参考 `default` 和 `rain-glass`，推荐按下面的职责写：

### 5.0 先理解 formal semantic slots

从 `contractVersion: 2` 开始，renderer 只把正式 `--yulora-*` semantic slots 视为公开接口。旧的 ad-hoc 变量名可以只留在主题内部做中间映射，但不要假设 app 内置样式还会直接消费它们。

最低限度请覆盖这些组：

- shell：`--yulora-app-bg`、`--yulora-workspace-bg`、`--yulora-rail-bg`、`--yulora-panel-bg`、`--yulora-panel-border`、`--yulora-panel-shadow`、`--yulora-statusbar-bg`、`--yulora-statusbar-border`、`--yulora-titlebar-bg`
- text / controls：`--yulora-text-primary`、`--yulora-text-secondary`、`--yulora-text-muted`、`--yulora-text-accent`、`--yulora-text-danger`、`--yulora-text-on-accent`、`--yulora-control-bg`、`--yulora-control-bg-hover`、`--yulora-control-bg-active`、`--yulora-control-border`、`--yulora-control-fg`、`--yulora-focus-ring`
- editor：`--yulora-editor-bg`、`--yulora-editor-fg`、`--yulora-editor-muted`、`--yulora-caret-color`、`--yulora-current-line-bg`、`--yulora-gutter-fg`、`--yulora-active-block-bg`、`--yulora-active-block-border`
- markdown：`--yulora-markdown-body`、`--yulora-markdown-heading`、`--yulora-markdown-link`、`--yulora-markdown-strong`、`--yulora-markdown-inline-code-bg`、`--yulora-markdown-code-bg`、`--yulora-markdown-code-border`
- 前瞻 slot：`--yulora-markdown-table-*` 与 `--yulora-markdown-code-token-*`

### `tokens/*.css`

负责 foundation tokens 与 semantic slot 默认映射。优先直接定义正式 semantic slots；如果主题内部还保留旧变量做中间计算，也不要把它们当成 app 的公开接口。至少覆盖这些正式变量组：

```css
--yulora-app-bg
--yulora-workspace-bg
--yulora-rail-bg
--yulora-panel-bg
--yulora-panel-border
--yulora-panel-shadow
--yulora-statusbar-bg
--yulora-statusbar-border
--yulora-titlebar-bg
--yulora-text-primary
--yulora-text-secondary
--yulora-text-muted
--yulora-text-accent
--yulora-text-danger
--yulora-text-on-accent
--yulora-control-bg
--yulora-control-bg-hover
--yulora-control-bg-active
--yulora-control-border
--yulora-control-fg
--yulora-focus-ring
```

如果主题支持 `light`，请在 light token 文件里写在 `:root` 上。

如果主题支持 `dark`，请在 dark token 文件里写在 `:root[data-yulora-theme-mode="dark"]` 上。

### `styles/ui.css`

负责把 foundation token 映射到 UI 相关 semantic slots，例如：

- `--yulora-app-bg`
- `--yulora-panel-bg`
- `--yulora-panel-border`
- `--yulora-control-bg`
- `--yulora-control-border`
- `--yulora-banner-error-bg`

### `styles/editor.css`

负责编辑态 formal slots 与字体，例如：

- `--yulora-editor-font-family`
- `--yulora-editor-font-size`
- `--yulora-editor-bg`
- `--yulora-editor-fg`
- `--yulora-caret-color`
- `--yulora-current-line-bg`

### `styles/markdown.css`

负责 Markdown formal slots，例如：

- `--yulora-markdown-body`
- `--yulora-markdown-heading`
- `--yulora-markdown-inline-code-bg`
- `--yulora-markdown-code-bg`
- `--yulora-markdown-table-border`
- `--yulora-markdown-code-token-keyword`

### `styles/titlebar.css`

负责：

- 受控 titlebar 的附加样式
- 仅作增强，不要把核心可用性押在这里

## 6. 参数系统边界

Yulora 当前支持两种参数：

- `slider`
- `toggle`

规则如下：

- `id` 必须是合法标识符：`^[A-Za-z_][A-Za-z0-9_]*$`
- 同一个主题里参数 `id` 不能重复
- `label` 必须非空
- `toggle.default` 是布尔值
- `slider` 必须满足：
  - `min`、`max` 是有限数值
  - `max > min`
  - `step > 0`
- `uniform` 可选，但如果填写，也必须是合法标识符

参数的两种用途：

1. 纯 CSS 参数

   不写 `uniform`，运行时仍会把值暴露到 root 上：
   `--yulora-theme-parameter-<id>`

2. Shader 参数

   同时写 `uniform`，运行时会把参数值作为 shader uniform 送入场景

例如 `rain-glass` 的 `workspaceGlassOpacity` 是 CSS-only 参数，而 `rainAmount`、`glassBlur` 属于 shader 参数。

## 6.5 Built-in Runtime Env

除了 `parameters[]`，runtime 还会自动提供一组内建环境值，不需要也不允许在 manifest 中声明：

- CSS：`--yulora-env-word-count`、`--yulora-env-focus-mode`、`--yulora-env-viewport-width`、`--yulora-env-viewport-height`
- 属性：`:root[data-yulora-theme-mode="light|dark"]`
- shader uniforms：`u_wordCount`、`u_focusMode`、`u_themeMode`、`u_viewportWidth`、`u_viewportHeight`

推荐用途：

- 用字数或 focus mode 调整动态强度
- 用 viewport 做背景构图或密度控制
- 用 `data-yulora-theme-mode` 写 light/dark 分支，而不是再造私有 mode 标记

## 7. Shader 主题边界

如果你要做动态主题，当前必须遵守这些边界：

- `surfaces.*.kind` 只能是 `"fragment"`
- surface 必须引用一个存在的 `scene.id`
- `scene.render` 和 `surfaces.*.render` 只影响渲染预算，不改变 CSS 布局尺寸
- shader 文件要能独立编译
- 最好只依赖 runtime 自动提供的这些内容：
  - `u_resolution`
  - `u_time`
  - `u_themeMode`（`0` = light，`1` = dark）
  - 你在 `scene.sharedUniforms` 和 `parameters[].uniform` 里声明的 uniform
- 如果配置了 channel `0` 贴图，runtime 还会注入：
  - `iResolution`
  - `iTime`
  - `iChannel0`
- `mainImage(...)` 写法可用，runtime 会自动包一层 `main()`
- 普通 fragment `main()` 也可用

一定要接受这个现实：

- shader 失败并不会阻止应用工作
- 你的主题必须在“完全静态 CSS 回退”下依然可读、可用

如果静态层不可读，这个主题就不算合格。

## 8. 推荐的最小可用模板

如果你只是想先做一个稳定可上机的主题，不要一开始就碰 shader。先做这个最小版本。

### `manifest.json`

```json
{
  "contractVersion": 2,
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "author": "Your Name",
  "supports": {
    "light": false,
    "dark": true
  },
  "tokens": {
    "dark": "./tokens/dark.css"
  },
  "styles": {
    "ui": "./styles/ui.css",
    "editor": "./styles/editor.css",
    "markdown": "./styles/markdown.css"
  },
  "layout": {
    "titlebar": null
  },
  "scene": null,
  "surfaces": {},
  "parameters": []
}
```

### `tokens/dark.css`

```css
:root[data-yulora-theme-mode="dark"] {
  --yulora-app-bg: #101318;
  --yulora-workspace-bg: #171b22;
  --yulora-rail-bg: #1d2330;
  --yulora-panel-bg: rgba(23, 30, 40, 0.92);
  --yulora-panel-border: rgba(58, 70, 87, 0.88);
  --yulora-panel-shadow: 0 22px 54px rgba(0, 0, 0, 0.32);
  --yulora-statusbar-bg: transparent;
  --yulora-statusbar-border: transparent;
  --yulora-titlebar-bg: linear-gradient(180deg, rgba(29, 35, 48, 0.94), rgba(16, 19, 24, 0.92));
  --yulora-text-primary: #f6f8fb;
  --yulora-text-secondary: #c8d4df;
  --yulora-text-muted: #b1bfce;
  --yulora-text-accent: #7dd3fc;
  --yulora-text-danger: #fecaca;
  --yulora-text-on-accent: #081018;
  --yulora-control-bg: rgba(23, 30, 40, 0.78);
  --yulora-control-bg-hover: rgba(35, 42, 54, 0.88);
  --yulora-control-bg-active: rgba(96, 165, 250, 0.16);
  --yulora-control-border: rgba(58, 70, 87, 0.9);
  --yulora-control-fg: #c8d4df;
  --yulora-focus-ring: #60a5fa;
}
```

### `styles/ui.css`

```css
:root {
  --yulora-app-bg: #101318;
  --yulora-workspace-bg: #171b22;
  --yulora-rail-bg: #1d2330;
  --yulora-panel-bg: rgba(23, 30, 40, 0.92);
  --yulora-panel-border: rgba(255, 255, 255, 0.08);
  --yulora-panel-shadow: 0 22px 54px rgba(0, 0, 0, 0.32);
  --yulora-statusbar-bg: transparent;
  --yulora-statusbar-border: transparent;
  --yulora-titlebar-bg: linear-gradient(180deg, rgba(29, 35, 48, 0.94), rgba(16, 19, 24, 0.92));
  --yulora-text-primary: #f6f8fb;
  --yulora-text-secondary: #e0e7ef;
  --yulora-text-muted: #b1bfce;
  --yulora-text-accent: #7dd3fc;
  --yulora-text-danger: #fecaca;
  --yulora-text-on-accent: #081018;
  --yulora-control-bg: rgba(23, 30, 40, 0.78);
  --yulora-control-bg-hover: rgba(35, 42, 54, 0.88);
  --yulora-control-bg-active: rgba(96, 165, 250, 0.16);
  --yulora-control-border: rgba(58, 70, 87, 0.9);
  --yulora-control-fg: #c8d4df;
  --yulora-focus-ring: #60a5fa;
  --yulora-selection-bg: rgba(96, 165, 250, 0.22);
  --yulora-selection-fg: #f8fbff;
  --yulora-banner-info-bg: rgba(23, 30, 40, 0.94);
  --yulora-banner-warning-bg: rgba(125, 211, 252, 0.14);
  --yulora-banner-error-bg: #3b1217;
}
```

### `styles/editor.css`

```css
:root {
  --yulora-editor-font-family: "Aptos", "Segoe UI", sans-serif;
  --yulora-editor-font-size: 1.04rem;
  --yulora-editor-bg: transparent;
  --yulora-editor-fg: #e0e7ef;
  --yulora-editor-muted: #b1bfce;
  --yulora-caret-color: #60a5fa;
  --yulora-current-line-bg: rgba(96, 165, 250, 0.06);
  --yulora-gutter-fg: #8594a7;
  --yulora-active-block-bg: rgba(96, 165, 250, 0.08);
  --yulora-active-block-border: rgba(96, 165, 250, 0.34);
}
```

### `styles/markdown.css`

```css
:root {
  --yulora-markdown-body: #dbe4ef;
  --yulora-markdown-heading: #f8fbff;
  --yulora-markdown-heading-marker: rgba(248, 251, 255, 0.34);
  --yulora-markdown-link: #7dd3fc;
  --yulora-markdown-link-hover: #bae6fd;
  --yulora-markdown-strong: #f8fbff;
  --yulora-markdown-emphasis: #dbe4ef;
  --yulora-markdown-quote-fg: #c8d4df;
  --yulora-markdown-quote-border: rgba(96, 165, 250, 0.28);
  --yulora-markdown-list-bullet: #94a3b8;
  --yulora-markdown-list-text: #b1bfce;
  --yulora-markdown-task-done: #8fb8d6;
  --yulora-markdown-hr: #334155;
  --yulora-markdown-inline-code-bg: rgba(148, 163, 184, 0.14);
  --yulora-markdown-inline-code-fg: #f8fafc;
  --yulora-markdown-code-bg: #17212b;
  --yulora-markdown-code-fg: #dbe4f0;
  --yulora-markdown-code-border: rgba(96, 165, 250, 0.16);
  --yulora-markdown-table-border: rgba(96, 165, 250, 0.14);
  --yulora-markdown-table-header-bg: rgba(17, 23, 34, 0.96);
  --yulora-markdown-table-header-fg: #f8fbff;
  --yulora-markdown-table-cell-bg: transparent;
  --yulora-markdown-table-row-stripe: rgba(255, 255, 255, 0.03);
  --yulora-markdown-code-token-keyword: #c084fc;
  --yulora-markdown-code-token-string: #fdba74;
  --yulora-markdown-code-token-number: #93c5fd;
  --yulora-markdown-code-token-comment: rgba(203, 213, 225, 0.7);
  --yulora-markdown-code-token-function: #5eead4;
  --yulora-markdown-code-token-type: #f9a8d4;
}
```

这套模板的原则是：先保证稳定和完整，再去叠加更强的个性化视觉。

## 9. 参考主题应该如何借鉴

### `default` 主题适合借鉴什么

- 最小完整结构
- light/dark 双模写法
- 基础 token 的命名与职责分层
- 不依赖动态效果时的稳定基线

### `rain-glass` 主题适合借鉴什么

- dark-only 主题声明
- 高强度壳层定制
- CSS-only 参数和 shader 参数混用
- shader + channel 贴图 + scene.sharedUniforms 的组合方式
- 即使动态效果失败，也能靠静态层维持可读性

不要从 `rain-glass` 学这些：

- 假设 `layout.titlebar` 已经能驱动标题栏布局
- 假设 `welcomeHero` 已经有挂载位

## 10. AI 和人类都该遵守的制作流程

### 第一步：先决定主题能力等级

只在下面两档里选一档：

1. 静态主题

   - 只做 `tokens + ui + editor + markdown`
   - 推荐作为第一版

2. 动态主题

   - 在静态主题完全可用的前提下，再加 `scene + parameters + surfaces`

不要上来就做“纯 shader 主题”。Yulora 当前不支持跳过静态基础层直接靠 shader 保底。

### 第二步：先把 manifest 写完整

至少先把这些字段写对：

- `id`
- `name`
- `supports`
- `tokens`
- `styles`

### 第三步：先让静态层可读

验收标准是：

- 不开动态效果也能看
- shader 编译失败也能看
- settings 打开后控件对比度仍然够
- 编辑态和 Markdown 渲染态都能看清

### 第四步：如果要做参数，再区分 CSS-only 和 shader

- 纯布局、透明度、玻璃强度，优先做 CSS-only 参数
- 真正要驱动 GLSL 行为时，再加 `uniform`

### 第五步：如果要做动态 surface，只加当前真的会挂载的槽位

- `workbenchBackground`
- `titlebarBackdrop`

## 11. 开发联调流程

如果你在仓库里开发主题，推荐这样做：

1. 把主题放到 `fixtures/themes/<themeId>/`

2. 保证目录里有 `manifest.json`

3. 运行开发同步脚本，把 fixture 复制到 dev userData：

```bash
node scripts/sync-dev-themes.mjs
```

4. 启动应用

5. 到设置页点“刷新主题”

6. 如需手动安装或覆盖文件，点“打开主题目录”，确认系统直接打开 `<userData>/themes/`

7. 切换到目标主题验证

`scripts/sync-dev-themes.mjs` 只会复制带 `manifest.json` 的主题目录。

## 12. 主题验收条件

下面这些条件全部满足，才算“主题完成”。

### A. 结构验收

- 主题目录能被扫描到
- `manifest.json` 是合法 JSON
- `id` 与 `name` 非空
- 所有 manifest 路径都留在包根目录内
- `supports` 与实际提供的 tokens 文件一致

### B. 基础显示验收

- 切换到主题后，应用没有白屏、崩溃、报错阻断
- `<head>` 中 `link[data-yulora-theme-runtime="active"]` 数量稳定
- 样式挂载顺序仍为 `tokens -> ui -> titlebar -> editor -> markdown`
- 主题缺失的样式 part 不会残留旧主题样式
- 编辑区、设置页、状态栏、空态、侧边轨都保持可读
- `document.documentElement` 上能看到 `--yulora-env-word-count`、`--yulora-env-focus-mode`、`--yulora-env-viewport-width`、`--yulora-env-viewport-height` 与 `data-yulora-theme-mode`

### C. 回退验收

- 如果主题 id 不存在，应用会回退到 `default`
- 如果主题不支持当前模式，应用会回退到 `default`
- 如果 shader 加载失败，应用仍可用，并退回静态外观
- 如果用户把动态效果设为 `off`，主题仍保持正常静态显示

### D. 参数验收

- 参数能在设置页出现
- slider/toggle 默认值正确
- 参数切换后即时生效
- 切换到别的主题后，当前主题的 CSS 参数变量会被清理
- 只有带 `uniform` 的参数会进入 shader uniform 流

### E. 平台边界验收

- Windows 上不要依赖 renderer 自定义 titlebar 才能成立
- macOS 受控 titlebar 平台上，`styles.titlebar.css` 只是增强，不应成为可用性的唯一来源
- 不要把主题可用性建立在 `layout.titlebar` 上

## 13. 建议跑的验证

至少跑这些：

```bash
npm run test -- src/shared/theme-package.test.ts src/main/theme-package-service.test.ts src/renderer/theme-package-runtime.test.ts src/renderer/app.autosave.test.ts
```

如果只改了文档，代码测试可以不新增，但主题作者在真正交付新主题前，仍应按上面的验收条件手动走一遍。

## 14. 最后再强调一次边界

现在做新主题时，请把下面几条视为硬规则：

- 只使用 `theme package` 架构
- `default` 必须始终可作为回退目标
- 不要依赖旧主题家族目录模型
- 不要依赖 `layout.titlebar`
- 不要依赖 `welcomeHero`
- 静态 CSS 层必须独立可读
- 所有资源路径必须留在主题包根目录内

只要按这份指南做，主题即使将来继续扩展 shader 或参数，也不会先在“加载阶段”或“回退阶段”把应用搞坏。

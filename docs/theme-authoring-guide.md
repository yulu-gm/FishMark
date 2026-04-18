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

### `tokens/*.css`

负责基础颜色与表面变量。至少覆盖这些基础变量：

```css
--yulora-page-bg
--yulora-surface-bg
--yulora-surface-raised-bg
--yulora-surface-muted-bg
--yulora-surface-subtle-bg
--yulora-surface-blockquote-bg
--yulora-border-strong
--yulora-border-muted
--yulora-border-subtle
--yulora-border-faint
--yulora-text-strong
--yulora-text-body
--yulora-text-muted
--yulora-text-subtle
--yulora-text-secondary
--yulora-scrollbar-thumb
--yulora-scrollbar-thumb-hover
--yulora-glass-bg
--yulora-glass-strong-bg
--yulora-glass-border
--yulora-glass-sheen
--yulora-scrim
```

如果主题支持 `light`，请在 light token 文件里写在 `:root` 上。

如果主题支持 `dark`，请在 dark token 文件里写在 `:root[data-yulora-theme="dark"]` 上。

### `styles/ui.css`

负责：

- UI 控件 token，例如 `--yu-ctrl-*`
- 危险态、focus ring、segment、input 等交互配色
- 工作区壳层、侧边栏、设置抽屉、通知条等结构性视觉

### `styles/editor.css`

负责：

- `--yulora-editor-font-family`
- `--yulora-editor-font-size`
- `--yulora-editor-caret`
- 编辑区透明度、背景、文字颜色等增强

### `styles/markdown.css`

负责：

- 行内代码、任务列表、分割线、代码块等 Markdown 渲染态 token

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
:root[data-yulora-theme="dark"] {
  --yulora-page-bg: #101318;
  --yulora-surface-bg: #171b22;
  --yulora-surface-raised-bg: #1d2330;
  --yulora-surface-muted-bg: #232a36;
  --yulora-surface-subtle-bg: #1c2230;
  --yulora-surface-blockquote-bg: #1c2631;
  --yulora-border-strong: #314052;
  --yulora-border-muted: #3a4657;
  --yulora-border-subtle: #283444;
  --yulora-border-faint: #202937;
  --yulora-text-strong: #f6f8fb;
  --yulora-text-body: #e0e7ef;
  --yulora-text-muted: #b1bfce;
  --yulora-text-subtle: #8594a7;
  --yulora-text-secondary: #c8d4df;
  --yulora-scrollbar-thumb: rgba(148, 163, 184, 0.34);
  --yulora-scrollbar-thumb-hover: rgba(148, 163, 184, 0.5);
  --yulora-glass-bg: rgba(19, 25, 34, 0.42);
  --yulora-glass-strong-bg: rgba(23, 30, 40, 0.6);
  --yulora-glass-border: rgba(255, 255, 255, 0.08);
  --yulora-glass-sheen: rgba(255, 255, 255, 0.08);
  --yulora-scrim: rgba(3, 6, 12, 0.24);
}
```

### `styles/ui.css`

```css
:root {
  --yulora-dirty-text: #f59e0b;
  --yulora-clean-text: #7dd3fc;
  --yulora-danger-bg: #3b1217;
  --yulora-danger-border: #7f1d1d;
  --yulora-danger-text: #fecaca;
  --yulora-focus-ring: #60a5fa;
  --yu-ctrl-solid-bg: var(--yulora-surface-raised-bg);
  --yu-ctrl-solid-bg-hover: var(--yulora-surface-muted-bg);
  --yu-ctrl-solid-border: var(--yulora-border-subtle);
  --yu-ctrl-solid-border-hover: var(--yulora-border-muted);
  --yu-ctrl-glass-bg: color-mix(in srgb, var(--yulora-glass-strong-bg) 46%, transparent);
  --yu-ctrl-glass-bg-hover: color-mix(in srgb, var(--yulora-glass-strong-bg) 72%, transparent);
  --yu-ctrl-glass-border: var(--yulora-glass-border);
  --yu-ctrl-glass-border-hover: var(--yulora-border-muted);
  --yu-ctrl-text: var(--yulora-text-secondary);
  --yu-ctrl-text-hover: var(--yulora-text-strong);
  --yu-input-bg: color-mix(in srgb, var(--yulora-glass-strong-bg) 42%, transparent);
  --yu-input-bg-focus: color-mix(in srgb, var(--yulora-glass-strong-bg) 64%, transparent);
  --yu-input-border: var(--yulora-border-muted);
  --yu-input-border-focus: var(--yulora-focus-ring);
  --yu-input-ring: color-mix(in srgb, var(--yulora-focus-ring) 16%, transparent);
  --yu-segment-bg: color-mix(in srgb, var(--yulora-glass-strong-bg) 36%, transparent);
  --yu-segment-border: var(--yulora-border-muted);
  --yu-segment-active-bg: color-mix(in srgb, var(--yulora-glass-strong-bg) 62%, transparent);
}
```

### `styles/editor.css`

```css
:root {
  --yulora-editor-font-family: "Aptos", "Segoe UI", sans-serif;
  --yulora-editor-font-size: 1.04rem;
  --yulora-editor-caret: #60a5fa;
}

[data-yulora-region="workspace-canvas"] .document-editor .cm-editor,
[data-yulora-region="workspace-canvas"] .document-editor .cm-scroller {
  background: transparent;
}

[data-yulora-region="workspace-canvas"] .document-editor .cm-editor {
  color: var(--yulora-text-body);
}
```

### `styles/markdown.css`

```css
:root {
  --yulora-inline-code-bg: rgba(148, 163, 184, 0.14);
  --yulora-inline-code-text: #f8fafc;
  --yulora-list-marker: #94a3b8;
  --yulora-task-border: #64748b;
  --yulora-task-bg: #0f172a;
  --yulora-task-check: #e2e8f0;
  --yulora-thematic-break: #334155;
  --yulora-code-block-bg: #17212b;
  --yulora-code-block-text: #dbe4f0;
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

6. 切换到目标主题验证

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

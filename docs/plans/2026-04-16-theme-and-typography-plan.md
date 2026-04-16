# Theme And Typography Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前单文件样式和最小偏好设置演进为可扩展的主题系统，并把“应用 UI 字号”“文档字号”“字体选择”拆成明确能力。

**Architecture:** 保留 `Preferences` 作为唯一配置源，在 `main` 新增主题扫描服务，自动扫描 `app.getPath("userData")/themes` 下的社区主题目录并通过 preload 暴露给 renderer。renderer 不再只靠一个 `styles.css`，而是拆成基础样式 + 主题目录样式；运行时根据选中主题装配 `tokens.css / ui.css / editor.css / markdown.css` 四层样式，并把字号与字体偏好映射到 CSS variables。

**Tech Stack:** Electron、React 19、TypeScript、CodeMirror 6、Vite、Vitest、纯 CSS 主题包

---

## Scope

本计划覆盖：
- 应用启动自动扫描社区主题目录
- 设置页提供主题列表与“刷新主题”按钮
- 主题按“一个目录 + 多个 CSS 文件”组织
- 偏好设置拆分为 `uiFontSize`、`documentFontSize`、字体族选择
- 样式文件拆分，摆脱单个超大 `styles.css`
- 字体与字号的自动化测试和人工验收说明

本计划暂不覆盖：
- 主题 manifest / 预览图 / 作者信息
- 在线主题市场或下载
- 每个块级元素单独的字号定制
- 社区主题的沙箱隔离与签名校验
- “源码编辑态字号”单独于“文档字号”的第三套尺寸配置

---

## Design Decisions

### 1. 主题目录结构

内置主题与社区主题统一按目录组织：

```text
src/renderer/styles/themes/
  default-light/
    tokens.css
    ui.css
    editor.css
    markdown.css
  default-dark/
    tokens.css
    ui.css
    editor.css
    markdown.css

<userData>/themes/
  graphite-dark/
    tokens.css
    ui.css
    editor.css
    markdown.css
```

约束：
- 每套主题一个目录
- 固定加载顺序：`tokens.css -> ui.css -> editor.css -> markdown.css`
- 允许缺文件，缺哪个就跳过哪个
- 第一版不使用 `theme.json` manifest，目录名即主题 id

### 2. 字号与字体模型

当前的“字号”实际是文档内容区基础字号，后续应明确改名并拆分：

- `uiFontSize`
  - 影响整个应用 UI：设置页、标题栏、状态文案、按钮、空态文案
  - 不直接影响 Markdown 渲染内容
- `documentFontSize`
  - 影响正文基础排版和非激活态 Markdown 渲染的正文尺寸
  - 标题等特定 block 仍可在此基础上相对放大
- `documentFontFamily`
  - 影响文档内容区基础字体
  - 默认值为空时回退到主题提供的变量

第一版不新增“源码编辑态独立字号”，避免一次引入三套字号体系。架构上保留未来扩展点：
- 后续如需要，可新增 `editorSourceFontSize`
- 其 CSS variable 只作用于 CodeMirror 源码态

### 3. 字体输入方式

采用“预设下拉 + 自定义输入”组合：

- 默认下拉项：
  - 系统默认
  - Aptos
  - Segoe UI
  - Georgia
  - Source Serif 4
  - IBM Plex Serif
  - Cascadia Code
- 自定义输入：
  - 允许用户输入任意字体族字符串
  - 保存后仍走 `Preferences`

这样做的原因：
- 下拉项便于验收、截图回归和自动化测试
- 自定义输入保留高级用户灵活性
- 不强依赖系统字体枚举 API

### 4. CSS 拆分策略

从当前 `src/renderer/styles.css` 拆成：

```text
src/renderer/styles/
  base.css
  app-ui.css
  editor-source.css
  markdown-render.css
  settings.css
  workbench.css
  themes/
    default-light/
      tokens.css
      ui.css
      editor.css
      markdown.css
    default-dark/
      tokens.css
      ui.css
      editor.css
      markdown.css
```

职责：
- `base.css`
  - reset、全局 root 结构、通用 CSS variables fallback
- `app-ui.css`
  - 编辑器窗口壳层、空态、标题、保存状态等非 workbench UI
- `editor-source.css`
  - CodeMirror 容器、源码态基础输入样式
- `markdown-render.css`
  - heading/list/blockquote/code block/thematic break/inline rendering
- `settings.css`
  - 设置页专属样式
- `workbench.css`
  - 测试工作台 UI
- `themes/*/*.css`
  - 只提供主题层覆写，不承载结构样式

原则：
- “结构样式”放公共文件
- “颜色/字体/主题差异”放主题文件
- renderer 主入口不再只 import 一个巨型 `styles.css`

### 5. 主题加载策略

`main` 新增主题扫描服务：
- 启动时扫描 `<userData>/themes`
- 返回发现到的主题目录列表
- 提供 `refreshThemes()` 主动重扫入口
- 后续如需文件监听，可再加 watcher，本计划先不做

preload 暴露最小 API：
- `listThemes(): Promise<ThemeDescriptor[]>`
- `refreshThemes(): Promise<ThemeDescriptor[]>`

`ThemeDescriptor` 第一版字段：
- `id`
- `source` (`builtin` / `community`)
- `name`
- `directoryName`
- `availableParts` (`tokens/ui/editor/markdown`)

renderer 侧：
- settings 页拉取主题列表
- 主题切换后按顺序挂载样式文件
- 刷新按钮调用 `refreshThemes()`

### 6. 主题命名规则

为避免第一版没有 manifest 带来的信息不足，建议：
- 目录名即 `theme id`
- 显示名先由目录名格式化得到，例如 `graphite-dark` -> `Graphite Dark`
- 内置主题显式写死 metadata，避免显示名不稳定

后续真的需要作者、版本、说明时，再引入 `theme.json`

---

## Acceptance

### 应用 UI 字号

人工验收：
1. 在设置中把 `UI 字号` 从默认改为更大值，例如 `18`
2. 返回主界面
3. 验证以下元素明显变大：
   - 顶部应用标题
   - 保存状态文案
   - 设置页标签与按钮
   - 空态文案

自动化验收：
- 断言 `document.documentElement` 上的 `--yulora-ui-font-size` 已更新
- 断言 UI 容器元素使用该变量

### 文档字号

人工验收：
1. 打开一篇带正文、标题、列表的 Markdown 文档
2. 在设置中把 `文档字号` 调大
3. 验证正文、列表、blockquote、非激活态段落等基础排版变大
4. 验证标题层级仍保持相对大小差异，不是全部统一成一个尺寸

自动化验收：
- 断言 `--yulora-document-font-size` 更新
- 断言文档容器规则消费该变量

### 字体

人工验收：
1. 在下拉中选择预设字体，如 `Georgia`
2. 返回编辑器，验证正文基础字体变化
3. 再切到 `系统默认`
4. 验证样式回退
5. 再输入一个自定义字体族字符串并失焦保存
6. 重启应用后验证配置保留

自动化验收：
- 断言 `--yulora-document-font-family` 更新
- 断言重启后 `getPreferences()` 仍返回保存值

### 主题

人工验收：
1. 把一个社区主题目录放入 `<userData>/themes`
2. 重启应用，验证设置页出现该主题
3. 删除或修改主题目录后点击“刷新主题”
4. 验证列表更新
5. 选择该主题，验证 UI、编辑器、Markdown 三层样式按目录文件生效

自动化验收：
- 测主题扫描服务对缺文件、空目录、无效目录名的容错
- 测 renderer 主题切换后的样式挂载顺序

---

## Risks

1. 主题 CSS 是自由文本，理论上可写出破坏布局的规则。
   第一版接受这个 tradeoff，因为你明确要纯 CSS 包；后续再考虑作用域约束。

2. 没有 manifest 时，主题元数据能力较弱。
   第一版接受，避免过早复杂化。

3. 把当前 `styles.css` 一次拆太碎，容易在迁移中引入回归。
   应分阶段拆：先按职责拆基础文件，再切主题目录。

4. “UI 字号”和“文档字号”都改动后，如果 token 命名不清晰，后续会继续混淆。
   必须在 `shared/preferences.ts`、settings 文案和 CSS variable 命名上一次改正。

---

## Implementation Plan

### Task 1: 重命名并扩展偏好设置模型

**Files:**
- Modify: `src/shared/preferences.ts`
- Modify: `src/shared/preferences.test.ts`
- Modify: `src/main/preferences-store.test.ts`
- Modify: `src/main/preferences-service.test.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/renderer/types.d.ts`

**Steps:**
1. 为偏好模型新增 `ui.fontSize` 与 `document.fontSize/document.fontFamily`，并保留向旧字段迁移。
2. 先写 shared 层 failing tests，覆盖默认值、范围 clamp、旧字段迁移。
3. 跑 shared tests，确认失败。
4. 实现最小 schema/normalize/migration。
5. 跑 shared tests，确认通过。
6. 更新 preload/types/main 层类型与测试。
7. 跑相关测试，确认 bridge contract 通过。

### Task 2: 新增主题扫描服务与 bridge

**Files:**
- Create: `src/main/theme-service.ts`
- Create: `src/main/theme-service.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/renderer/types.d.ts`

**Steps:**
1. 先写 `theme-service.test.ts`，覆盖：
   - 扫描内置主题
   - 扫描社区主题目录
   - 跳过空目录/无 CSS 目录
   - 缺部分文件仍保留主题
2. 跑单测，确认失败。
3. 实现最小 `theme-service.ts`。
4. 跑单测，确认通过。
5. 在 `main.ts` 注册 `listThemes/refreshThemes` IPC。
6. 更新 preload/types 契约与测试。
7. 跑 preload 相关测试，确认通过。

### Task 3: 重构样式文件结构

**Files:**
- Create: `src/renderer/styles/base.css`
- Create: `src/renderer/styles/app-ui.css`
- Create: `src/renderer/styles/editor-source.css`
- Create: `src/renderer/styles/markdown-render.css`
- Create: `src/renderer/styles/settings.css`
- Create: `src/renderer/styles/workbench.css`
- Create: `src/renderer/styles/themes/default-light/tokens.css`
- Create: `src/renderer/styles/themes/default-light/ui.css`
- Create: `src/renderer/styles/themes/default-light/editor.css`
- Create: `src/renderer/styles/themes/default-light/markdown.css`
- Create: `src/renderer/styles/themes/default-dark/tokens.css`
- Create: `src/renderer/styles/themes/default-dark/ui.css`
- Create: `src/renderer/styles/themes/default-dark/editor.css`
- Create: `src/renderer/styles/themes/default-dark/markdown.css`
- Modify: `src/renderer/main.tsx`
- Delete: `src/renderer/styles.css`（只在迁移完成后删除）

**Steps:**
1. 不先删旧文件，先新建拆分后的目标文件。
2. 按职责把旧样式逐段迁移。
3. 在 `main.tsx` 改为导入新的基础样式入口。
4. 跑 renderer 测试和 build，确认没有视觉相关编译错误。
5. 删除旧 `styles.css`。
6. 再跑一次完整 `test/lint/typecheck/build`。

### Task 4: renderer 接入主题列表、主题样式挂载与字号变量

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/editor/settings-view.tsx`
- Modify: `src/renderer/app.autosave.test.ts`
- Create: `src/renderer/theme-runtime.ts`
- Create: `src/renderer/theme-runtime.test.ts`

**Steps:**
1. 先写 `theme-runtime.test.ts`，覆盖样式挂载顺序和切换清理。
2. 跑测试，确认失败。
3. 实现最小 `theme-runtime.ts`。
4. 跑测试，确认通过。
5. 扩展 settings UI：
   - 当前主题下拉
   - 刷新主题按钮
   - UI 字号输入
   - 文档字号输入
   - 预设字体下拉 + 自定义输入
6. 更新 `App.tsx`，把 preferences 映射到 `--yulora-ui-font-size`、`--yulora-document-font-size`、`--yulora-document-font-family` 等变量。
7. 补 renderer tests，覆盖：
   - UI 字号变量更新
   - 文档字号变量更新
   - 主题切换更新
   - 刷新按钮加载新主题
8. 跑相关 tests，确认通过。

### Task 5: 文案、进度文档与验收说明

**Files:**
- Modify: `docs/progress.md`
- Modify: `MVP_BACKLOG.md`（如需要补拆分任务）
- Modify: `docs/test-cases.md`

**Steps:**
1. 把当前“字号”文案改成“文档字号”。
2. 新增“应用 UI 字号”“主题刷新”“社区主题扫描”的测试用例。
3. 更新 `progress.md`，明确主题系统和字号拆分的真实状态。
4. 跑一次全文搜索，确认没有遗留误导文案。

---

## Recommended Execution Order

1. Task 1: Preferences model
2. Task 2: Theme scanning service
3. Task 3: CSS split
4. Task 4: Renderer runtime and settings UI
5. Task 5: Docs and acceptance

这样做的原因：
- 先把数据模型定住
- 再把主题来源定住
- 再拆样式文件，减少反复搬迁
- 最后接 UI，避免 settings 面板反复返工

---

## Notes For Implementation

- 当前 `fontSize` 设置实际影响的是 Markdown 文档基础排版，不是整个应用 UI；实现时要先完成命名纠正，再新增 `uiFontSize`。
- 主题 runtime 不应把所有 CSS 都塞进一个大字符串，应按文件生成多个 `<link>` 或 `<style>` 节点，方便切换和调试。
- 第一版社区主题扫描只做目录级扫描，不做递归。
- 如果主题目录中的某个 CSS 文件语法错误，第一版允许浏览器按原生 CSS 失败处理，不额外做 parser。

---

## Verification Commands

完成每个任务后至少运行对应子集：

- Shared/model:
  - `npm run test -- src/shared/preferences.test.ts src/main/preferences-store.test.ts src/main/preferences-service.test.ts`
- Preload/types:
  - `npm run test -- src/preload/preload.contract.test.ts`
- Renderer/theme runtime:
  - `npm run test -- src/renderer/app.autosave.test.ts src/renderer/theme-runtime.test.ts`
- Full gate:
  - `npm run test`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`


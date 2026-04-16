# Editor Shell Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前编辑器从“顶部信息条 + 单卡片编辑区 + 整页设置切换”的 MVP 壳，重构成“轻侧轨 + 自适应文档画布 + 左侧设置抽屉 + 常驻状态条”的现代桌面编辑器界面。

**Architecture:** 保持 `src/renderer/App.tsx -> src/renderer/editor/App.tsx` 的入口结构不变，不改动编辑器内核与文档状态模型。主改动集中在 renderer 壳层：新增轻侧轨、把设置页改为覆盖式左抽屉、在工作区内拆分文档头部 / 编辑画布 / 状态条，并通过少量 helper 支撑 `字数` 统计与编辑器焦点恢复。

**Tech Stack:** Electron、React 19、TypeScript、CodeMirror 6、Vite、Vitest、纯 CSS

---

## Context Snapshot

开始执行前先建立上下文：

- 入口分发：`src/renderer/App.tsx`
- 当前编辑器壳：`src/renderer/editor/App.tsx`
- 当前设置页：`src/renderer/editor/settings-view.tsx`
- 壳层样式：`src/renderer/styles/app-ui.css`
- 设置样式：`src/renderer/styles/settings.css`
- 编辑器控制器：`src/renderer/code-editor.ts`
- 编辑器 React 包装：`src/renderer/code-editor-view.tsx`
- 主 renderer 回归测试：`src/renderer/app.autosave.test.ts`
- 本轮设计结论：`docs/plans/2026-04-16-editor-shell-refresh-design.md`

当前已知现状：
- 设置通过 `view === "settings"` 走整页切换
- 文档信息、保存状态、平台信息全部集中在文档头部
- 空态是居中 hero，不像桌面工作区
- 没有常驻 `字数` 指标
- 没有抽屉开合与焦点恢复语义

## Scope

本计划覆盖：
- 轻侧轨布局
- 自适应工作区和文档画布宽度
- 文档头部 / 编辑画布 / 状态条拆分
- 左侧设置抽屉
- 抽屉动效、遮罩、Esc 关闭、reduced motion 退化
- `字数` 统计
- 抽屉开合不破坏 autosave / 焦点 / 编辑器挂载的回归测试

本计划不覆盖：
- 大纲、最近文件、搜索、导出等新功能
- 编辑器内核行为调整
- Markdown 渲染规则变更
- 词数 / 阅读时长 / 选区统计
- 主题 token 重构

## Task 1: 固定文档统计 helper

**Files:**
- Create: `src/renderer/document-metrics.ts`
- Create: `src/renderer/document-metrics.test.ts`

**Step 1: 写失败测试，定义“字数”口径**

- 在 `src/renderer/document-metrics.test.ts` 新增用例，覆盖：
  - 空文档返回 `0`
  - 纯英文段落返回非空白字符计数或约定的字数计数
  - 中文段落返回稳定的 `字数`
  - 前后空白和空行不应把空白本身计入 `字数`

Run:
```bash
npm run test -- src/renderer/document-metrics.test.ts
```

Expected:
- FAIL，提示缺少 `document-metrics.ts` 或导出不存在

**Step 2: 实现最小 helper**

- 在 `src/renderer/document-metrics.ts` 导出纯函数，例如 `getDocumentMetrics(content)`
- 第一版只返回：
  - `characterCount`
  - `meaningfulCharacterCount`
- UI 只消费 `meaningfulCharacterCount` 作为 `字数`

约束：
- 不读取 DOM
- 不依赖 React
- 不耦合保存链路

**Step 3: 重新运行单测**

Run:
```bash
npm run test -- src/renderer/document-metrics.test.ts
```

Expected:
- PASS

**Step 4: 提交这一小步**

```bash
git add src/renderer/document-metrics.ts src/renderer/document-metrics.test.ts
git commit -m "test: add document metrics helper"
```

## Task 2: 给编辑器包装层补焦点恢复能力

**Files:**
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor-view.tsx`
- Modify: `src/renderer/code-editor-view.test.tsx`

**Step 1: 先写失败测试**

- 在 `src/renderer/code-editor-view.test.tsx` 增加一条能力测试：
  - `CodeEditorHandle` 暴露 `focus()` 后，会把焦点交还给编辑器宿主

Run:
```bash
npm run test -- src/renderer/code-editor-view.test.tsx
```

Expected:
- FAIL，提示 `focus` 方法不存在

**Step 2: 在控制器与 handle 上补 `focus()`**

- 在 `src/renderer/code-editor.ts` 的 `CodeEditorController` 增加 `focus()`
- 直接调用底层 `EditorView.focus()`
- 在 `src/renderer/code-editor-view.tsx` 的 `CodeEditorHandle` 中透传 `focus()`

约束：
- 不改动现有 `onChange` / `onBlur` / `replaceDocument` 行为
- 不新增新的 selection 状态源

**Step 3: 运行目标测试**

Run:
```bash
npm run test -- src/renderer/code-editor-view.test.tsx
```

Expected:
- PASS

**Step 4: 提交**

```bash
git add src/renderer/code-editor.ts src/renderer/code-editor-view.tsx src/renderer/code-editor-view.test.tsx
git commit -m "feat: expose editor focus handle"
```

## Task 3: 把整页设置切换改造成抽屉状态机

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

**Step 1: 先在 App 回归测试里写失败用例**

- 在 `src/renderer/app.autosave.test.ts` 增加用例：
  - 点击 `.settings-entry` 后，编辑器主界面仍保留在 DOM 中
  - 设置抽屉出现，而不是整页替换
  - 关闭抽屉后，主界面仍是同一轮渲染上下文

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL，原因是当前实现仍走 `view === "settings"`

**Step 2: 重构壳层状态**

- 把 `view: "editor" | "settings"` 改成更贴近抽屉的布尔或枚举状态，例如 `isSettingsOpen`
- 保持编辑器区域始终挂载
- 把 `SettingsView` 从“整页主体”改成“覆盖层容器的一部分”

约束：
- `CodeEditorView` 不能因设置开合而卸载
- `stateRef`、autosave timer、theme runtime 不要迁移出当前组件

**Step 3: 再补关闭路径**

- 支持以下关闭动作：
  - 关闭按钮
  - 遮罩点击
  - `Esc`

**Step 4: 跑回归测试**

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- 至少新增的“抽屉不替换主界面”用例 PASS
- 现有 autosave / theme 相关用例继续 PASS

**Step 5: 提交**

```bash
git add src/renderer/editor/App.tsx src/renderer/app.autosave.test.ts
git commit -m "feat: switch settings page to drawer state"
```

## Task 4: 重组主界面信息层级

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

**Step 1: 写失败测试，固定新层级**

- 在 `src/renderer/app.autosave.test.ts` 增加结构断言：
  - 存在 `rail`
  - 存在 `workspace`
  - 打开文档后存在 `document header`
  - 存在 `status strip`
  - `字数` 会显示在状态条而不是头部

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL，当前 DOM 结构不匹配

**Step 2: 重排 JSX 结构**

- 在 `src/renderer/editor/App.tsx` 中引入：
  - 左侧轨道容器
  - 工作区容器
  - 文档头部区
  - 状态条区
- 把当前 `save-status` 从头部拆到状态条
- 把 `Bridge: {platform}` 下沉到状态条右侧的弱信息区

**Step 3: 接入 `字数` helper**

- 在 `src/renderer/editor/App.tsx` 中基于当前编辑内容计算指标
- 优先从实时编辑内容读取，避免从磁盘状态推导
- 第一版只渲染 `字数`

**Step 4: 跑回归测试**

Run:
```bash
npm run test -- src/renderer/document-metrics.test.ts src/renderer/app.autosave.test.ts
```

Expected:
- PASS

**Step 5: 提交**

```bash
git add src/renderer/editor/App.tsx src/renderer/app.autosave.test.ts src/renderer/document-metrics.ts src/renderer/document-metrics.test.ts
git commit -m "feat: add document status strip"
```

## Task 5: 实现抽屉焦点恢复与 blur/autosave 协作

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

**Step 1: 写失败测试**

- 在 `src/renderer/app.autosave.test.ts` 增加两类用例：
  - 打开抽屉时，如果文档是 dirty，会沿用 blur 语义触发 autosave
  - 关闭抽屉后，若抽屉打开前焦点在编辑器，应恢复编辑器焦点

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL

**Step 2: 在 App 中补开合前焦点记录**

- 记录打开抽屉前的 `document.activeElement`
- 若来源是编辑器，则关闭时调用 `editorRef.current?.focus()`
- 否则把焦点还给设置入口按钮

**Step 3: 验证 autosave 仍走旧链路**

- 不要手写新的“打开抽屉即保存”逻辑
- 依赖现有 `CodeMirror blur -> onBlur -> runAutosave`
- 若测试里无法触发真实焦点流，补最小 mock 或显式事件模拟

**Step 4: 跑测试**

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- PASS

**Step 5: 提交**

```bash
git add src/renderer/editor/App.tsx src/renderer/app.autosave.test.ts
git commit -m "feat: restore focus after closing settings drawer"
```

## Task 6: 把 SettingsView 改成抽屉内容而不是页面主体

**Files:**
- Modify: `src/renderer/editor/settings-view.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

**Step 1: 先写失败测试**

- 在 `src/renderer/app.autosave.test.ts` 里补 drawer 语义断言：
  - `SettingsView` 有抽屉容器角色
  - 有标题、关闭按钮、遮罩配合
  - 现有“主题包 / 刷新主题 / 最近文件占位”交互仍可找到

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL

**Step 2: 改造 `SettingsView` 的结构**

- 保留现有表单逻辑与 `onUpdate` / `onRefreshThemes`
- 删除“整页返回”语义，改成抽屉头部和关闭语义
- 允许父层通过 props 控制：
  - `onClose`
  - 初始 focus 目标

**Step 3: 兼容现有功能**

- 主题选择与刷新保持原行为
- 自动保存设置保持原行为
- 最近文件禁用占位继续保留

**Step 4: 跑测试**

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- PASS

**Step 5: 提交**

```bash
git add src/renderer/editor/settings-view.tsx src/renderer/app.autosave.test.ts
git commit -m "refactor: adapt settings view for drawer shell"
```

## Task 7: 实现壳层样式、抽屉样式与响应式规则

**Files:**
- Modify: `src/renderer/styles/app-ui.css`
- Modify: `src/renderer/styles/settings.css`
- Modify: `src/renderer/styles/base.css`

**Step 1: 先写一个最小视觉回归保障**

- 若当前没有 CSS snapshot 方案，则在 `src/renderer/app.autosave.test.ts` 中先补类名 / 属性断言：
  - drawer 打开时根节点带有显式状态 class
  - workspace / rail / drawer 容器类名稳定存在

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL

**Step 2: 实现壳层 CSS**

- 在 `src/renderer/styles/app-ui.css` 中实现：
  - rail
  - workspace
  - 自适应文档头部
  - 文档画布容器宽度规则
  - 状态条
  - 空态工作区

约束：
- 颜色、字体、边框尽量继续消费现有主题 token
- 结构样式不要写死主题风格

**Step 3: 实现 drawer CSS**

- 在 `src/renderer/styles/settings.css` 中实现：
  - 左侧抽屉定位
  - 遮罩
  - 轻度毛玻璃
  - 进入 / 退出动效
  - reduced motion 退化

**Step 4: 实现基础兼容**

- 必要时在 `src/renderer/styles/base.css` 补充：
  - overlay 状态下的滚动与高度约束
  - 全局过渡的 reduced motion 规则

**Step 5: 跑测试与 build**

Run:
```bash
npm run test -- src/renderer/app.autosave.test.ts
npm run build
```

Expected:
- PASS

**Step 6: 提交**

```bash
git add src/renderer/styles/app-ui.css src/renderer/styles/settings.css src/renderer/styles/base.css src/renderer/app.autosave.test.ts
git commit -m "feat: add editor shell and drawer styling"
```

## Task 8: 同步文档基线与人工验收用例

**Files:**
- Modify: `docs/design.md`
- Modify: `docs/test-cases.md`
- Modify: `docs/plans/2026-04-16-editor-shell-refresh-intake.md`

**Step 1: 更新设计基线**

- 在 `docs/design.md` 中把编辑器壳层描述更新为：
  - 轻侧轨
  - 工作区画布
  - 左侧设置抽屉
  - 状态条信息

**Step 2: 更新人工验收**

- 在 `docs/test-cases.md` 中增加或修改用例：
  - 空态更像桌面编辑器
  - 设置抽屉可从左侧滑入
  - Esc / 遮罩可关闭抽屉
  - 打开抽屉不破坏当前文档编辑状态
  - 状态条显示 `Saving... / Autosaving... / All changes saved`
  - 状态条显示 `字数`

**Step 3: 回写 intake**

- 把 `docs/plans/2026-04-16-editor-shell-refresh-intake.md` 中的 `Next skill` 更新为已进入 `writing-plans`
- 若最终落点与风险有变化，同步修正文案

**Step 4: 做全文检索**

Run:
```bash
rg -n "整页设置|settings page|Use File > Open|Bridge:" docs src/renderer
```

Expected:
- 只留下仍然准确的文案，不保留误导性的旧描述

**Step 5: 提交**

```bash
git add docs/design.md docs/test-cases.md docs/plans/2026-04-16-editor-shell-refresh-intake.md
git commit -m "docs: sync editor shell refresh baseline"
```

## Recommended Execution Order

1. Task 1: 文档统计 helper
2. Task 2: 编辑器焦点能力
3. Task 3: 设置抽屉状态机
4. Task 4: 主界面信息层级
5. Task 5: 抽屉焦点恢复与 autosave 协作
6. Task 6: SettingsView 抽屉化
7. Task 7: 壳层与动效样式
8. Task 8: 文档同步

顺序原因：
- 先把纯函数与底层焦点能力定住
- 再改壳层状态和 DOM 结构
- 再补抽屉行为和样式
- 最后同步文档与验收

## Implementation Notes

- 抽屉开合不得触发 `CodeEditorView` 卸载
- 不要新增第二套保存状态源，继续复用 `AppState.saveState` 与 `isDirty`
- `字数` 先做成纯 renderer 派生值，不写入状态存储
- `Bridge: platform` 只做弱信息，不再占文档头部主位
- 动效必须有 `prefers-reduced-motion` 退化路径
- 轨道中未实现功能只能做中性占位，不能做“看起来可用”的假入口

## Verification Commands

分任务验证：

- Metrics:
  - `npm run test -- src/renderer/document-metrics.test.ts`
- Focus + editor wrapper:
  - `npm run test -- src/renderer/code-editor-view.test.tsx`
- Renderer shell:
  - `npm run test -- src/renderer/app.autosave.test.ts`

完整门禁：

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`


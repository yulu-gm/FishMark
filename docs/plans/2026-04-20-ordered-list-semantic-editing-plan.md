# Ordered List Semantic Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从根本上重构有序列表编辑链路，让 Enter、Backspace/Delete、Tab/Shift-Tab、Alt-Arrow 移动以及任意文档变更后的重编号都基于统一的列表语义模型，而不是分散的按键补丁。

**Architecture:** 保持 `markdown-engine -> editor-core -> renderer` 分层不变，但把“有序列表”从若干文本命令拼接的行为，重构为一套显式的语义化列表编辑层。`markdown-engine` 负责输出可保真的 ordered-list 元数据；`editor-core` 负责列表上下文读取、语义编辑计算、受影响 scope 归一化和统一命令入口；`renderer` 只保留测试入口和键位注册，不再承担列表结构修复逻辑。

**Tech Stack:** Electron、React、TypeScript、CodeMirror 6、micromark、Vitest

---

## 范围与约束

- 这是一次根治型重构，不接受继续沿 `runMarkdownEnter` / `runMarkdownBackspace` 添加 keypath 特判。
- Ordered list 必须保留 Markdown 文本保真，至少显式保留：
  - list 起始序号
  - marker delimiter（`.` 或 `)`）
- 列表编辑必须以 “list item subtree” 为最小单位，禁止继续使用单行 `moveLineUp` / `moveLineDown` 拼接修复。
- 旧的 line-based 列表实现要在新方案落地后删除，不保留兼容分支。
- 测试优先：先补结构性失败测试，再重构实现。

## 目标行为

- 显式从 `5.` 开始的有序列表，任何重排/修复后仍从 `5.` 开始。
- 中间插入、删除、粘贴覆盖、跨项替换后，受影响 ordered-list scope 自动重编号。
- `Enter` 在 ordered list 中的继续/退出行为只依赖列表结构，不依赖某个特定键位补丁。
- `Tab` / `Shift-Tab` 对 ordered list 的缩进/反缩进要同时修复源 scope 与目标 scope 的序号。
- `Alt-ArrowUp` / `Alt-ArrowDown` 移动的是完整 list item subtree，而不是单行文本。

---

### Task 1: 先用失败测试锁定根治范围

**Files:**
- Modify: `src/renderer/code-editor.test.ts`
- Modify: `packages/markdown-engine/src/parse-block-map.test.ts`
- Create: `packages/editor-core/src/commands/list-edits.test.ts`

**Step 1: 补 parser 保真测试**

- 在 `packages/markdown-engine/src/parse-block-map.test.ts` 新增 ordered-list metadata 测试：
  - `5. first` / `6. second` 应产出 list-level `startOrdinal = 5`
  - `5) first` / `6) second` 应产出 list-level `delimiter = ")"`
  - 嵌套 ordered list 需要各自保留独立起始序号与 delimiter

**Step 2: 补 editor 行为回归测试**

- 在 `src/renderer/code-editor.test.ts` 新增测试：
  - 删除中间项后，显式 `5.` 起始列表重排为 `5.` / `6.`
  - 在 ordered list 中间插入空项后，后续 sibling 自动顺延
  - `Tab` 缩进 ordered item 后，源同级列表与目标子列表都重排正确
  - `Shift-Tab` 反缩进 ordered item 后，回到父级时父子两个 scope 都重排正确
  - `Alt-ArrowUp` / `Alt-ArrowDown` 移动带 continuation/nested child 的 item 时，整棵子树一起移动

**Step 3: 补语义编辑单测骨架**

- 在 `packages/editor-core/src/commands/list-edits.test.ts` 为计划中的纯函数接口写失败测试：
  - `computeInsertOrderedListItemBelow`
  - `computeDeleteOrderedListRange`
  - `computeIndentListItem`
  - `computeOutdentListItem`
  - `computeMoveListItemUp`
  - `computeMoveListItemDown`
  - `normalizeOrderedListScopes`

**Step 4: 运行测试确认失败**

Run:

```bash
npm run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts
```

Expected:

- parser metadata 新断言失败
- `list-edits.test.ts` 因文件/导出不存在而失败
- renderer ordered-list 新回归失败

**Step 5: 提交测试基线**

```bash
git add packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts
git commit -m "test: lock ordered list semantic editing regressions"
```

---

### Task 2: 扩展 markdown-engine 的 ordered-list 数据模型

**Files:**
- Modify: `packages/markdown-engine/src/block-map.ts`
- Modify: `packages/markdown-engine/src/parse-block-map.ts`
- Modify: `packages/markdown-engine/src/parse-block-map.test.ts`

**Step 1: 调整 block model**

- 在 `packages/markdown-engine/src/block-map.ts` 为 `ListBlock` 增加：
  - `startOrdinal: number | null`
  - `delimiter: "." | ")" | null`
- 约束：
  - unordered list 这两个字段必须为 `null`
  - ordered list 必须有稳定的 `startOrdinal` 与 `delimiter`

**Step 2: 让 parser 产出 list-level ordered metadata**

- 在 `packages/markdown-engine/src/parse-block-map.ts` 的 `createListBlock` / `parseListItems` 路径：
  - 从首个 ordered item 解析 `startOrdinal`
  - 从首个 ordered item 解析 `delimiter`
  - 保留 item-level `markerStart` / `markerEnd` 供后续重写

**Step 3: 跑 parser 测试**

Run:

```bash
npm run test -- packages/markdown-engine/src/parse-block-map.test.ts
```

Expected: PASS

**Step 4: 提交 parser 元数据变更**

```bash
git add packages/markdown-engine/src/block-map.ts packages/markdown-engine/src/parse-block-map.ts packages/markdown-engine/src/parse-block-map.test.ts
git commit -m "refactor: preserve ordered list metadata in block map"
```

---

### Task 3: 新建列表语义编辑层，替换文本拼接逻辑

**Files:**
- Create: `packages/editor-core/src/commands/list-context.ts`
- Create: `packages/editor-core/src/commands/list-context.test.ts`
- Create: `packages/editor-core/src/commands/list-edits.ts`
- Create: `packages/editor-core/src/commands/list-edits.test.ts`
- Modify: `packages/editor-core/src/commands/index.ts`

**Step 1: 建立列表上下文读取层**

- 在 `list-context.ts` 提供从 `EditorState + ActiveBlockState` 读取语义列表上下文的纯函数：
  - 当前 list block
  - 当前 item index
  - item subtree range
  - sibling scope range
  - parent / child scope
  - 受影响 ordered-list scopes

**Step 2: 建立列表语义编辑纯函数**

- 在 `list-edits.ts` 定义并实现纯函数，返回统一的 edit payload：
  - 文本替换
  - 新 selection
  - 需要归一化的 ordered-list scopes
- 禁止在这里直接调用 CodeMirror 命令
- 语义函数必须面向 “item subtree”，不面向单行文本

**Step 3: 建立 ordered-list scope 归一化器**

- 在 `list-edits.ts` 实现 `normalizeOrderedListScopes`：
  - 使用 list-level `startOrdinal` + `delimiter`
  - 只重写受影响 scope 的 sibling 序号
  - 不跨 scope 污染嵌套列表

**Step 4: 跑纯函数测试**

Run:

```bash
npm run test -- packages/editor-core/src/commands/list-context.test.ts packages/editor-core/src/commands/list-edits.test.ts
```

Expected: PASS

**Step 5: 提交语义编辑层**

```bash
git add packages/editor-core/src/commands/list-context.ts packages/editor-core/src/commands/list-context.test.ts packages/editor-core/src/commands/list-edits.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/index.ts
git commit -m "refactor: add semantic ordered list edit layer"
```

---

### Task 4: 用语义编辑层重写 Enter / 删除 / 缩进 / 反缩进 / 移动命令

**Files:**
- Modify: `packages/editor-core/src/commands/list-commands.ts`
- Modify: `packages/editor-core/src/commands/markdown-commands.ts`
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: 重写 list command 边界**

- 在 `list-commands.ts` 中：
  - 保留对外命令名，但内部全部改为调用 `list-context.ts` + `list-edits.ts`
  - 删除对 `deleteCharBackward`、`moveLineUp`、`moveLineDown` 的列表结构依赖
  - 删除当前的 `shouldExitEmptyListItem` / `renumberOrderedListAtSelection` 这一类补丁式 helper

**Step 2: 让 markdown command 只做分发**

- 在 `markdown-commands.ts`：
  - `runMarkdownEnter`、`runMarkdownBackspace`、`runMarkdownTab` 不再承担 ordered-list 修复职责
  - 新增 `runMarkdownDelete`（如果仓库现阶段没有显式 Delete handler，就在此任务补齐）

**Step 3: 补齐 Shift-Tab / Delete 键位**

- 在 `packages/editor-core/src/extensions/markdown.ts` 注册：
  - `Shift-Tab` -> semantic outdent
  - `Delete` -> semantic delete / normalize path
- 在 `src/renderer/code-editor.ts` 增加测试驱动入口：
  - `pressDelete()`
  - `pressShiftTab()`

**Step 4: 跑 renderer 行为测试**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts
```

Expected: PASS

**Step 5: 提交命令重写**

```bash
git add packages/editor-core/src/commands/list-commands.ts packages/editor-core/src/commands/markdown-commands.ts packages/editor-core/src/extensions/markdown.ts src/renderer/code-editor.ts src/renderer/code-editor.test.ts
git commit -m "refactor: route list commands through semantic edit engine"
```

---

### Task 5: 增加 transaction-level ordered-list normalization，覆盖非特定键位编辑

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/derived-state/inactive-block-decorations.ts`
- Modify: `packages/editor-core/src/commands/list-edits.ts`
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: 为任意 doc change 增加 ordered-list affected-scope 识别**

- 在 extension 层识别 transaction changed ranges
- 对 intersect ordered list 的 scope 调用统一 normalization
- 要求：
  - paste / replaceSelection / deleteSelection 后也能修复编号
  - 没有受影响 ordered list 时不做额外 dispatch

**Step 2: 补非键位路径回归测试**

- 在 `src/renderer/code-editor.test.ts` 新增：
  - 选中中间 item 后直接 `insertText("")` 触发删除，也会重排
  - 直接粘贴一段新的 ordered item 到中间后，整个 scope 自动归一化

**Step 3: 跑 focused 测试**

Run:

```bash
npm run test -- src/renderer/code-editor.test.ts packages/editor-core/src/extensions/markdown.test.ts
```

Expected: PASS

**Step 4: 提交 transaction-level normalization**

```bash
git add packages/editor-core/src/extensions/markdown.ts packages/editor-core/src/derived-state/inactive-block-decorations.ts packages/editor-core/src/commands/list-edits.ts src/renderer/code-editor.test.ts
git commit -m "refactor: normalize ordered lists after arbitrary document edits"
```

---

### Task 6: 删除旧实现与冗余导出，收口架构

**Files:**
- Modify: `packages/editor-core/src/commands/list-commands.ts`
- Modify: `packages/editor-core/src/commands/index.ts`
- Modify: `packages/editor-core/src/commands/line-parsers.ts`
- Modify: `packages/editor-core/src/commands/line-parsers.test.ts`
- Modify: `packages/editor-core/src/extensions/markdown-shortcuts.ts`

**Step 1: 删除旧的 line-based 列表残留**

- 删除已不再需要的逻辑：
  - ordered-list 特判式 renumber helper
  - 仅服务旧列表逻辑的 marker 自增拼接函数
  - 仅为了旧 `Tab` 实现存在的文本变换残留

**Step 2: 清理快捷键说明**

- 更新 shortcut catalog：
  - 如果加入了 `Shift-Tab` / `Delete` 的列表语义动作，确保提示文案同步
  - 不再暴露过时的行为描述

**Step 3: 运行完整验证**

Run:

```bash
npm run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/list-context.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected:

- 所有 ordered-list 相关测试 PASS
- lint PASS
- typecheck PASS
- build PASS

**Step 4: 提交架构收口**

```bash
git add packages/markdown-engine/src packages/editor-core/src src/renderer
git commit -m "refactor: replace patchy ordered list editing with semantic model"
```

---

## 验收清单

- Ordered list model 能保留显式起始序号与 delimiter。
- 所有列表编辑动作都经由统一语义编辑层。
- 任意文档变更路径下，ordered list 都不会因 keypath 不同而表现不一致。
- Alt-Arrow 移动的是完整 item subtree。
- Tab / Shift-Tab 对 ordered list 的父子 scope 都会重排正确。
- 不存在为旧实现保留的兼容分支或临时 helper。

## 实施顺序建议

- 先完成 Task 1-3，建立模型与纯函数，再进入 Task 4-5。
- Task 4 完成前，不要继续叠加新的 ordered-list 特判。
- Task 6 必须执行，避免 semantic layer 落地后旧逻辑仍残留在命令链里。

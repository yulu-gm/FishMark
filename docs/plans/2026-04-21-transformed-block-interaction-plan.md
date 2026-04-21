# Transformed Block Interaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立统一的变形块交互层，替换分散特判，彻底修复各类变形块的光标跳转与鼠标命中问题。

**Architecture:** 在 `editor-core` 中新增统一的 `BlockInteractionAdapter` 注册与调度层，把鼠标命中、上下导航、边界进入/退出从 `markdown.ts` 和零散 command 特判中收口。`table`、`codeFence`、`blockquote`、`list`、`heading`、`thematicBreak`、`paragraph` 都通过 adapter 暴露交互规则。

**Tech Stack:** TypeScript、CodeMirror 6、Vitest、Electron renderer

---

### Task 1: 扩展交互回归测试矩阵

**Files:**
- Modify: `src/renderer/code-editor.test.ts`

**Step 1: Write the failing test**

补充以下最小回归：

- `heading` 点击隐藏 marker 左侧区域后应落到标题起点
- `blockquote` 点击左侧 padding / quote bar 后应落到该行起点
- `unordered list` / `task list` 点击 bullet 或 checkbox 区域后应落到该项起点
- `thematic break` 点击横线后应落到分割线起点
- `code fence` 第一条/最后一条可见内容行的 `ArrowUp` / `ArrowDown`
- `code fence` 顶部/底部视觉 padding 点击

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 新增用例失败，失败原因是当前命中和导航仍然走默认映射。

### Task 2: 建立统一交互层骨架

**Files:**
- Create: `packages/editor-core/src/interactions/types.ts`
- Create: `packages/editor-core/src/interactions/context.ts`
- Create: `packages/editor-core/src/interactions/registry.ts`
- Create: `packages/editor-core/src/interactions/index.ts`
- Modify: `packages/editor-core/src/index.ts`

**Step 1: Write the failing test**

依赖 Task 1 里的失败用例，不再新增额外测试。

**Step 2: Write minimal implementation**

定义：

- `BlockInteractionAdapter`
- `BlockInteractionContext`
- `PointerInteractionResult`
- `VerticalNavigationResult`
- adapter registry 查询入口

要求：

- 先支持按 `block.type` 查 adapter
- 提供统一 `resolvePointerSelection` 与 `resolveVerticalMotion`

**Step 3: Run test to verify it still fails but compiles**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 新用例继续失败，但不应出现类型或导入错误。

### Task 3: 迁移输入调度到统一交互层

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/commands/markdown-commands.ts`

**Step 1: Write the failing test**

继续使用 Task 1 的失败用例。

**Step 2: Write minimal implementation**

将以下路径统一改为通过 registry 调度：

- `mousedown`
- `ArrowUp`
- `ArrowDown`

要求：

- adapter 命中成功时直接 dispatch selection
- 命中失败时才回退普通 `posAtCoords` / 默认垂直移动
- 删除现有零散 code fence 特判入口

**Step 3: Run test to verify partial progress**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 至少 pointer / arrow 测试开始由统一层接管，失败数量下降。

### Task 4: 实现 line-based block adapters

**Files:**
- Create: `packages/editor-core/src/interactions/adapters/heading-adapter.ts`
- Create: `packages/editor-core/src/interactions/adapters/list-adapter.ts`
- Create: `packages/editor-core/src/interactions/adapters/blockquote-adapter.ts`
- Create: `packages/editor-core/src/interactions/adapters/thematic-break-adapter.ts`
- Create: `packages/editor-core/src/interactions/adapters/paragraph-adapter.ts`
- Modify: `packages/editor-core/src/interactions/registry.ts`

**Step 1: Write the failing test**

确认 heading/list/blockquote/thematic break 的 pointer 测试仍然失败。

**Step 2: Write minimal implementation**

为每类 block 实现：

- 视觉前缀点击命中
- 必要的上下边界 anchor

规则：

- heading：隐藏 marker 区点击落到标题行起点
- list：bullet / ordered marker / task checkbox 区点击落到 item 起点
- blockquote：左侧 padding / quote bar 点击落到该行起点
- thematicBreak：整条规则线点击落到分割线起点
- paragraph：只作为普通 fallback

**Step 3: Run test to verify it passes**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 上述 pointer 测试通过。

### Task 5: 实现 code fence adapter

**Files:**
- Create: `packages/editor-core/src/interactions/adapters/code-fence-adapter.ts`
- Modify: `packages/editor-core/src/commands/code-fence-commands.ts`
- Modify: `packages/editor-core/src/interactions/registry.ts`

**Step 1: Write the failing test**

确认 code fence 顶/底边界点击和 `ArrowUp` / `ArrowDown` 用例失败。

**Step 2: Write minimal implementation**

统一由 adapter 处理：

- 第一条可见内容行向上进入 opening fence
- 最后一条可见内容行向下进入 closing fence
- 顶部 padding 点击进入 opening fence
- 底部 padding / language label 区点击进入 closing fence

并删除旧的 code fence 导航特判。

**Step 3: Run test to verify it passes**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: code fence 相关新增用例通过。

### Task 6: 实现 table adapter

**Files:**
- Create: `packages/editor-core/src/interactions/adapters/table-adapter.ts`
- Modify: `packages/editor-core/src/table-cursor-state.ts`
- Modify: `packages/editor-core/src/decorations/table-widget.ts`
- Modify: `packages/editor-core/src/commands/table-commands.ts`
- Modify: `packages/editor-core/src/interactions/registry.ts`

**Step 1: Write the failing test**

确认现有 table 的上下进出、点击单元格、空行进入/退出测试仍覆盖核心行为。

**Step 2: Write minimal implementation**

把 table 的如下能力纳入 adapter：

- `inside / adjacent-above / adjacent-below`
- 单元格点击转 selection
- 从相邻行进入表格
- 从首行 / 末行退出表格

保留 widget DOM，但删除旁路式的分散命令入口。

**Step 3: Run test to verify it passes**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: table 相关既有测试继续通过。

### Task 7: 删除旧兼容路径并收口导出

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/commands/index.ts`
- Modify: `packages/editor-core/src/index.ts`

**Step 1: Write the failing test**

继续使用现有测试集作为保护网。

**Step 2: Write minimal implementation**

删除：

- 旧的 code fence `mousedown` 修补逻辑
- 旧的表格旁路分发入口
- `markdown-commands.ts` 中只服务于旧架构的块级导航拼接

确保所有导出路径只保留统一交互层需要的 API。

**Step 3: Run focused verification**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 所有本任务相关测试通过，且没有新增回归。

### Task 8: 全量验证

**Files:**
- No code changes expected

**Step 1: Run tests**

Run: `npm run test -- src/renderer/code-editor.test.ts`

Expected: 本次新增交互矩阵与现有相关测试通过。

**Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`

Expected: PASS

**Step 4: Run build**

Run: `npm run build`

Expected: PASS

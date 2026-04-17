# 拖拽打开 Markdown 多窗口 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让拖入 Markdown 文件时根据当前窗口状态选择“当前窗口打开”或“新开编辑器窗口打开”，并阻止默认文件导航与开发版多实例。

**Architecture:** 由 renderer 在窗口级捕获拖拽文件，使用新的受限 IPC 把拖入路径和当前窗口是否已有文档交给 main。main 负责受控多窗口决策，runtime window manager 负责统一阻断默认导航和异常新窗，开发版恢复单实例锁保证拖拽事件回到现有主进程。

**Tech Stack:** Electron、React、TypeScript、Vitest

---

### Task 1: 锁定开发版单实例行为

**Files:**
- Modify: `src/main/runtime-environment.test.ts`
- Modify: `src/main/runtime-environment.ts`

**Step 1: Write the failing test**

把开发版单实例测试改为期望 `true`。

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/runtime-environment.test.ts`

**Step 3: Write minimal implementation**

让 `shouldRequestSingleInstanceLock()` 在开发版也返回 `true`。

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/runtime-environment.test.ts`

### Task 2: 为窗口增加导航保护

**Files:**
- Modify: `src/main/runtime-windows.test.ts`
- Modify: `src/main/runtime-windows.ts`

**Step 1: Write the failing test**

新增断言：创建窗口后会注册 `will-navigate` 监听，并通过 `setWindowOpenHandler` 拒绝默认新窗。

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/runtime-windows.test.ts`

**Step 3: Write minimal implementation**

在 `createRuntimeWindowManager()` 内对每个新窗口注册导航保护。

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/runtime-windows.test.ts`

### Task 3: 建立拖拽打开决策 IPC

**Files:**
- Modify: `src/shared/open-markdown-file.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/renderer/types.d.ts`
- Modify: `src/main/main.ts`

**Step 1: Write the failing tests**

为 preload contract 增加新的 invoke 断言，确保 renderer 只能调用受限 channel。

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/preload/preload.contract.test.ts`

**Step 3: Write minimal implementation**

新增拖拽打开请求/响应类型与 channel，preload 暴露 `handleDroppedMarkdownFile()`，main 按 `hasOpenDocument` 决定返回 `open-in-place` 或直接开新窗口。

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/preload/preload.contract.test.ts`

### Task 4: 接入 renderer 拖拽策略

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`

**Step 1: Write the failing tests**

新增断言：
- 空工作区拖入时会在当前窗口打开
- 已有文档时拖入时不会覆盖当前文档，而是请求主进程开新窗口

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

**Step 3: Write minimal implementation**

renderer 对任意文件拖拽都阻止默认行为；提取 Markdown 路径后调用新的拖拽 IPC，并仅在主进程返回 `open-in-place` 时执行本窗口打开。

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

### Task 5: 更新验收文档并做总验证

**Files:**
- Modify: `docs/test-cases.md`
- Modify: `docs/acceptance.md`

**Step 1: Update docs**

明确空工作区与已有文档两种拖拽结果。

**Step 2: Run verification**

Run:
- `npm run test -- src/main/runtime-environment.test.ts src/main/runtime-windows.test.ts src/preload/preload.contract.test.ts src/renderer/app.autosave.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

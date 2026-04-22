# Tabbed Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 FishMark 落地标签页工作区的第一条可运行主链，让当前窗口可以持有多个 Markdown 标签页，并让 `main` 成为窗口与标签结构的唯一事实源。

**Architecture:** 本轮先建立 `main` 侧 `WorkspaceGraph`/`TabSession` 基础服务与对应 IPC 契约，再把 renderer 从单一 `currentDocument` 迁移为“标签栏 + 活动标签编辑器”模型。保存、autosave、外部文件监听继续沿用现有能力，但入口改为通过活动 `tabId` 驱动，确保后续拖拽排序、拖出成新窗口和逐标签关闭可以继续叠加。

**Tech Stack:** Electron、React、TypeScript、CodeMirror 6、Vitest

---

### Task 1: 建立 main 侧工作区真值与共享契约

**Files:**
- Create: `src/shared/workspace.ts`
- Create: `src/main/workspace-service.ts`
- Test: `src/main/workspace-service.test.ts`
- Test: `src/preload/preload.contract.test.ts`

**Step 1: Write the failing tests**

- 为 `WorkspaceGraph`/`TabSession` 增加纯状态测试，覆盖：
  - 新窗口注册后为空工作区
  - 在当前窗口创建 untitled 标签页
  - 在当前窗口追加已保存文档标签并切换活动标签
  - 更新草稿后 dirty 状态与标签标题快照同步

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test -- src/main/workspace-service.test.ts src/preload/preload.contract.test.ts`

Expected: FAIL，提示缺少 `workspace-service`/共享契约或导出的 API 不存在。

**Step 3: Write minimal implementation**

- 新增 `src/shared/workspace.ts`，定义窗口快照、标签快照、tab 命令输入与 IPC channel 常量
- 新增 `src/main/workspace-service.ts`，封装窗口注册、标签创建、文档打开、草稿同步、活动标签切换
- 在 preload contract test 中加入新 bridge API 断言

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test -- src/main/workspace-service.test.ts src/preload/preload.contract.test.ts`

Expected: PASS

### Task 2: 接入 main/preload IPC，替换单文档打开入口

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.d.ts`
- Test: `src/main/application-menu.test.ts`
- Test: `src/main/main.test.ts`
- Test: `src/preload/preload.test.ts`

**Step 1: Write the failing tests**

- 为菜单补 `New Window`
- 为 `main.ts`/preload bridge 补工作区 IPC 与 API 暴露断言

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test -- src/main/application-menu.test.ts src/main/main.test.ts src/preload/preload.test.ts`

Expected: FAIL，提示菜单命令或 preload 暴露不完整。

**Step 3: Write minimal implementation**

- 主进程创建 workspace service，并在窗口生命周期中注册/注销窗口
- 将 `New` / `Open...` / `Open From Path` / drag-drop 决策收敛到 workspace IPC
- preload 暴露 `getWorkspaceSnapshot`、`createWorkspaceTab`、`openWorkspaceFile`、`openWorkspaceFileFromPath`、`activateWorkspaceTab`、`updateWorkspaceTabDraft`

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test -- src/main/application-menu.test.ts src/main/main.test.ts src/preload/preload.test.ts`

Expected: PASS

### Task 3: renderer 迁移到标签栏 + 活动标签编辑器

**Files:**
- Modify: `src/renderer/document-state.ts`
- Modify: `src/renderer/document-state.test.ts`
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`
- Modify: `src/renderer/editor-test-driver.ts`
- Modify: `src/renderer/editor-test-driver.test.ts`
- Modify: `src/renderer/styles/app-ui.css`

**Step 1: Write the failing tests**

- 新增 renderer 状态测试，覆盖：
  - 窗口可持有多个 tab
  - 激活标签切换会重载活动编辑器
  - 打开第二个文档不会替换第一个标签
  - 标签 dirty 标记随编辑同步

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test -- src/renderer/document-state.test.ts src/renderer/editor-test-driver.test.ts src/renderer/app.autosave.test.ts`

Expected: FAIL，提示仍然依赖 `currentDocument` 单文档模型。

**Step 3: Write minimal implementation**

- 将 renderer 状态改成标签列表 + 活动标签快照
- 新增顶部标签栏 UI、活动标签切换与关闭入口
- 保持单窗口只挂载一个活动 CodeMirror 实例
- 在编辑变更时同步活动标签草稿到 `main`

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test -- src/renderer/document-state.test.ts src/renderer/editor-test-driver.test.ts src/renderer/app.autosave.test.ts`

Expected: PASS

### Task 4: 收尾当前切片并记录执行状态

**Files:**
- Modify: `MVP_BACKLOG.md`
- Modify: `docs/progress.md`
- Create: `docs/plans/2026-04-22-tabbed-workspace-handoff.md`
- Modify: `reports/task-summaries/TASK-043.md`

**Step 1: 开发自检**

Run:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test -- src/main/workspace-service.test.ts src/preload/preload.contract.test.ts src/main/application-menu.test.ts src/main/main.test.ts src/preload/preload.test.ts src/renderer/document-state.test.ts src/renderer/editor-test-driver.test.ts src/renderer/app.autosave.test.ts`

**Step 2: 文档同步**

- 仅在第一执行切片完成时勾选 `MVP_BACKLOG.md` 对应执行切片
- 同步 `docs/progress.md`、`reports/task-summaries/TASK-043.md`
- 写 execution handoff，记录已完成能力、推荐验证命令和剩余风险

# TASK-030 CLI 驱动的真实编辑器执行设计

## 范围

Task: `TASK-030`  
Goal: 将 `TASK-030` 从已经撤回的 synthetic visual-test 试验，重定义为“由 CLI 启动真实的 Yulora editor 测试窗口，并在其中执行所有编辑器操作，同时由 workbench 同步显示实时步骤状态和结果”的能力。

In scope:
- 将 `runCli()` 提升为 editor 场景的唯一执行入口
- 让 CLI 能启动或复用真实的 editor 测试窗口，并在真实 editor renderer 内执行步骤命令
- 对于 editor 场景，停止由 workbench 在本地直接调用 `runScenario()`，改为观察 CLI run session
- 保留 `TASK-029` 已建立的退出码、结果目录结构和结果文档协议
- 至少让一条默认场景真正落到真实 editor 驱动路径

Out of scope:
- 截图、baseline、diff 图或任何像素比较逻辑
- 引入 Playwright 或其他外部自动化层
- 一次性交付大量新场景
- 将这一轮扩展成通用自动化平台

## 当前上下文

当前代码库里实际上有两条分离的执行路径：

- CLI 路径  
  [packages/test-harness/src/cli/run.ts](D:/MyAgent/Yulora/Yulora/packages/test-harness/src/cli/run.ts:1)  
  目前它会用 headless handler 驱动 `runScenario()`，并写出 `result.json` 和 `step-trace.json`。

- Workbench 路径  
  [src/renderer/App.tsx](D:/MyAgent/Yulora/Yulora/src/renderer/App.tsx:1)  
  目前它会在 renderer 内直接运行 `runScenario()`，然后把 `RunnerEvent` 折叠成 debug UI。

这正是当前的架构错位。如果编辑器内的真实操作应该通过 CLI 进行，那么 `TASK-030` 就不能继续保留 renderer-local 的执行模型。正确目标应该是：CLI 成为唯一可信的执行时入口，workbench 只负责观察它。

## 方案比较

### 方案 A：由 `runCli()` 统一执行，workbench 只做实时观察

所有场景执行都统一走 `runCli()`。终端运行直接调用它；workbench 触发运行时，由 main 启动一个 CLI run session，workbench 只订阅其事件流。

优点：
- CLI 真正成为 editor 执行的所有者
- 消除终端运行和 workbench 运行之间的语义漂移
- 直接复用 `TASK-029` 已有的退出码与 artifact 协议

缺点：
- 需要在 main 中新增 run session 编排能力
- 需要把 workbench 从“本地执行器”改成“事件订阅者”

### 方案 B：保留 renderer-local runner，让 CLI 远程控制它

CLI 变成一个触发层，底层仍然依赖 workbench 当前的本地 runner。

优点：
- UI 表面 diff 看起来较小

缺点：
- CLI 并不是真正的执行所有者
- 仍然保留两套执行模型
- 不符合已经确定的目标方向

### 方案 C：由 workbench 启动外部 CLI 子进程

workbench 点击按钮后，直接拉起打包后的 CLI 或 node 入口，并持续读取它的输出。

优点：
- 从感知上最像“workbench 在调用 CLI”

缺点：
- 在 dev 和打包模式下都会增加进程管理复杂度
- 生命周期和日志集成更麻烦
- 额外复杂度与收益不匹配

## 推荐方案

采用方案 A。

`runCli()` 应该成为 editor 场景的唯一执行入口。workbench 不再负责承载这些运行，而是退回为一个 CLI-owned run session 的实时观察器。这样执行契约只有一份，UI 只是观察者，不再是第二套运行时。

## 架构设计

### 1. `runCli()` 成为权威执行协调器

`packages/test-harness/src/cli/run.ts` 继续作为顶层运行入口，并扩展以下职责：

- 解析场景 id 和运行参数
- 为场景建立正确的运行平台
- 为 editor 场景构建真实 editor-backed 的 step handler
- 驱动 `runScenario()`
- 在执行过程中持续产出有序的 `RunnerEvent`
- 写出 `result.json` 和 `step-trace.json`
- 生成最终退出码和终态摘要

这意味着：

- 终端模式：直接调用 `runCli()`，输出 stdout / stderr
- workbench 模式：由 Electron main 调用同一个 `runCli()`，并把实时事件转发给 workbench

### 2. Main 持有 run session 和 editor session

main 需要显式区分两类状态：

- `CliRunSession`  
  表示一次场景执行。它持有 `runId`、场景 id、生命周期状态、实时事件、终态结果、artifact 路径和中断控制。

- `EditorTestSession`  
  表示一个真实的 editor 测试窗口，它可以接收测试命令，并返回结构化结果。

main 的职责：

- 打开或复用 editor 测试窗口
- 追踪哪个 editor 窗口属于哪个 editor test session
- 以 Electron-backed 平台能力启动一个 CLI run session
- 向订阅的 workbench 窗口转发实时 `RunnerEvent` 和终态结果
- 在需要时中断活跃运行

main 不应该被做成通用自动化框架。它只负责 run 生命周期编排和有限白名单测试命令的路由。

### 3. Workbench 改成 run monitor，而不是本地 runner

对于 editor 场景，workbench 不再本地调用 `runScenario()`。

它需要两类能力：

- 启动 / 停止控制
  - `startScenarioRun({ scenarioId })`
  - `interruptScenarioRun({ runId })`

- 实时观察
  - `onScenarioRunEvent(listener)`
  - `onScenarioRunTerminal(listener)`

现有的 `DebugRunState` 模型可以保留。唯一变化是数据源：从 renderer 内部 promise 链，改成由 main 转发过来的 CLI 事件流。

### 4. Preload 暴露受限的 run-control bridge

renderer 不能拿到宽泛的 Electron 能力，所以 preload 只暴露受限接口。

workbench 侧 bridge：

```ts
startScenarioRun(input: { scenarioId: string }): Promise<{ runId: string }>
interruptScenarioRun(input: { runId: string }): Promise<void>
onScenarioRunEvent(listener: (payload: RunnerEventEnvelope) => void): () => void
onScenarioRunTerminal(listener: (payload: ScenarioRunTerminal) => void): () => void
```

editor 侧 bridge：

```ts
onEditorTestCommand(listener: (payload: EditorTestCommandEnvelope) => void): () => void
completeEditorTestCommand(result: EditorTestCommandResultEnvelope): void
```

不能暴露通用 IPC，不能加 eval 风格测试钩子，也不能把超出 allowlist 的 Node / Electron 能力直接给 renderer。

## Run 与命令模型

### Run session 封装

建议的共享结构：

```ts
type ScenarioRunId = string;

type RunnerEventEnvelope = {
  runId: ScenarioRunId;
  event: RunnerEvent;
};

type ScenarioRunTerminal = {
  runId: ScenarioRunId;
  exitCode: number;
  status: ScenarioStatus;
  resultPath?: string;
  stepTracePath?: string;
  error?: RunErrorInfo & { stepId?: string };
};
```

workbench 必须始终按 `runId` 组织实时状态，避免多个并发运行互相污染。

### Editor 命令模型

CLI 不能直接去碰 DOM 内部实现。它应通过 main 和 preload，把 allowlist 的 editor test command 发到 editor renderer。

首批建议命令集：

```ts
type EditorTestCommand =
  | { type: "wait-for-editor-ready" }
  | { type: "open-fixture-file"; fixturePath: string }
  | { type: "set-editor-content"; content: string }
  | { type: "insert-editor-text"; text: string }
  | { type: "save-document" }
  | { type: "assert-document-path"; expectedPath: string }
  | { type: "assert-editor-content"; expectedContent: string }
  | { type: "assert-dirty-state"; expectedDirty: boolean };
```

建议结果结构：

```ts
type EditorTestCommandResult = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};
```

约束：
- 一个 CLI step handler 只发一条命令，并等待一条结果
- `ok: false` 直接转换成 step failure
- `details` 只作为辅助调试信息

## Handler 策略

### 保留 headless 与 Electron-backed 两套 handler factory

现有 headless 路径仍然有价值，它依旧是当前最小 CLI 基线，也可作为 fallback。`TASK-030` 应新增一套真实 editor 执行 handler，而不是把 headless 语义污染成混合模型。

建议拆分：

- `createHeadlessStepHandlers(...)`
- `createElectronStepHandlers(...)`

然后由 `runCli()` 根据 main 注入的运行平台能力来选择具体实现。

### 首批目标场景

首条真实场景仍然推荐 `open-markdown-file-basic`。

原因：
- 它已经在默认 registry 中存在
- 它覆盖了最小闭环：打开 editor、打开文件、断言路径与内容
- 它不会立刻把范围扩散到 autosave、IME、渲染等更高风险区域

## 数据流

### A. 从 workbench 触发运行

1. 用户在 workbench 里选择 `open-markdown-file-basic`
2. workbench 调用 `startScenarioRun({ scenarioId })`
3. main 创建一个 `CliRunSession`
4. main 确保存在一个 `EditorTestSession`
5. main 调用 `runCli()`，并注入 Electron-backed handler 构造和事件转发钩子
6. `runCli()` 调用 `runScenario()`
7. 每个 step handler 向真实 editor renderer 发送结构化 editor test command
8. editor test driver 执行真实操作或断言，并返回结构化结果
9. `runCli()` 产出 `RunnerEvent`
10. main 将事件流转发给 workbench
11. workbench 把这些事件折叠成 `DebugRunState`
12. `runCli()` 写出 `result.json` 和 `step-trace.json`
13. main 发送 terminal payload，包括状态、退出码和 artifact 路径

### B. 从终端触发运行

1. agent 执行 `npm run test:scenario -- --id open-markdown-file-basic`
2. `runCli()` 走同一套执行路径和同一套 handler 语义
3. stdout / stderr 输出运行摘要
4. artifact 落到 `.artifacts/test-runs/...`
5. 如果 workbench 正在打开并订阅，也可以同步显示这个 run session

## 错误处理

需要明确处理五类错误：

### 1. Run session 创建失败

main 无法创建或启动 `CliRunSession`。

期望行为：
- workbench 立即显示启动失败
- 不进入任何场景步骤

### 2. Editor session 创建失败

CLI 需要真实 editor 窗口，但 main 无法打开或绑定窗口。

期望行为：
- 首个 setup step 失败
- 根据错误性质返回 failed 或 config-error
- workbench 显示明确诊断

### 3. Editor 命令执行失败

editor renderer 返回 `ok: false`。

期望行为：
- 当前 step 标记为 `failed`
- 失败信息同步传播到 stderr、`result.json` 和 workbench

### 4. 运行中 editor 窗口丢失

editor 窗口在执行过程中关闭或崩溃。

期望行为：
- 当前 step 失败
- 后续步骤按既有 runner 语义标记为 skipped
- workbench 明确显示 session lost

### 5. 超时或中断

继续以 `runScenario()` 现有语义为准：
- step timeout => `timed-out`
- 外部 stop => `interrupted`

workbench 的中断按钮应调用 `interruptScenarioRun({ runId })`，而不是终止本地 renderer promise。

## Artifact 协议

`TASK-029` 的 artifact 结构应保持不变：

- `result.json`
- `step-trace.json`

但含义会变化：
- 它们变成 CLI 驱动的真实 editor 运行的权威持久化输出
- workbench 应显示与这两份文件一致的事件流和终态

可以考虑新增的元数据：
- `runId`
- `runtime: "electron"`
- 可选的 `editorSessionId`

这一轮不应继续保留或新增 `visualResults`。如果 artifact schema 中还有残留的 visual 字段，应在实现阶段删除或正式废弃。

## UI 方向

workbench 保留原有核心面板：
- `Scenario Catalog`
- `Debug Stream`
- `Test Process`

但它们的语义要改变：
- `Run Selected Scenario` 不再本地运行，而是通过 main 启动一个 CLI run session
- 当前步骤状态和最近事件都来自 CLI 转发的事件流
- 终态区域应在有条件时显示 artifact 路径
- 可以增加一个很小的 run meta 区，显示 `runId`、artifact 目录和 editor session 状态

本任务不应再出现任何 visual result panel。

## 测试策略

### CLI 测试

重点验证：
- `runCli()` 在真实 editor-backed handler 下仍然遵守退出码与 artifact 契约
- `RunnerEvent` 的实时转发仍保持完整且有序
- editor command failure 能正确映射到 CLI 终态

候选文件：
- `packages/test-harness/src/cli/run.test.ts`
- `packages/test-harness/src/cli/artifacts.test.ts`

### Main 测试

重点验证：
- `CliRunSession` 生命周期
- editor session 的创建与复用
- CLI 运行事件向 workbench 订阅者的转发
- interrupt 路径是否正确

候选文件：
- `src/main/runtime-windows.test.ts`
- 新增 `src/main/*run-session*.test.ts`

### Renderer 测试

重点验证：
- workbench 依据订阅事件更新 UI，而不再依赖本地 runner callback
- interrupt 按钮是否走 run-control bridge
- artifact 路径和终态错误是否正确渲染

候选文件：
- `src/renderer/test-workbench.test.tsx`

### Editor driver 测试

重点验证：
- allowlist 命令能驱动真实 editor 操作
- 断言失败会返回结构化错误

候选文件：
- `src/renderer/*.test.ts`
- 必要时新增 `packages/test-harness/src/handlers/*.test.ts`

## 文档影响

实现落地后，以下文档需要同步调整语义：

- `MVP_BACKLOG.md`  
  将 `TASK-030` 从“截图 / diff 支持”改成“CLI 驱动的真实 editor 执行与 debug 同步”

- `docs/progress.md`  
  记录 synthetic visual 路径已撤回，当前重做方向改为 CLI 驱动真实 editor

- `packages/test-harness/README.md`  
  让 CLI 成为权威执行模型，并移除 visual-test 的旧表述

- `reports/task-summaries/TASK-030.md`  
  在实现完成后总结新的范围、证据和剩余缺口

- `docs/test-cases.md`  
  只有在用户可见运行流程变化时才更新手动验收步骤

## 验收标准

只有在以下条件全部满足时，`TASK-030` 才算完成：

- agent 能通过统一 CLI 入口启动真实 editor 场景
- CLI 会打开或复用真实的 Yulora editor 测试窗口，并执行所有 editor 内操作
- 至少一条默认场景通过真实 editor 行为闭环完成
- workbench 能实时镜像 CLI 的步骤流、每步结果、失败原因和终态
- `result.json` 和 `step-trace.json` 与 workbench 显示的内容保持一致
- 不重新引入截图、baseline 或 diff 逻辑

## 已锁定决策

这份 spec 现在明确锁定以下决策：

- `TASK-030` 不做 screenshot / baseline / diff
- CLI 是真实 editor 场景的唯一执行入口
- workbench 是观察与调试入口，而不是执行所有者
- 真实 editor 操作通过受限 allowlist 测试桥执行
- `TASK-029` 的退出码和 artifact 契约继续保留，并扩展到真实 editor 路径

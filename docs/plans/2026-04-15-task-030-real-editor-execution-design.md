# TASK-030 Real Editor Execution Design

## Scope

Task: `TASK-030`
Goal: 把 `TASK-030` 从已经撤回的 synthetic visual-test 方案，重定义为“真实打开 Yulora 编辑器测试窗口，按步骤执行真实操作，并在 workbench 同步展示步骤执行状态与结果”的能力。

In scope:
- workbench 触发 editor 场景时自动打开或复用真实的 editor 测试窗口
- 为 editor 场景增加受限的测试命令桥，使 workbench 能逐步驱动 editor renderer
- 让 `runScenario()` 的 step handler 消费真实 editor 执行结果，而不是 headless placeholder
- 保持 `TASK-028` 的 debug 面板模型，继续用 `RunnerEvent` 展示当前步骤、已完成步骤、失败原因与终态
- 让首批 editor 场景至少有一条能从“打开窗口”走到“真实操作 + 真实断言”

Out of scope:
- 截图、baseline、diff 图、像素比较
- 把 CLI 直接升级为真实 Electron 自动化入口
- 引入 Playwright / 外部驱动来远程控制 Electron 窗口
- 一次性交付大量新场景
- 扩展为通用跨进程自动化平台

## Current Context

`TASK-025` 已经提供独立的 test workbench 窗口和 `openEditorTestWindow()` 入口。  
`TASK-028` 已经把 `runScenario()` 的事件流折叠成 debug UI。  
`TASK-029` 当前仍是 headless CLI，使用占位 handler 和标准化结果目录。  
已撤回的 `TASK-030` 首版实现把“visual-test”做成了 synthetic gradient 对比，这与“真实打开编辑器并验证真实行为”的目标不一致，因此需要重做。

本轮重做的关键不是“如何截图”，而是“如何让 workbench 有限度地驱动 editor 窗口，并让结果重新流回 runner”。

## Approaches

### Approach A: Workbench-orchestrated editor driver over a narrow IPC bridge

workbench 仍然是场景执行入口。  
当场景 `surface === "editor"` 时，workbench 先请求 main 打开或复用 editor 测试窗口，再通过 preload 暴露的受限命令桥向 editor renderer 发送一步一步的测试命令，等待结构化结果返回。

优点：
- 最大化复用 `TASK-025` 的窗口模型和 `TASK-028` 的 debug 面板
- 真实执行发生在 editor renderer 内部，最接近真实用户行为
- main / preload / renderer 边界仍然清楚，只新增受限测试能力
- diff 相对聚焦，适合当前 backlog 节奏

缺点：
- 需要新增最小 IPC 协议与 editor test session 管理
- 初期只能覆盖显式建模过的操作和断言

### Approach B: Main-process automation coordinator

由 main 持有场景执行状态，workbench 和 editor 都只做命令与事件消费者。

优点：
- 后续更容易扩展为跨窗口统一调度
- CLI、workbench、editor 未来更容易统一入口

缺点：
- 对当前任务过重
- 会把 `TASK-030` 扩展成运行平台重构
- 测试与错误恢复复杂度明显上升

### Approach C: External automation first

直接引入外部自动化工具驱动 Electron 窗口，workbench 只显示结果。

优点：
- 理论上最接近最终自动化平台

缺点：
- 超出当前 MVP 固定技术栈和任务边界
- 会绕开现有 workbench / runner 架构
- 对现在的验收目标不必要

## Recommendation

采用 Approach A。

`TASK-030` 现在最需要的是把现有 test harness 从“能显示步骤状态”推进到“步骤状态来自真实 editor 行为”。  
Approach A 可以最小化变更范围，同时满足你的核心诉求：
- 运行测试时直接打开 Yulora 编辑器
- 按步骤真实操作
- debug 窗口实时显示当前步骤和每一步结果
- 完全不依赖截图

## Architecture

### 1. Workbench remains the orchestrator

workbench 继续作为唯一的手动测试入口：
- 选择场景
- 点击运行
- 展示当前步骤、事件流和终态

workbench 不直接操纵 DOM，也不自己重建场景结果。  
它只做三件事：
- 请求获得 editor test session
- 为每个 step 调用对应 handler
- 把 handler 结果交给 `runScenario()`，由 `RunnerEvent` 统一驱动 UI

### 2. Main process owns editor test sessions

main 新增一个很小的 session 管理职责：
- 打开 editor 测试窗口
- 记录哪个 editor 窗口属于当前测试会话
- 转发 workbench 发出的测试命令
- 把 editor renderer 返回的结构化结果回传给 workbench

这里不引入通用消息总线，只做 allowlist 式测试通道。

建议引入的概念：
- `EditorTestSessionId`
- `EditorTestCommand`
- `EditorTestCommandResult`

session 生命周期：
1. workbench 请求 `ensureEditorTestSession`
2. main 打开或复用 editor 窗口，并返回 `sessionId`
3. workbench 在场景运行期间复用这个 `sessionId`
4. editor 窗口关闭或崩溃时，main 让后续 step 失败，并返回明确错误

### 3. Preload exposes a narrow test bridge

preload 不能暴露不受限制 Node API，所以只暴露受限测试接口。

建议新增两组桥：

workbench 侧：
- `ensureEditorTestSession(): Promise<{ sessionId: string }>`
- `runEditorTestCommand(input): Promise<EditorTestCommandResult>`

editor 侧：
- `onEditorTestCommand(listener): () => void`
- `completeEditorTestCommand(result): void`

这样 workbench 只能发送白名单命令，editor 只能返回结构化结果，避免把任意 Electron 能力暴露到 renderer。

### 4. Editor renderer hosts the real driver

真实操作应该发生在 editor renderer，因为那里最接近真实界面状态。

建议新增一个 editor test driver 模块，职责只有两个：
- 把测试命令映射成真实 UI 操作
- 从真实 editor 状态中做断言并返回结果

例如：
- 打开 fixture
- 等待编辑器可用
- 输入文本
- 触发保存
- 校验当前文档路径、文本内容、dirty 状态

driver 不关心 scenario 编排；它只关心单个命令。

## Command Model

### Command Envelope

建议使用显式的命令枚举，而不是字符串自由发挥。

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

命令必须是白名单；本轮只支持首批场景所必需的最小集合。

### Result Envelope

所有命令返回统一结果：

```ts
type EditorTestCommandResult = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};
```

约束：
- `ok: true` 表示 step handler 正常返回
- `ok: false` 由 step handler 转换成抛错，进入 runner 的失败路径
- `message` 用于 debug 窗口直接显示失败原因
- `details` 只放调试辅助信息，不作为唯一事实来源

## Scenario and Handler Model

### Scenario metadata stays minimal

`TestScenario` 继续只描述元数据，不把执行细节塞回 metadata 模型。  
是否需要 editor session，直接由 `surface === "editor"` 推导，不新增额外布尔位。

### Replace placeholder handlers with editor-driven handlers

当前 `createHeadlessStepHandlers()` 只是占位。  
本轮新增一套 workbench 侧 editor handler 工厂，类似：
- `createEditorStepHandlers(scenario, sessionBridge)`

它负责把每个 step id 映射成一个真实命令调用。例如：
- `launch-dev-shell` -> `wait-for-editor-ready`
- `invoke-open-command` -> `open-fixture-file`
- `select-fixture` -> `assert-document-path` + `assert-editor-content`

关键点：
- handler 仍然是串行执行
- 每个 step 只做一件事
- 失败时抛出结构化错误，复用现有 runner 语义

### First scenario target

首批推荐把 `open-markdown-file-basic` 变成第一条真实 editor-driven 场景。

理由：
- 场景已经存在于默认 registry
- 它天然覆盖“打开 editor / 打开文件 / 断言内容”这条最基本闭环
- 不会把任务扩散到 autosave、IME、渲染等高风险领域

## Data Flow

1. 用户在 workbench 选择 `open-markdown-file-basic`
2. 点击 `Run Selected Scenario`
3. workbench 检查场景 `surface === "editor"`
4. workbench 调用 `ensureEditorTestSession()`
5. main 打开或复用 editor 测试窗口，返回 `sessionId`
6. workbench 构造 editor step handlers，并调用 `runScenario()`
7. 每个 step handler 通过 `runEditorTestCommand({ sessionId, command })` 请求 editor 执行真实操作
8. editor renderer 的 test driver 执行命令并返回结构化结果
9. handler 成功则返回，失败则抛错
10. `runScenario()` 发出 `step-start` / `step-end` / `scenario-end`
11. workbench 继续用现有 `DebugRunState` 折叠这些事件并刷新 UI

## Error Handling

需要明确四类错误：

### 1. Session establishment failure

workbench 无法打开或定位 editor 测试窗口时：
- 视为配置或环境错误
- 在首个 setup step 失败
- 错误信息直接出现在 debug 终态和步骤卡片

### 2. Command execution failure

editor driver 执行某条命令失败时：
- 返回 `ok: false`
- handler 抛出 `step` 错误
- runner 将当前 step 标记为 `failed`

### 3. Window closed mid-run

editor 窗口在执行过程中被用户关闭或异常退出时：
- 后续命令直接失败
- message 明确标记 “editor test window closed”
- scenario 终态为 `failed` 或 `interrupted`，取决于是否由外部显式终止

### 4. Step timeout

继续沿用 `runScenario()` 现有每步超时机制。  
如果 editor driver 没有及时响应，超时由 runner 统一裁决，而不是额外发明一套超时语义。

## UI Direction

workbench UI 不需要大改，只需要保持并强化已有 debug 能力：

- `Scenario Catalog`
  继续列出场景和场景摘要

- `Debug Stream`
  继续展示当前场景状态、当前步骤、终态错误和最近事件

- `Test Process`
  继续展示每一步的状态、耗时和错误信息

本轮不新增 visual panel，也不在 renderer 内绘制任何截图结果。  
如果需要提示真实 editor 窗口已启动，可以在 workbench hero 区或 run meta 中显示：
- editor session connected
- editor session lost

## Testing Strategy

TDD 目标不是一次性做大，而是围绕“真实 editor session 命令桥”逐步推进。

建议最少覆盖：

### Main / runtime tests

- editor 测试窗口的创建与复用逻辑
- session 失效时的错误返回
- 受限 IPC 通道只接受 allowlist 命令

候选文件：
- `src/main/runtime-windows.test.ts`
- `src/main/*.test.ts`

### Renderer workbench tests

- editor 场景运行时先建立 session，再进入 step 执行
- step 成功时 workbench 显示 running -> passed
- step 失败时 workbench 显示失败步骤和错误消息
- session 丢失时 workbench 显示明确诊断

候选文件：
- `src/renderer/test-workbench.test.tsx`

### Test harness tests

- editor handler 工厂把 step id 映射到正确命令
- 命令失败会被转换成 runner 可消费的 step 错误
- 不回退 `runScenario()` 现有串行、中断、超时语义

候选文件：
- `packages/test-harness/src/runner.test.ts`
- 如需要可新增 `packages/test-harness/src/handlers/*.test.ts`

## Documentation Impact

本轮设计成立后，需要同步文档语义：

- `MVP_BACKLOG.md`
  把 `TASK-030` 从“截图 / diff 支持”改成“真实 editor 场景执行与 debug 同步”

- `docs/progress.md`
  记录 synthetic 方案已撤回，当前重做方向改为真实 editor 驱动

- `reports/task-summaries/TASK-030.md`
  在实现完成后总结新的任务边界、验证结果和未做项

- `packages/test-harness/README.md`
  删除或弱化 visual-test 描述，改写为 editor-driven 场景执行说明

如本轮新增或调整了手动验收步骤，再更新 `docs/test-cases.md`。

## Acceptance

当以下条件同时满足时，`TASK-030` 才算完成：

- 从 workbench 运行 editor 场景会真实打开或复用 Yulora editor 测试窗口
- 至少一条默认场景通过真实 editor 操作完成，不再依赖 headless placeholder
- debug 窗口可持续显示当前步骤、步骤结果、失败原因和终态
- 不引入截图、baseline、diff 图相关逻辑
- 不破坏普通 editor 模式和既有 workbench 模式

## Open Decisions Resolved

这轮 spec 已经确定以下决策：

- `TASK-030` 移除截图 / baseline / diff
- “真实 visual-test” 在本项目中的定义，落为“真实 editor 场景执行与可观察调试”
- workbench 是执行入口，editor window 是被驱动对象
- main / preload / renderer 之间只增加受限测试桥，不暴露不受限制 Node API
- CLI 真实 Electron 驱动不在本轮范围

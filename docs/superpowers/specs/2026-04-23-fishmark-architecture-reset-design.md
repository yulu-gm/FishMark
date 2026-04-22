# FishMark 架构收敛重构设计

## Background

这一轮架构审查表明，FishMark 已经具备多标签工作区能力，但当前实现没有随着能力升级同步完成边界收敛。项目在三个层面出现了系统性偏移：

- 工作区和文档会话的业务真相仍然分裂在 `main` 与 `renderer`
- `renderer` 壳层组件承担了过多应用编排职责，导致核心流程与 UI 强耦合
- `main / preload / renderer / test / docs / themes` 对外描述的系统边界并不一致

这些问题不是单点代码味道，而是同一类架构漂移的不同表现。只做局部修补会继续保留双轨状态、错误 contract 和文档失真，因此本轮采用一次性的架构收敛重构，直接把系统拉回到当前产品能力对应的正确边界。

## Goals

- 让工作区与文档会话恢复到单一业务真相源
- 让 `renderer` 回到 presentation shell，而不是应用内核
- 让跨进程 contract 成为可审计、可测试、可演进的显式公共接口
- 让产品 bridge、测试 bridge、主题 contract、设计文档重新各归其位
- 实质关闭以下审查问题：
  - Workspace truth is still split
  - React shell owns application orchestration
  - Workspace open bridge is falsely typed
  - Stable product docs still describe the wrong system
  - Preload bridge is broader than the product contract
  - Theme examples depend on shell-private selectors

## Non-goals

- 不更换 Electron、React、TypeScript、CodeMirror 6、micromark、Vite、Vitest、Playwright 技术栈
- 不为过渡期保留双套状态模型、双套 bridge、兼容层或临时代码
- 不引入会话恢复、分屏编辑、预览标签、远程协作等新产品能力
- 不把 CodeMirror 编辑器或 DOM 输入逻辑迁移到 `main`
- 不以“维持历史错误行为兼容”为理由保留当前失真的 contract

## Current Architectural Violations

### 1. Workspace truth is still split

当前多标签工作区宣称 `main` 是工作区真相 owner，但实际可写业务状态仍同时存在于：

- `src/main/workspace-service.ts`
- `src/renderer/document-state.ts`
- `src/renderer/editor/App.tsx`

`save` IPC 仍然可以直接接收 renderer 传入的内容进行持久化，导致 `autosave`、`reload from disk`、`external change resolution`、`close confirmation` 并不一定读取同一份 canonical draft。

### 2. React shell owns application orchestration

`src/renderer/editor/App.tsx` 同时协调打开、保存、自动保存、工作区结构变化、外部文件冲突、主题运行时、设置同步、菜单路由、拖放流程和测试接线。结果是 presentation 与 application 边界缺失，核心语义只能通过巨型 UI 耦合集成测试证明。

### 3. Workspace open bridge is falsely typed

Renderer 和 preload 侧把打开工作区文件的返回值声明成成功快照，但 `main` 实际会返回错误结果。跨边界 contract 与真实运行时不一致，调用方被鼓励把失败路径误当成成功路径。

### 4. Stable product docs still describe the wrong system

稳定设计文档仍以单文档编辑器为基线，同时把尚未交付的 crash recovery 写成当前能力，和已经落地的 tabbed workspace 事实不一致。

### 5. Preload bridge is broader than the product contract

`window.fishmark` 仍暴露 editor-test、scenario-run、driver command 等测试能力，导致生产 bridge 被测试 runtime 反向污染。

### 6. Theme examples depend on shell-private selectors

官方示例主题仍直接依赖 `.workspace-header`、`.settings-shell`、`.app-titlebar` 等实现 selector，等价于把私有 DOM 结构升级成公共主题 API。

## Design Principles

- Markdown 文本仍然是唯一文档事实来源
- 业务真相只允许有一个 owner
- Presentation、application、domain、infrastructure 必须按依赖方向分层
- Public contract 必须显式、共享、可分支处理，不能靠隐式约定
- 测试能力不是产品能力的一部分
- 官方文档与官方示例必须描述当前真实系统，而不是历史快照

## Target Architecture

### Layering

目标依赖方向如下：

`renderer presentation -> application -> domain <- infrastructure`

同时由 `shared-contracts` 作为跨 `main / preload / renderer / test` 的唯一共享边界定义。

### Responsibility split

#### 1. `workspace-domain`

负责表达工作区和文档会话的核心业务模型，包括：

- 工作区结构
- 标签会话状态
- 脏状态与保存状态
- 外部文件状态
- 关闭确认和重载判断所需的业务信息

这里定义什么是系统真相，但不直接处理 Electron、IPC、CodeMirror 或 DOM。

#### 2. `workspace-application`

负责所有业务命令和用例编排，包括：

- `OpenPath`
- `CreateUntitledTab`
- `ActivateTab`
- `UpdateDraft`
- `SaveTab`
- `SaveTabAs`
- `ReloadTabFromDisk`
- `ResolveExternalChange`
- `CloseTab`
- `CloseWindow`
- `MoveTab`
- `DetachTab`

它读取 domain state，调用 infrastructure 端口，并产出供 renderer 使用的只读 projection。

#### 3. `platform-infrastructure`

负责与平台和文件系统集成，包括：

- Electron window 生命周期
- IPC handler 注册
- 文件读写
- 文件监听
- 打开对话框与保存对话框
- 偏好设置持久化
- 主题资源加载

这一层不拥有业务真相，只为 application 提供能力。

#### 4. `editor-infrastructure`

负责把 CodeMirror 等编辑器能力适配给 presentation 层，包括：

- 文本输入桥接
- 选区与滚动视图快照采集
- 编辑器挂载和销毁
- 视图恢复

它不是文档业务真相 owner。

#### 5. `renderer-presentation`

负责窗口壳层与 UI 组合，包括：

- `WorkspaceShell`
- `TabStrip`
- `StatusBar`
- `ExternalConflictBanner`
- `SettingsDrawer`
- `ThemeSurfaceLayer`
- `CodeEditorView`

这一层只消费 projection 和 command，不自行编排业务流程。

#### 6. `shared-contracts`

负责定义所有跨边界类型，包括：

- IPC request/response
- discriminated union result
- workspace snapshot / projection
- settings projection
- theme metadata projection
- 公共 error shape

`main`、`preload`、`renderer` 和 test runtime 必须共同依赖这份 contract，而不是各自声明近似版本。

## Program Structure

本轮重构拆为四个顺序执行的 program。它们属于同一轮 architecture reset，但每个 program 都有独立完成标准。

### Program A: Workspace Core Reset

目标：关闭业务真相分裂，让工作区与文档会话重新拥有唯一 owner。

核心设计：

- 业务可写的 workspace/document state 只存在于 `main` runtime
- renderer 不再维护 `draftContent / lastSavedContent / isDirty / saveState` 的可漂移业务副本
- 所有保存、自动保存、重载、外部文件冲突判断、关闭确认都从 canonical session state 读取
- renderer 的编辑输入通过 `UpdateDraft(tabId, content, selection?, viewport?)` 一类 command 进入 application 层
- `main` 输出只读 projection 给 renderer，用于渲染 tab strip、status、冲突提示和活动文档状态

补充要求：

- 可以调整草稿同步时机，但必须以单一 owner 为前提
- 不保留“结构变更前临时 flush + 平时 renderer 自治”的混合模型

### Program B: Renderer Shell Decomposition

目标：关闭 UI 壳层越权编排，让 `App.tsx` 回到装配与展示角色。

核心设计：

- 把应用编排迁移到 renderer 侧轻量 controller 与 application command 接口
- 将现有巨型 `App.tsx` 切分为：
  - app service access
  - controller hooks
  - presentation components
  - editor host
- 菜单、快捷键、按钮、拖放、测试驱动统一走同一组 command/usecase

推荐的 controller 拆分：

- `useWorkspaceController`
- `useSaveController`
- `useExternalConflictController`
- `useThemeController`
- `useSettingsController`
- `useShortcutController`

明确禁止：

- 只是把 `App.tsx` 中的大函数移动到多个 hook 文件，但依赖方向和职责不变
- 继续让 UI 事件处理器直接操作业务状态或 IPC 细节

### Program C: Contract Hardening

目标：关闭 contract 失真与 bridge 污染。

核心设计：

- 所有跨边界 API 都从 `shared-contracts` 导出
- workspace 打开、保存、重载等关键流程全部改为显式 discriminated union result
- `preload` 只实现最薄 bridge，不再自定义业务 contract
- `window.fishmark` 只保留产品运行时需要的能力
- editor-test、scenario-run、driver command 迁移到独立 test bridge 或测试窗口专用 preload

contract 规则：

- 成功、取消、错误必须是显式分支
- 调用方必须穷尽处理结果分支
- 测试必须覆盖关键 error path，而不是默认 happy path

### Program D: Public Truth Cleanup

目标：关闭文档与主题 contract 漂移，让官方公开真相与实现一致。

核心设计：

- `docs/design.md` 重写为当前真实系统基线
- crash recovery 从当前能力描述中移除，转入 deferred scope 或 future work
- theme contract 只暴露 semantic surface、token、role、state class
- 官方主题示例全部改为使用公共 theme contract，不再依赖壳层私有 selector
- 设计文档、guide、fixture、示例、progress/decision 记录同步收口

## Data Flow

### Workspace truth flow

1. 用户在 `CodeEditorView` 中输入
2. editor adapter 将文本和必要视图状态发送给 renderer controller
3. controller 调用 `workspace-application` 的 `UpdateDraft`
4. application 更新 `main` 中的 canonical tab session
5. application 生成新的只读 projection
6. renderer presentation 基于 projection 刷新 UI

### Save flow

1. 用户通过菜单、快捷键、按钮或 autosave 触发保存
2. 入口统一调用 `SaveTab(tabId)` 或 `SaveActiveTab()`
3. application 从 canonical tab session 读取最新 draft
4. infrastructure 执行文件写入
5. application 更新 `lastSavedContent`、`isDirty`、`saveState`
6. renderer 消费新的 projection 展示结果

### External change flow

1. infrastructure 监听到磁盘文件变化
2. application 根据 canonical session 判断是否存在未保存草稿冲突
3. application 生成显式 external change state
4. renderer 只负责显示冲突 UI，并把用户选择回传为 command
5. application 执行保留内存版本、从磁盘重载或其他明确策略

## Public Contract Design

### Product bridge

`window.fishmark` 只包含产品运行时调用所需 API，例如：

- workspace commands
- snapshot/projection subscriptions
- settings commands
- theme commands
- file dialog requests

它不再包含测试驱动能力。

### Test bridge

测试能力迁移到独立 contract，具体实现可以是：

- `window.fishmarkTest`
- 或测试窗口专用 preload bridge

无论具体命名如何，都必须满足：

- 仅在测试 runtime 可见
- 不进入产品 bridge 类型定义
- 不作为产品代码运行时依赖

### Result shapes

关键跨边界结果统一使用 discriminated union，例如：

- `OpenWorkspaceFileResult`
- `SaveTabResult`
- `ReloadTabResult`
- `CloseTabResult`

统一要求：

- `kind: 'success' | 'cancelled' | 'error'`
- `success` 分支携带明确 projection/snapshot
- `error` 分支携带稳定错误结构，供 UI 和测试处理

## Theme Contract Reset

主题系统的公共 contract 收敛为两类内容：

- semantic tokens
- semantic surfaces / state roles

主题可以依赖：

- token 变量
- 公开的 surface role
- 公开的 state class

主题不能依赖：

- 壳层 DOM 层级
- 私有布局容器 class
- 偶然出现的实现 selector

官方示例主题必须成为正确 contract 的示范，而不是现有实现细节的消费方。

## User-visible Behavior Adjustments

允许调整：

- 草稿同步时机
- 保存、重载、外部冲突提示的交互顺序和文案
- 菜单、快捷键、拖放在内部的命令接入路径
- 主题 surface 命名与公开 contract 组织方式

不允许退化：

- renderer 重新成为业务真相 owner
- 为兼容旧实现保留双轨状态或双套 bridge
- 继续通过 undocumented selector 维持主题兼容
- 设计文档继续落后于真实系统

## Sequencing

推荐执行顺序如下：

1. Program A: Workspace Core Reset
2. Program C: Contract Hardening
3. Program B: Renderer Shell Decomposition
4. Program D: Public Truth Cleanup

原因：

- 必须先收敛 truth owner，否则后续所有拆分都建立在错误前提上
- 必须在拆壳层前收紧 contract，否则会把错误边界传播到新结构
- 文档和主题 contract 清理必须建立在新的真实边界已经稳定之后

## Milestones and Acceptance

### Milestone 1: Workspace Truth Convergence

验收标准：

- 业务可写的 workspace/document state 只在一个 runtime owner 中存在
- `save`、`autosave`、`reload from disk`、`external change resolution`、`close confirmation` 全部读取同一份 canonical draft
- renderer 不再维护可独立漂移的业务副本
- 关键保存与关闭语义具备独立 application/service 级测试

### Milestone 2: Contract Reset

验收标准：

- 所有跨边界 API 都来自 `shared-contracts`
- 打开、保存、重载等关键流程使用显式 discriminated union result
- `window.fishmark` 仅保留 product contract
- 测试 bridge 独立存在
- renderer 中不存在把失败 payload 当成功 snapshot 使用的路径

### Milestone 3: Shell Decomposition

验收标准：

- `App.tsx` 只承担装配、布局和少量 view glue
- 核心业务流程迁移到 application/controller 层
- 所有用户动作入口统一落到 command/usecase
- 测试分层为 application tests、controller tests、presentation tests 和少量关键场景集成测试

### Milestone 4: Public Truth Alignment

验收标准：

- `docs/design.md` 与当前真实系统一致
- theme guide、示例主题和 fixture 仅依赖公共 theme contract
- 稳定文档、示例和进度记录之间不再互相冲突
- 仅阅读官方文档和示例也能得到与实现一致的系统认知

## Risks

### 1. 输入同步与视图恢复风险

如果 canonical draft 更新模型设计不稳，容易出现 IPC 压力过大、输入抖动、选区恢复异常。解决方式不是回退到双写状态，而是把 projection 更新粒度和 editor adapter 职责设计清楚。

### 2. Contract 收紧后的连锁修复风险

一旦 result shape 变成显式 union，现有调用方和测试会暴露大量隐含假设。这里应接受“先暴露，再修复”的节奏，而不是为了快速恢复绿灯继续模糊 contract。

### 3. 伪分层风险

如果只是把 `App.tsx` 的逻辑搬到多个 hook 文件，系统仍然会维持相同的耦合问题。本轮必须按依赖方向拆层，而不是按文件数量拆分。

### 4. 文档滞后复发风险

如果 Program D 不被视为正式验收项，仓库会再次出现实现已经变化但文档和示例没有跟上的情况。因此文档与示例同步是本轮 completion criteria 的一部分。

## Verification Strategy

### Architecture verification

- 确认业务可写状态是否只存在于单一 owner
- 确认 `renderer` 是否仍直接编排核心业务流程
- 确认 `preload` 是否仍声明自造 contract
- 确认测试能力是否仍混入产品 bridge
- 确认主题示例是否仍依赖私有 selector

### Quality gates

- `build` 通过
- `lint` 通过
- `typecheck` 通过
- 受影响测试通过
- 与本设计相关的文档同步完成

### Test expectations

- application/service tests 验证保存、自动保存、关闭确认、外部冲突、工作区命令语义
- controller tests 验证用户动作如何映射到 command/usecase
- presentation tests 验证 projection 到 UI 的绑定
- 少量跨层集成测试保留关键工作流，而不是继续把全部语义堆进巨型 UI 测试

## Implementation Boundary

这份 spec 只定义本轮架构收敛重构的目标边界、程序拆分、依赖方向、风险与验收标准。后续需要基于它单独产出 implementation plan，再进入编码执行。

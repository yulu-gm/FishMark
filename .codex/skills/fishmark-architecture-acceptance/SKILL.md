---
name: fishmark-architecture-acceptance
description: 用于在 FishMark 中审查已完成的新功能、bugfix 或重构；当需要基于理想 Markdown 编辑器范式，而不是仓库当前实现，对本轮 diff 及其受影响模块做代码结构、文档、主题样式与测试验收时使用。
---

# FishMark 架构验收

## 职责边界

只做结构与规范验收：
- 读本轮 diff
- 扩展读取受影响模块的周边结构
- 按理想 Markdown 编辑器范式做 review
- 输出 findings 和 `PASS / FAIL`

不写实现代码，不替改动找借口，不把“仓库原来就这样”当作豁免理由。

## 核心原则

- 以“Markdown 编辑器应该怎么组织”作为准绳，不以当前实现作为规范来源。
- 默认审查范围是：`本轮 diff + 受影响模块的周边结构`。
- 历史问题只有在本轮改动**引入、扩散、加深、复用**，或本轮直接穿过该边界时才列为 finding；不要无关发散到整个仓库体检。
- 先列 findings，再给结论。
- 结论只能写：
  - `PASS`
  - `FAIL`

## 读取顺序

### 1. 先识别审查对象

优先级：
1. 用户明确给出的 commit / branch / PR / diff
2. 当前 staged + unstaged diff
3. 如果没有可审查改动，明确说缺少目标，不要假装完成验收

### 2. 读取通用架构基线

始终先读：
- `references/markdown-editor-architecture.md`

### 3. 按改动类型补读对应规则

如果改动涉及以下内容，再读对应 reference：

- 文档、task 状态、对外说明、公开 contract 说明：
  - `references/documentation-rules.md`
- 主题包、CSS、tokens、shader、主题 runtime、主题偏好：
  - `references/theme-style-rules.md`
  - 如需 repo 内主题包结构细则，再补读 `$fishmark-theme-authoring`
- parser、editor-core、main/preload/shared contract、renderer shell 行为、保存链路、测试 harness：
  - `references/testing-verification.md`

如果用户要求的是 FishMark task 的正式收尾、项目记录同步和最终人工验收步骤，额外转用 `$fishmark-task-acceptance`；本 skill 只负责结构验收，不负责项目状态收尾。

## 审查流程

### 1. 先归类改动

至少回答：
- 改动属于哪个子系统
- 哪些文件只是调用面，哪些文件是真正的边界面
- 哪些相邻模块会被这次改动影响

### 2. 再看结构，不先看实现细节

先判断以下问题，再进入代码细节：
- 这次改动把职责放在了正确层级吗
- 数据真相是否仍然只有一个 owner
- side effects 是否仍然有明确边界
- user action 是否收敛到了命令 / 用例 / 明确入口，而不是散落在 UI 事件里

### 3. 用分域规则做 review

按已加载的 references 检查：
- 代码结构
- 文档同步
- 主题样式边界
- 测试与验证证据

### 4. 只输出高信号 findings

每条 finding 都应包含：
- 严重级别：`P0` / `P1` / `P2`
- 具体文件或边界
- 为什么违背了理想范式
- 为什么这会对 Markdown 编辑器造成真实风险

不要输出“可以更优雅”“建议以后再说”这类低信号评论。

### 5. 判 `PASS / FAIL`

判定规则：
- 存在任一 `P0` 或 `P1`：`FAIL`
- 缺少本轮必须同步的文档或测试：`FAIL`
- 没有 blocking findings：`PASS`

## 严重级别定义

- `P0`
  - 数据丢失风险
  - Markdown 真相被破坏
  - main / preload / renderer 安全边界被打穿
  - 明显会导致错误保存、错误覆盖、错误同步
- `P1`
  - 职责层级错误
  - 双重状态真相
  - UI 组件承载业务编排
  - 主题越权控制 app-owned 布局
  - 用户可见行为变化却没有对应测试或文档
- `P2`
  - 模块边界继续变脏
  - 公共 API 不清晰
  - magic string / util 垃圾场 / import 穿层
  - 这次改动没有立刻造成错误，但明显让后续维护变差

## 输出格式

按这个顺序输出：

```md
Findings:
- [P1] ...
- [P2] ...

Open questions:
- ...

Result: PASS / FAIL

Why:
- ...
```

规则：
- 如果没有 findings，明确写“未发现阻断性结构问题”
- 如果有 open questions，要说明缺了什么证据
- summary 必须短，不要把回答写成 changelog

## 结束条件

满足以下全部条件才算完成：
- 已明确审查对象
- 已读取通用架构基线
- 已按改动类型补读对应规则
- findings 已按严重级别列出
- 已给出 `PASS / FAIL`


---
name: yulora-task-intake
description: 用于在 Yulora（本地 Markdown 编辑器项目）开启或继续一个 backlog task 时，做一次性的接单、定界与分派。触发场景包括：用户说"开始 TASK-xxx / 继续 TASK-xxx / 接一个新 task / 帮我看看下个 task 该做什么 / 这个需求该怎么落"，或者在 Yulora 仓库下提出还没界定范围的实现需求。当用户已经在写代码或要跑验证时，不要用这个 skill，分别走 $yulora-task-execution 或 $yulora-task-acceptance。
---

# Yulora 任务接单

## 这个 skill 的职责边界

只做三件事：
1. 重建一次完整的项目上下文
2. 把这一轮 task 的边界（范围、落点、风险、验收）说清楚
3. 把工作分派给执行或验收 skill

不写实现代码，不跑门禁，不出最终总结。

`$yulora-task-execution` 和 `$yulora-task-acceptance` 这类写法的语义见
[references/docs-map.md](references/docs-map.md) 末尾的 "$skill 调用语义" 一节 ——
是真的去调那个 skill，不是口头交班。

## 接单流程

### 1. 读上下文（按文档地图）

必读 / 条件读 / 区域读三层清单见
[references/docs-map.md](references/docs-map.md) 的"核心文档 / 条件文档 / 区域文档"。
按 task 的领域裁剪条件文档和区域文档，不要无脑全读。

项目硬约束（技术栈、架构隔离、P0 UX 项、完成定义等）以
[`AGENTS.md`](../../../AGENTS.md) 为唯一事实源；本 skill 不重复列写，
避免出现两份漂移的规则。

### 2. 把范围说清楚

用下面的模板把这一轮要做的事写明白。模板字段定义见 docs-map.md 的
"新 task 最好提供的信息"。

```md
Task: TASK-xxx 或新提案
Goal: 这一轮要完整交付的结果
In scope: ...
Out of scope: ...
Landing area: 预计改的文件 / 模块 / 层
Acceptance: 满足什么算 PASS（对照 MVP_BACKLOG.md + docs/acceptance.md）
Verification: 按 docs-map.md 的"验收门禁分级"挑命令
Risks: 是否触及 IME / 光标 / undo-redo / autosave / round-trip / 跨平台
Doc updates: 预计要更新哪些设计、backlog、进度、决策、测试、总结文档
Next skill: $yulora-task-execution 或 $yulora-task-acceptance
```

默认目标是单轮完整交付一个 task。只有当 backlog 里的 task 明显过大（落点超过
2-3 个模块、风险面交叉、或一次很难写完最小验证）时，才回到
`MVP_BACKLOG.md` 把它拆成更小的完整 task 再继续。

### 3. 落地 handoff 文件（必须）

把第 2 步的模板写到：

```
docs/plans/<YYYY-MM-DD>-<task>-intake.md
```

`<YYYY-MM-DD>` 用今天的本地日期，`<task>` 用 backlog ID 或简短 slug。
这一步不能省 —— 后续如果跨会话进入执行或验收阶段，
`$yulora-task-execution` / `$yulora-task-acceptance` 会优先读这个文件，
找不到就只能重新全量读文档，浪费时间且容易跑偏。

如果用户只是在聊"下个 task 该做什么"还没决定要做，可以先在会话里给出
模板草稿，确认后再落盘。

### 4. 分派下一步

按阶段切到对应 skill：

- 要开始实现 → `$yulora-task-execution`
- 实现已完成、需要跑门禁和收尾 → `$yulora-task-acceptance`

不要让一个 skill 同时承担接单 + 实现 + 最终验收。

## 输出要求

会话里给用户的最终输出至少包含：

- handoff 文件路径
- Task / Goal / In scope / Out of scope
- Landing area
- Verification（已经按门禁分级裁剪过的命令清单）
- Next skill

人工验收步骤本阶段不写，留给 `$yulora-task-acceptance`。

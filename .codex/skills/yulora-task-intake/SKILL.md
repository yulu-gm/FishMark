---
name: yulora-task-intake
description: 用于开始一个 Yulora task 时做接单、定界和分派。适用于新任务、继续 backlog task、确认执行前该读哪些项目文档、或判断下一步应该进入任务执行还是任务验收阶段。
---

# Yulora 任务接单

## Overview

这个 skill 只负责接单、定界和分派，不负责主要实现，也不负责最终验收。它的目标是完整重建一次任务上下文，把任务边界说清楚，然后把工作交给 `$yulora-task-execution` 或 `$yulora-task-acceptance`。

具体文档清单和输入模板见 [references/docs-map.md](references/docs-map.md)。

## 接单流程

### 1. 先完整读取项目上下文

至少读取：
- `AGENTS.md`
- `docs/design.md`
- `docs/acceptance.md`
- `MVP_BACKLOG.md`
- `docs/agent-runbook.md`
- `docs/test-cases.md`

按需补读：
- `docs/progress.md`
- `docs/decision-log.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-xxx.md`
- 相关设计文档、计划文档和边界 README

`$yulora-task-intake` 是默认的“全量上下文重建”入口。后续如果接着进入 `$yulora-task-execution` 或 `$yulora-task-acceptance`，默认复用这里已经建立的上下文，不要再全量重复读取。

### 2. 把任务范围说清楚

明确这些信息：
- 这轮要处理哪个 `TASK`
- 目标是什么
- 明确 in-scope / out-of-scope
- 主要改动会落在哪些文件或模块
- 关键风险是什么
- 最终验收需要哪些命令和人工检查

默认目标是完整完成一个 task。只有在 backlog 里的 task 明显过大时，才先回到 `MVP_BACKLOG.md` 拆成更小的完整 task。

需要重述任务时，用这个模板：

```md
Task: TASK-xxx
Goal: 这轮要完整交付什么
In scope: ...
Out of scope: ...
Primary files/modules: ...
Acceptance: 满足什么算 PASS
Verification: npm run lint, npm run typecheck, npm run build, ...
Manual acceptance: ...
Next skill: $yulora-task-execution / $yulora-task-acceptance
```

### 3. 决定下一步进入哪个 skill

按阶段分派：
- 需要开始实现时：使用 `$yulora-task-execution`
  说明：默认复用当前会话上下文，只补读实现阶段新增需要的文档
- 已经实现完，需要跑门禁、更新记录、输出总结时：使用 `$yulora-task-acceptance`
  说明：默认复用当前会话上下文，只补读验收阶段新增需要的文档

不要让一个 skill 同时承担接单、实现和最终验收三种职责。

## 输出要求

接单阶段的输出至少要包含：
- Task
- Goal
- In scope
- Out of scope
- Primary files/modules
- Verification
- Manual acceptance
- Next skill

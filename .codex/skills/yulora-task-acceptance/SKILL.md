---
name: yulora-task-acceptance
description: 用于对已经实现完成的 Yulora task 做验收、收尾和对外总结。适用于跑质量门禁、判断 PASS 或 FAIL、更新项目记录、或在输出任务总结时明确告诉用户怎么做人工验收。
---

# Yulora 任务验收

## Overview

这个 skill 只负责验收和收尾，不负责主要实现。它必须基于新鲜验证证据做 PASS / FAIL 判断，并在最终总结里明确写出人工验收步骤。默认复用同一会话里前面阶段已经建立的上下文，只补读验收阶段新增需要的文档。

## 验收流程

### 1. 先判断是复用上下文还是单独调用

如果当前会话刚经过 `$yulora-task-intake` 或 `$yulora-task-execution`：
- 不要全量重复读取核心文档
- 先确认 task 范围、实现结果和验证目标已经明确
- 只补读验收与收尾必须新增的文档

如果这是一次单独调用，前面没有经过接单或执行阶段：
- 先执行一次完整上下文重建
- 把自己当成验收阶段的直接入口使用

### 2. 差量补读验收上下文

单独调用时至少读取：
- `AGENTS.md`
- `docs/acceptance.md`
- `docs/test-cases.md`
- `docs/test-report.md`
- `docs/decision-log.md`
- `docs/progress.md`
- `MVP_BACKLOG.md`

按需补读：
- `docs/design.md`
- `reports/task-summaries/TASK-xxx.md`
- 相关设计文档和实现计划
- 代码落点对应的 README

如果已经经过前一阶段，优先只补读：
- `docs/test-report.md`
- `docs/decision-log.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-xxx.md`
- `docs/test-cases.md`
- 相关实现计划与代码落点 README

### 3. 必须跑新鲜验证

至少确认这些门禁：
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

如果 task 只影响局部模块，也要补充最相关的专项验证。

不能用“应该没问题”“之前跑过”代替本轮证据。

### 4. 根据项目规则判断 PASS / FAIL

必须同时对照：
- `MVP_BACKLOG.md` 里的 task 目标、交付物和验收语句
- `docs/acceptance.md` 的产品基线
- `docs/test-cases.md` 的相关场景

结论只能写：
- PASS
- FAIL

不要写模糊结论。

### 5. 更新项目记录

每次验收后至少更新：
- `docs/test-report.md`
- `reports/task-summaries/`

按需更新：
- `docs/decision-log.md`
- `docs/progress.md`
- `docs/design.md`
- `docs/test-cases.md`
- `MVP_BACKLOG.md`

### 6. 输出最终总结时必须写人工验收

最终对用户的总结至少包含：
- 做了什么
- 验证结果
- 是否 PASS / FAIL
- 剩余风险或未覆盖项
- **人工验收步骤**

人工验收步骤不能省略。

如果本轮只是文档或 skill 变更，也要明确写：
- 人工验收查看哪些文件
- 需要确认哪些文字或规则已经生效

## 总结模板

```md
结果：PASS / FAIL

完成内容：
- ...

验证：
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

人工验收：
1. ...
2. ...

剩余风险：
- ...
```

## 结束条件

只有在验证证据完整、项目记录已更新、并且最终总结已经明确给出人工验收步骤之后，才可以报告任务结束。

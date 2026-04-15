---
name: yulora-task-execution
description: 用于执行已经定界完成的 Yulora task。适用于开始实现 backlog task、继续编码、补测试、补文档落地、或在 Yulora 项目中推进一个已明确范围的完整 task。
---

# Yulora 任务执行

## Overview

这个 skill 只负责执行任务，不负责最终验收结论和对外收尾总结。任务默认目标是单轮完整完成一个 task；如果 backlog 里的 task 过大，就先回到 `MVP_BACKLOG.md` 拆成更小的完整 task，再继续实现。默认复用同一会话里由 `$yulora-task-intake` 已经建立的上下文，只补读实现阶段新增需要的文档。

## 执行流程

### 1. 先判断是复用上下文还是单独调用

如果当前会话刚经过 `$yulora-task-intake`：
- 不要全量重复读取核心文档
- 先确认前一阶段已经明确了 `TASK`、in-scope、out-of-scope、落点和验证要求
- 只补读这轮实现新增需要的文档

如果这是一次单独调用，前面没有经过 `$yulora-task-intake`：
- 先执行一次完整上下文重建
- 把自己当成实现阶段的直接入口使用

### 2. 差量补读实现所需文档

单独调用时至少读取：
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
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的相关文档
- 代码落点对应的 README

如果已经经过 `$yulora-task-intake`，优先只补读：
- `docs/decision-log.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-xxx.md`
- 相关设计、计划和代码落点 README

### 3. 开始前先把任务说清楚

开始实现前，明确这些信息：
- 这轮要完整完成哪个 `TASK`
- 这轮明确不做什么
- 预计会修改哪些文件、模块、层级
- 哪些验证命令最终必须通过
- 哪些风险最敏感：IME、光标、undo/redo、autosave、round-trip、跨平台

如果 task 还不够小，先回到 `MVP_BACKLOG.md` 拆分，不要默认只做一半。

### 4. 在 Yulora 约束内实现

始终遵守：
- 一次只做一个 task
- 保持 diff 聚焦且可回退
- 不要改动无关文件
- 优先小模块和显式接口
- 严格分离 `main`、`preload`、`renderer`
- 不要向 `renderer` 暴露不受限制的 Node API
- 不要未经批准替换固定 MVP 技术栈
- 不要在保存时自动重排整个 Markdown 文档

### 5. 为验收阶段留好输入

执行完成后，不要直接宣布“任务完成”。先整理好这些信息，交给 `$yulora-task-acceptance`：
- 本轮改了什么
- 改动落在哪些文件
- 跑哪些命令最能证明结果
- 哪些人工验收步骤最能验证行为
- 还剩哪些限制、风险或未做项

## 结束条件

只有在实现已经落地、必要测试已补、并且可以把结果交给 `$yulora-task-acceptance` 继续验收时，才结束这个 skill 的工作。

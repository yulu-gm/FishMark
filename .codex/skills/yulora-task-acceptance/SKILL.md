---
name: yulora-task-acceptance
description: 用于在 Yulora（本地 Markdown 编辑器项目）对已经实现完成的 task 做验收、收尾和对外总结。触发场景包括：用户说"跑一下门禁 / 这个能 PASS 吗 / 帮我写下 task 总结 / 收尾这个 task / 更新 test-report 和 task-summaries"，或者代码已落地需要判 PASS/FAIL 并给出人工验收步骤。如果 task 还在写，用 $yulora-task-execution；如果范围都还没界定，用 $yulora-task-intake。
---

# Yulora 任务验收

## 这个 skill 的职责边界

只做四件事：
1. 跑新鲜验证证据
2. 对照 backlog + acceptance 判 PASS / FAIL
3. 更新项目记录（test-report、task-summaries 等）
4. 输出最终总结，**必须含人工验收步骤**

不写实现代码，不补主体功能。如果验收过程中发现需要改实现，
回到 `$yulora-task-execution`。

`$skill` 的调用语义见
[../yulora-task-intake/references/docs-map.md](../yulora-task-intake/references/docs-map.md)
末尾。

## 验收流程

### 1. 优先读 handoff 文件

启动时先看 `docs/plans/` 下有没有这一轮的 handoff 文件
（命名约定见 docs-map.md 的 "Handoff 文件约定"）：

- `<YYYY-MM-DD>-<task>-intake.md` —— 范围、验收标准
- `<YYYY-MM-DD>-<task>-handoff.md` —— 改了什么、推荐验证命令、人工验收草稿

两个都在：以它们为权威输入，只补读
[../yulora-task-intake/references/docs-map.md](../yulora-task-intake/references/docs-map.md)
里"完成与更新矩阵"涉及的文档（要更新就要先读现状）。

只有 intake 没有 execution：说明实现可能不完整，先与用户确认是不是该退回
`$yulora-task-execution`。

两个都没有：单独调用模式。按 docs-map.md 的"核心文档"+"完成与更新矩阵"
做一次完整重建。

### 2. 跑新鲜验证（按门禁分级）

按 docs-map.md 的"验收门禁分级"挑命令。**不要一律全跑**，也不要省略：

- 代码变更 → lint + typecheck + test + build 全套
- 仅文档 → 链接和路径手工抽查、相关 markdown 渲染
- 仅 skill / AGENTS → 引用文件存在性检查 + 关键规则 grep 复核 + 人工 diff
- 混合 → 取重心，再补另一类的关键项，并在总结里说明取舍

重要：不能用"应该没问题 / 之前跑过"代替本轮证据。命令必须本轮真的跑过，
输出贴在最终总结里或可追溯。

### 3. 判 PASS / FAIL

必须同时对照：

- `MVP_BACKLOG.md` 里 task 专属验收
- `docs/acceptance.md` 的产品基线
- `docs/test-cases.md` 的相关场景

结论只能写 `PASS` 或 `FAIL`，不要写"基本通过 / 大体 OK"。

### 4. 更新项目记录

至少更新（"完成与更新矩阵"的常驻项）：

- `docs/test-report.md`
- `reports/task-summaries/TASK-xxx.md`

按变更影响补充更新（条件项）：

- `docs/decision-log.md`
- `docs/progress.md`
- `docs/design.md`
- `docs/test-cases.md`
- `MVP_BACKLOG.md`

判断标准见 docs-map.md 的"完成与更新矩阵"。

如果这轮验收对应的 task 已经完成，必须检查 `MVP_BACKLOG.md` 里的执行切片 checkbox 是否已经同步；没同步就要补上，
不能只给 PASS/FAIL 和 task summary。

### 5. 输出最终总结（必须含人工验收）

模板：

```md
Task: TASK-xxx
结果：PASS / FAIL

完成内容：
- ...

验证：
- 命令 1（已运行，结果 ...）
- 命令 2 ...

人工验收：
1. ...
2. ...

剩余风险或未覆盖项：
- ...
```

**人工验收步骤不能省略**，纯文档或纯 skill 变更也要写 ——
那种情况下要明确告诉用户：看哪些文件、确认哪些文字或规则已经生效。

## 结束条件

满足以下全部条件才报告任务结束：

- 验证证据完整且来自本轮
- PASS / FAIL 已写明
- 项目记录已按矩阵更新
- 最终总结已含人工验收步骤

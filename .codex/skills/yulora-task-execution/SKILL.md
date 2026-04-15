---
name: yulora-task-execution
description: 用于在 Yulora（本地 Markdown 编辑器项目）执行已经定界完成的 backlog task。触发场景包括：用户说"开始写 / 实现 TASK-xxx / 继续昨天那个 task / 把这个改一下 / 加上这个测试"，或者范围已经明确、可以直接动代码或动文档。如果 task 范围还没界定，先用 $yulora-task-intake；如果实现已经完成只剩跑门禁和收尾，用 $yulora-task-acceptance。
---

# Yulora 任务执行

## 这个 skill 的职责边界

只负责实现：写代码、改文档、补测试、按计划落地。

不负责最终验收结论、不负责对外总结、不负责人工验收步骤草拟。
跑命令是为了"开发自检"，不是产出 PASS/FAIL 结论 ——
那是 `$yulora-task-acceptance` 的事。

`$skill` 的调用语义见
[../yulora-task-intake/references/docs-map.md](../yulora-task-intake/references/docs-map.md)
末尾。

## 执行流程

### 1. 优先读 intake handoff，而不是全量重建

启动时先看 `docs/plans/` 下有没有 `<YYYY-MM-DD>-<task>-intake.md`
（命名约定见 docs-map.md 的 "Handoff 文件约定"）。

- 找到了：以它为权威范围说明，只补读这一轮实现新增需要的文档（通常是相关
  设计 / 计划 / 代码落点 README / `docs/decision-log.md`）。不要重复读核心文档。
- 没找到：说明这是一次单独调用或 intake 没落盘。按
  [../yulora-task-intake/references/docs-map.md](../yulora-task-intake/references/docs-map.md)
  的"核心文档"做一次完整重建，然后**自己补一份简短的范围说明**写到
  `docs/plans/<YYYY-MM-DD>-<task>-intake.md`，避免后续阶段又要重来。

### 2. 在 Yulora 约束内实现

项目硬约束（技术栈、main/preload/renderer 隔离、Markdown round-trip 安全、
保存时不重排文档、P0 UX 项等）以
[`AGENTS.md`](../../../AGENTS.md) 为唯一事实源。
本 skill 不复述这些规则，直接按 AGENTS.md 执行；如果发现 AGENTS.md 里没写、
但任务要求又强约束的项，先回到 intake 阶段补充，而不是在 skill 里加一份。

任务级纪律（来自 `AGENTS.md` 的"任务规则"，这里只点几条最容易翻车的）：
- 一次只做一个 task，diff 聚焦可回退
- 不动无关文件
- 行为变化要补测试或更新测试

### 3. 边做边自检，不要攒到最后

实现过程中按门禁分级（见 docs-map.md 的"验收门禁分级"）对**自己改动的范围**
跑相关命令做开发自检。例如改了 `packages/markdown-engine` 就先跑那一块的单测，
不必每次都全量 build。

最终 PASS/FAIL 结论留给验收阶段，不要在这里宣布"任务完成"。

### 4. 落地 execution handoff（必须）

实现告一段落、要交给验收前，把这份摘要写到：

```
docs/plans/<YYYY-MM-DD>-<task>-handoff.md
```

至少包含：

- 改了什么（按"为什么"组织，不是 git diff 的逐行复述）
- 落点文件清单
- 推荐的验证命令（按门禁分级裁剪过）
- 人工验收草稿步骤
- 已知风险或未做项

这一步不能省。`$yulora-task-acceptance` 会读这个文件来跑验证和写总结；
没有它，验收阶段只能反推改动，结论质量会下降。

### 5. 分派下一步

实现完成后，调用 `$yulora-task-acceptance` 进入验收阶段。

## 结束条件

满足以下全部条件才结束本 skill 的工作：

- 实现已经落地，必要测试已补
- 开发自检通过（最终门禁留给验收）
- execution handoff 文件已写
- 已经把控制权移交给 `$yulora-task-acceptance`

# 文档规范验收规则

结构验收不只看代码。只要这次改动改变了稳定行为、稳定边界或公开 contract，就要看文档是否同步。

## 1. 什么时候必须改文档

以下情况默认需要文档更新：
- 用户可见行为变化
- 编辑语义变化
- 保存 / autosave / reload / external file conflict 规则变化
- main / preload / renderer contract 变化
- theme public contract 变化
- 测试策略或验收方式变化
- 非显然的架构决策变化

## 2. FishMark 中各文档的职责

### `docs/design.md`

记录稳定产品基线和稳定架构表述。

该更新时机：
- 壳层形态变了
- 编辑模型变了
- 范围定义变了
- 稳定的系统边界变了

### `docs/decision-log.md`

记录“为什么这样做”的结构决策。

该更新时机：
- 做了非显然取舍
- 删除了旧路径
- 引入了新的边界原则

### `docs/test-cases.md`

记录人工验收或结构化验收场景。

该更新时机：
- 用户可见行为变化
- 操作路径变化
- 新增或修改重点边界场景

### `docs/test-report.md`

记录本轮真实验证证据。

该更新时机：
- 本轮跑了新的门禁或聚焦验证

不允许：
- 用旧报告冒充本轮证据

### `docs/progress.md`、`MVP_BACKLOG.md`、`reports/task-summaries/TASK-xxx.md`

只有在 task 状态、执行切片或“本轮完成内容”变化时才需要同步。

如果本 skill 的调用目标只是结构 review，而不是 task 收尾，可以不要求这三处更新；但如果用户明确在做 task acceptance，就不能漏。

### `docs/theme-packages.md` / `docs/theme-authoring-guide.md`

当 public theme contract、theme package 结构或 authoring 规则变化时必须更新。

## 3. 直接判 FAIL 的文档问题

- 代码引入了新的稳定行为，但文档仍描述旧行为
- 架构边界明显变了，没有任何 decision log
- 改动影响验收路径，却没有更新 test cases
- 回答里声称“已验证”，但仓库没有本轮新鲜 test report
- task 状态型文档互相矛盾，且本轮目标就是正式验收

## 4. 审查提问清单

- 这次改动是否改变了稳定行为或稳定边界
- 如果改变了，哪一份文档应该更新
- 文档是同步真相，还是在给当前实现找借口
- 如果这是 task 收尾，本轮状态文档是否一致


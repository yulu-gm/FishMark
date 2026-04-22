# 测试与验证验收规则

结构验收里，“有测试”不等于“测试充分”。要看测试层级是否匹配风险。

## 1. 基本原则

- 行为变化必须有对应验证
- 风险越高，测试越靠近真实边界
- 只测 DOM class 或静态快照，不足以证明编辑器语义正确
- 手工说明可以补充，但不能替代高风险自动化验证

## 2. 风险到测试层的映射

### 纯 parser / pure logic / semantic edit

应优先看到：
- `packages/markdown-engine/**`
- `packages/editor-core/**`

适合覆盖：
- parse
- normalize
- command planner
- pure derived state

### main / preload / shared contract

应优先看到：
- `src/main/**.test.ts`
- `src/preload/**.test.ts`
- `src/preload/preload.contract.test.ts`
- `src/shared/**.test.ts`

适合覆盖：
- IPC channel
- typed bridge
- persistence / watcher / packaging / runtime contract

### renderer shell / workspace state / UI 编排

应优先看到：
- `src/renderer/**.test.ts`
- `src/renderer/**.test.tsx`

适合覆盖：
- 状态切换
- 交互入口
- renderer 层编排
- 受影响 UI 行为

### 跨层真实流程

应优先看到：
- `packages/test-harness/**`
- `src/renderer/editor-test-driver.test.ts`
- scenario tests
- Playwright / workbench / CLI scenario

适合覆盖：
- 打开 -> 编辑 -> 保存
- 外部修改冲突
- 拖入 / 菜单 / 多窗口 / tab 流
- 高风险用户路径

### 数据保真与回归风险

应优先看到：
- round-trip regression
- 保存后重开
- external file / autosave / reload 组合场景

## 3. 直接判 FAIL 的测试问题

- 用户可见行为明显变化，没有 targeted test
- 改了共享 contract，没有 contract test
- 改了保存、reload、autosave、external conflict，却没有回归覆盖
- 只证明了某个 class 存在，却没有证明真实编辑语义
- 只做手工描述，没有本轮自动化证据
- 声称“修了 bug”，但没有复现或回归测试

## 4. 验证证据要求

结构验收需要看：
- 测试是否存在
- 测试是否测对层
- 验证是否是本轮新鲜证据

如果用户要求正式验收，还应确认：
- lint / typecheck / build / relevant tests 的本轮结果

## 5. 审查提问清单

- 这次改动最大的风险在哪一层
- 当前测试是否真的打到了那一层
- 是否遗漏了最容易回归的组合路径
- 是否拿低成本测试替代了高风险边界验证


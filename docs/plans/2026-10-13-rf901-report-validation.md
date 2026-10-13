# RF-901：runtime 报告验证小批

2026-10-13，从已发布 `59b2f2e` 主线继续 M9。AGENTS 要求单任务、聚焦且可回退；路线图顺序是 RF-901 → RF-902 → RF-903。本批修复诊断报告的成功条件，不恢复历史实验，不改产品或完整性能指标定义。

## 具体问题与范围

原 Electron 探针只用 `fixtures.every(sourcePreserved && emittedFrames === 30)` 判断成功，不能拒绝空、缺失、重复夹具或不完整测量。现在由一个 Node 模块验证根报告、固定 5k/20k 输入及哈希、30 个有限非负样本、重算 nearest-rank 摘要、文档变更回调和运行环境。ON 模式还验证样本身份与 span 闭合、包含关系、直接子项账目；不把重叠 inclusive 时长相加。

原始报告先保存；Electron 与离线 CLI 共用判断，派生结果写入 `<report>.assessment.json`。失败原文保留。没有新增产品计时、重复框架、解析器、优化开关或依赖。采样次数、顺序、180 秒超时、隔离 userData 和 sandboxed 测试窗口沿用原协议。

## 命令与解释

```powershell
$env:FISHMARK_RUNTIME_PERF_REPORT='.artifacts/rf901-fresh/runtime.json'
npm run perf:editor-runtime
node scripts/evaluate-editor-runtime-performance.mjs .artifacts/rf901-fresh/runtime.json
node scripts/evaluate-editor-runtime-performance.mjs .artifacts/rf901-fresh/runtime.json --require-roadmap-budgets
```

诊断命令 exit 0 只表示完整性 `VALID`；无效报告 exit 1。严格预算命令对当前合法 schema 2 返回 exit 2 / `INSUFFICIENT_EVIDENCE`，无效报告仍 exit 1。这不是放宽或绕过预算；完整 RF-901 门禁保持未完成。CLI 不替代来源审计，不从 JSON 证明其实际执行过。

| 现有量 | 含义 | 仍缺的验收证据 |
| --- | --- | --- |
| `openMs` | controller 同步构造 | mixed 5k/20k cold/warm editor-ready ≤500/1500ms |
| `typingDispatchMs` | 完整 controller 同步调用 | 普通输入完整语义区间 p95 ≤16ms；结构编辑 ≤24ms |
| `typingToFrameMs` | 输入至两次 rAF 回调 | 实际呈现、长任务、掉帧和滚动跳动 |
| `emittedFrames` | 文档变更回调数 | 渲染帧数、内存、解析/复用/fallback/decoration 计数 |

即使 dispatch 非常快或很慢，也不能把 plain fixture 或边界不符的数据判作 semantic PASS/FAIL。真实 IME、soft-wrap、scroll、source/tab switch 等仍属后续验收。

## 本批验收

- 单元与 CLI 测试覆盖正常/损坏/空/partial/重复、错摘要/哈希、ON 失败，以及超快和超慢 dispatch 的语义边界。
- 新 main 控制基线与本批完整 strict；symlink 必须实际执行，原十项失败指纹不变。
- lint/typecheck/build、原 bundle 1500000 B ceiling、既有编辑与原生门禁；独立审查。
- 新鲜独立 OFF/ON Electron 报告、原始日志留在 `.artifacts/m9-intake/`；仅简短结果进入发布历史。
- 验收后按已有授权普通推送 main 并检查精确提交的全部必需 CI；不 force、不建远端分支。

本批结果见[任务总结](../../reports/task-summaries/TASK-RF901-REPORT-VALIDATION-020.md)。本批通过不勾选整个 RF-901 的要求，不开始 RF-902/903，不关闭历史表格问题，也不污染冻结 cp13/cp16 或绕过 Library 阻塞。

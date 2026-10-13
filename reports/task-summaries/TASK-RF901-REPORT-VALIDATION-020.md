# RF-901 runtime 报告验证：本地检查点

2026-10-13。**实现与独立审查 PASS；完整批次验收 BLOCKED，未推送。RF-901 进行中，M9 0/3，RF-902/903 未开始。**

## 改动与来源

基于官方 main `59b2f2e369739670b4fc230a79cb05eacb290790`，tree `8c50ad1d75b6e3f5099f5e32ae65c32dfea848bd`；其 [CI 38339536735](https://github.com/yulu-gm/FishMark/actions/runs/38339536735) 精确 head 已核实 completed/success。独立 worktree `fishmark-m9-20261013`，旧 `85df142` 检查点及另一 UI 工作目录保持原状。

原 runtime probe 仅以源码布尔值和 document-change 回调数判断成功，空夹具数组也可能被 `.every()` 接受。新增共享 Node 验证器及 CLI，Electron 先保留原始报告，再保存派生 assessment 并据完整性设置退出码。验证固定输入/哈希、完整采样、有限非负时长、nearest-rank 摘要、环境与 ON span 的一致性。

诊断 `VALID` 不代表性能通过；合法 schema 2 始终明确为 `INSUFFICIENT_EVIDENCE`，严格预算模式 exit 2。controller dispatch、构造和两次 rAF 不冒充 §8 的混合夹具语义/editor-ready/实际呈现指标。具体命令与边界见[计划](../../docs/plans/2026-10-13-rf901-report-validation.md)。CLI 验证内部一致性，不能从 JSON 本身证明运行来源。

生产 renderer/packages、夹具、依赖、预算及 CI 配置与基线字节相同。没有性能优化、采样协议变更、产品抽象、系统设置变更或新依赖；冻结 cp13/cp16 与 Library 阻塞保持原状。

## 本机验证

YULUSTATION：Windows 11 Enterprise 26200，i7-13700K（16 核/24 逻辑 CPU），RAM 34,088,263,680 B，RTX 4070 驱动 32.0.15.9186，另有两项虚拟显示适配器，平衡电源；Node 24.13.0/npm 11.6.2，Electron 41.2.0/Chrome 146。runtime 专用窗口 DPR 1、monospace 16px/22.4px，独立 userData/session。系统 IME 未测试，语言列表读取未得到有效字段，不能据此判断系统无 IME。未与其他机器性能混合。

| 检查 | 结果 |
| --- | --- |
| 未改动 main strict | 3485 passed +10 exact known；0 skip/unexpected/errors |
| 报告验证定向 | 52/52；独立 reviewer 复跑同样通过 |
| 修后完整 strict | 3537 passed +10 exact known；0 skip/unexpected/errors；symlink 实际 passed |
| 标准 lint/typecheck/build | 全部 exit 0 |
| `perf:baseline` | exit 0；foundation 310/310；total JS gzip 1,434,002/1,500,000 B，其他 bundle 检查通过 |
| runtime OFF 与 ON | 两个新进程采集成功；两份报告 VALID，均 INSUFFICIENT_EVIDENCE；严格 CLI exit 2 |
| 真实 Electron workspace safety | 7/7，exit 0；保留一个 MaxListenersExceededWarning，未压制/未归因 |
| 正式 editor behavior | 121/121 cases、2541 targets；79 existing、2363 runner、99 known-defect、0 unexpected/not-run |
| 原 `test:editing-experience` | **FAIL：70/79，9 失败**；见下方主线对照 |

未改动 main 单次 runtime OFF 控制记录 20k input dispatch p50 45.8ms、p95 71ms。它只是一条诊断线索，不是已测得 semantic 预算失败，也不是本批优化收益；本批没有产品优化。OFF/ON 只验证报告路径，不汇总为性能对比。

独立 astra-high 首审发现一个 P2：被拒绝的 malformed span 仍进入后续算术。修复为仅处理已验证 span，增加 4 项回归；复审 52/52 和 54 项类型突变均通过，无剩余 P0/P1/P2。初次 reviewer 在 sandbox 中运行测试因 Vite cache rename EPERM、0 collected；获准 host 执行后通过，保留两次记录。

## 阻碍：原编辑体验门禁

在另一个干净 worktree `fishmark-m9-control-20261013`，固定精确官方 `59b2f2e`，独立 `npm ci` 后运行同一原命令。同样 exit 1、70/79；全部 79 个 case 对象（包含 actual、expected、selection、pass）与候选逐项完全相同，失败列表相同。不是本批引入；仍不把它改称 PASS 或新增 allowlist。

9 项涉及：bare dash、bare ordered marker；bare dash 后 composition preview、dash-space 后 composition preview、列表后空白行中文插入；blockquote 中 bare marker Tab、padded empty item Tab、residual separator 后 Tab，以及 blockquote inner-block Enter。这里的 IME 用例名不代表已执行真实 OS IME。

独立 reviewer 再次比对确认同样结果。九例顶层 `actualContent` 均等于 `expectedContent`；失败来自额外 DOM、可见性或 accepted 断言，不能仅凭用例名归为文本编辑错误。尚未判断应修产品投射还是已失配的诊断预期，不能未经审查修改 oracle。

现有 GitHub CI 的正式行为门禁接受固定 known-defect，与这个原诊断命令的全通过条件不同。不能用 CI 绿色掩盖本轮路线命令失败。本批仅本地 checkpoint，不发远端、不创建远端分支，不扩大修复为所有列表/引用语义。下一小批应围绕这 9 项实际/期望差异确定根因并修复，随后恢复 mixed-fixture 性能验收。

## 原始证据与未测

本工作区 `.artifacts/m9-intake/` 保留 host/source provenance、安装与完整门禁日志、control/candidate JSON、OFF/ON raw/assessment/transform manifest、strict-budget exit、完整独立审查及 `editing-main-control.json`；控制工作区保留其安装/原命令日志。原始大报告与 userData 不纳入本次 Git 检查点。

M9 全性能矩阵、真实 IME、实际 paint、内存、RF-902 E2E、RF-903 安全、历史表格 288px 前态、Typora 对照、安装包及本批远端 CI 均未验收/未运行。不得以本批验证器的完成标记 RF-901 或 M9 完成。

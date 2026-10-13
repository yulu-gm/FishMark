# RF902：恢复故障与离线磁盘冲突

日期：2026-10-13。设备：YULUSTATION / Windows 11 / i7-13700K / 32GB / Electron 41.2 / DPR1。基线为重新 fetch 核验的官方 main `9337ff4e72757c58a3cdc2426e44f598617ee581`，tree `52704505ccdf92d0d896957f332f26db14782816`；开始时工作区干净。

## 问题与修复

真实产品在隔离 profile 下产生已确认编辑，然后由外部终止该测试拥有的进程树。仅在退出确认后修改临时 recovery 文件或临时文档，未操作用户文件。

| 用例 | 基线事实 | 本批行为 |
| --- | --- | --- |
| 截断末行 | 有效前缀恢复、真实提示存在，但原始文件未保全 | 恢复完整记录；原 snapshot/journal 成对保全，再允许新编辑、保存及正常退出 |
| 完整坏行 | 丢失有效前缀、无可见提示；首次新编辑覆盖损坏日志 | 保留可信 snapshot 与坏行之前的有效前缀；停止不可信尾段；保全原始对并提示位置 |
| 单文档语义回放失败 | 第一文档坏记录使另一文档的有效 ACK 记录也未回放 | 阻断失败文档后续链，保留其有效前缀，继续恢复其他文档；汇总一次提示 |
| crash 期间原路径外改 | 普通保存拒写且外部字节不变，但只有瞬时错误、没有冲突处理入口 | 保持 `disk-version-conflict`，记录 canonical 外改状态并刷新现有横幅；显式重载后继续编辑保存 |

恢复文件保全失败会封住后续 append/compact/truncate，原始文件不被覆盖。损坏 snapshot 无法恢复时，保全并显示不可用提示；领域恢复异常回滚到调用前状态。这些防护有行为单测，但本批没有把所有 snapshot 关系故障或底层 I/O 故障增加为真实产品矩阵。

## 真实证据与边界

新增四条产品 E2E，使用实际构建 main/preload/renderer；原生文字通过 `webContents.insertText`，不是 OS IME。恢复提示调用原始 Electron `showErrorBox`，没有替换其结果。Windows 辅助精确核验 isolated profile、PID/可执行文件/启动时间、真实题文、所属 HWND 与确定控件，再通过原生按钮确认；TaskDialog 实际结构和操作已留存。

基线产品失败：`rf902-recovery-corrupt-baseline-01`、`rf902-recovery-partial-baseline-07`、`rf902-recovery-other-baseline-01`。所有原始文件、hash、JSONL、截图/trace 和失败断言保留在 `.artifacts/e2e/`；索引、门禁和审查在 `.artifacts/rf902-recovery-faults/`。

partial baseline01–05 是辅助程序失败：旧 PowerShell 脚本策略、TaskDialog caption/UIA/按钮能力识别；保留每次三项超时清理错误及随后 owned-tree fallback 退出证据，不记作 PASS。baseline06 已成功处理原生提示，但点击阅读模式下隐藏标签超时。baseline07 才完成实际产品回放断言。未改执行策略或系统安全设置，最终使用现有 PowerShell 7；未复写任何失败运行。

本批是退出后故障注入，不能证明 OS 断电、fsync、实际写入中断瞬间的耐久性。离线外改不能替代运行中 inactive-tab 外改。普通 Save 被阻止后测试明确点击“重载磁盘版本”，这是用户选择采用磁盘内容，再验证后续编辑保存；不宣称自动合并或自动覆盖。

## 门禁与发布

冻结生产代码的完整门禁通过：

| 门禁 | 结果 |
| --- | --- |
| lint / typecheck / build | PASS |
| Windows 产品 E2E | **16/16 PASS**，0 skipped/flaky；22次启动全部退出，清理错误0 |
| 严格 Vitest | **3749 PASS + 8 exact known**，0 unexpected/skip/collection/hook/unhandled；含采集修复新增3项回归，名单未改 |
| foundation / editing / workspace-safety | **310 / 79 / 7 PASS** |
| 正式 editor-behavior | **121/121**，2541 targets，99既有known-defect，0 unexpected/not-run |
| renderer gzip 合同 | **1,435,693 / 1,500,000 PASS**；未修改预算 |

第一轮本机通过运行是 `.artifacts/e2e/rf902-recovery-faults-final-02/`，stdout 为 `.artifacts/rf902-recovery-faults/rf902-recovery-faults-final-02.log`。`check-e2e.log` 属于首次 final01 的15PASS/1FAIL，不能作为最终全绿证据：其partial已通过内容与保存断言，最后把预期warning中的 `error` 当成额外错误。修正后按该次launch精确验证单元素 `console:warn` 消息和stderr完整行各1次，只调整分类副本；同文console.error、重复警告及其他错误继续失败，原始日志不删。生产代码未因此改措辞，未扩大8known名单；随后重跑全部16条产品E2E及lint。typecheck/build沿用相同冻结生产代码通过结果。后续远端采集失败及最终本机final03见下节。

原始门禁汇总 `check-results.json`、`strict.json`、`behavior.json`、`safety.json` 和所有stdout保留。safety既有MaxListenersWarning原样保留，未当成未处理错误或伪造“全日志无警告”。独立astra-high已审查生产、测试辅助、精确warning协议及16份原始产品报告。发布前再次fetch，官方main仍为`9337ff4e72757c58a3cdc2426e44f598617ee581`。普通main发布的精确SHA、tree及该SHA CI终态记录在本次交接与本机`publication.json`/`ci-terminal.json`，不以旧CI代替新提交结果。

### 首轮远端 CI 的采集失败

生产修复提交 `b4174166461d5a5deb614d736dd2d15ba8970114` 的 [CI 38389915384](https://github.com/yulu-gm/FishMark/actions/runs/38389915384) 为失败：Quality、完整回归、预算通过，Windows 产品 E2E 为15通过/1失败。partial 的恢复、独立文档、新编辑、保存与正常退出断言均已通过，最后的预期 stderr 行次数为0；同次 `console:warn` 原始事件为1。官方产物11808297341完整保留，ZIP SHA256 `7e6c08fe93de2925f891b669573781e864f83b9d3c4dbd6db54a68c305a7dccd`。

原因是 Playwright 在 `electron.launch()` 返回之前已读取 stderr，fixture 后挂的监听器可能漏掉早期输出。后续只修改测试采集：bootstrap 在加载真实 main 前透明复制 `process.stderr.write` 原始字节，保留原参数、回调与返回值；不改变启动顺序或产品协议。Node 原始流与晚挂的进程管道分别保存、分别检查错误，不合并重复内容，也不根据 console 参数补造缺失行。预期警告仍须满足 Node 原始完整行1次及 `console:warn` 1次；晚挂管道只可能观察0或1次。既有 IPC 错误仍要求管道精确1次，并新增 Node 原始流精确1次。

该采集范围从测试 bootstrap 开始，不能宣称捕获此前的原生 Electron 启动输出。最初失败的 CI 与本机 final01/final02 均保留；新提交需要独立复审和新的精确SHA CI终态。

采集修复后最终本机运行 `.artifacts/e2e/rf902-recovery-faults-final-03/`：16/16通过，0skip/flaky，22次启动全部退出，清理错误0；2026-10-13T11:40:56Z核验前台与输入布局恢复。新增透传、早期丢行重现、拒绝覆盖/原写入异常3项单测通过；重跑lint、typecheck、严格回归3749PASS+8exactknown。`ci-fix-check-results.json`、`strict-ci-fix.json`、`ci-fix-product-summary.json`保存结果。main/preload/index/lock四项哈希与此前已通过构建一致，因此沿用冻结生产代码的build、foundation310、editing79、safety7、formal121/121和预算结果；后续精确提交CI会重新构建并执行远端完整门禁。

## 正式剩余项与额外建议

RF902 仍为 `IN_PROGRESS`。正式待验收：运行中 inactive-tab 外改/拒绝覆盖；move/detach 项中的既有窗口移动用户入口仍不存在（不在本批添加）；嵌套 Enter/Backspace/Tab/arrow/undo 的源文与选区产品断言；平台 IME 与相关 smoke 证据。窗口关闭提示保留现有workspace-safety证据，尚未全部纳入Playwright产品用例。既有保存重启、真实 idle、已确认编辑崩溃恢复、跨窗口分离/取消/失败恢复证据可沿用，不能据此签署整个 RF902。

本次用户指定的恢复四项是本批必需范围；RF902 原文要求 crash recovery，但未逐条规定所有损坏策略。RF303 历史要求损坏保全与可见通知，本批补齐该实际缺口。额外建议（本批未测且不无限扩入）：真实断电/fsync、全部底层写失败、所有 snapshot 关系损坏、保存过程中外改竞态与身份变化。

RF901 `PAUSED`，RF903 `PLANNED`，M9 **0/3**。cp13/cp16 与 Library 访问阻塞均未触碰。

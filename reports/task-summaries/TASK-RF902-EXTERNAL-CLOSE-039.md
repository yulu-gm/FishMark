# RF902：后台标签外改与原生关闭保存

2026-10-15，YULUSTATION，Windows 11 build26200 / i7-13700K / 32GB，同机现有 Electron41.2.0 / Chromium146.0.7680.179。起点官方 main `ed886029b7b750e57d26b21b50bd57a3b02e359f`，tree `7168084e10e8cb740f03182a1573132a6be9f255`；开始时重新 fetch 一致、工作副本干净。本批限 RF902 运行中后台标签外改及关闭保存/取消，未新增架构或功能。

## 内容安全结论与修复

本批顺序外改场景没有复现草稿丢失或外部磁盘内容被误覆盖。真实 watcher 在 B 活动期间报告 A 的变化；B 不受影响，切回 A 后保留原文与冲突横幅。干净 A 经明确重载才采用磁盘正文；脏 A 保留草稿，原生 Close→Save 返回精确 `disk-version-conflict`，窗口和编辑器仍在，外部字节未变。随后 Cancel 可继续编辑，最后明确选择“保留当前编辑”才允许将草稿保存到原路径。

真实原生关闭提示另外暴露了产品时序缺陷：弹窗失焦触发自动保存，排在 window-close 确认之后；Save 和 Don't Save 基线都出现 `complete-workspace-window-close` 后的额外 save IPC，随后因窗口销毁被拒绝为 `Untrusted IPC sender`。Save 基线完整正文已落盘，Don't Save 基线原文件未变，因此不将这些失败描述为已发生内容丢失；但尾随保存超出了关闭决定，不能以最终 IPC 拒绝为由忽略。

最小生产修复只改 `workspace-renderer-application.ts` 两个入口：既有 closing-window transition 期间，editor blur 不启动 autosave；排在确认关闭之后的 save transaction 在执行前返回 superseded。关闭之前已排队/进行中的保存仍按同一 coordinator 的 FIFO 完成。取消或失败释放 editor 后，既有 command wrapper 恢复自动保存调度；IPC 授权、磁盘版本守卫、保存原文和关闭决策均未放宽。新增三个 application 回归覆盖 prompt blur、seal 前已排在 close 后的保存、Cancel 后正常 autosave。

这是顺序明确的外部改写保护，不证明磁盘版本检查与 temp-file rename 之间对其他程序的并发写入具有原子 compare-and-swap 保证。该源码可见窗口保留为未覆盖边界，未扩大本批引入磁盘锁/架构。

## 真实产品协议与失败保全

- 复用现有双路径隔离 fixture：app ready 前设置独立 appData/userData，每次输入先核验真实入口、preload 字节、sandbox、main/metrics 进程身份；只使用 owned 临时文档/窗口，正常退出后核验所有所属进程退出再 guard 清理。
- 新增 `external-changes.spec.mjs` 两项：干净 inactive tab 外改→显式 reload→继续保存；脏 inactive tab 外改→原生 Close Save 拒写→Cancel→继续编辑→显式 keep-memory 保存。第二文件通过原生 file-input 后端 File 对象和合成 drop 进入现有产品入口，不声称 OS 原生拖放。
- 新增 `close-save.spec.mjs` 两项：真实原生 Cancel→继续编辑→Save→正常关闭/重开精确字节；Don't Save→原磁盘未改→重开不恢复已丢弃草稿。只用原产品 close 和 save 流程，不替代 dialog 返回值。
- Windows helper 绑定单一真实 telemetry launch、immediate owned temp profile、活 PID/可执行文件/启动时间、唯一所属 native dialog；UIAutomation 精确核验完整题文，再验证所属 native Button 的名称、可用/可见和父子关系，定向 BM_CLICK。没有全局键鼠输入、OS 设置修改或其它程序操作；原 showMessageBox 的实际 response 也必须匹配。
- 原生助手01因 DirectUI 正文不在传统 Static 控件而安全拒绝点击，原失败/源码保留。补充同一 owned dialog 的精确 UIAutomation 正文核验后，助手02真实 Cancel/Save 通过，随后产品尾随保存错误触发健康检查失败；Don't Save 单独基线也保留原错误和未改磁盘。
- 首次单元 fixture 的 dirty/revision 不一致失败、第二次尚未等待异步队列结束的失败均保留，不作有效产品基线。修正测试协议后的 baseline03 在未改生产源码上三个回归全部失败；候选受影响 application/scheduler/app.autosave 三套共257通过。
- 不重跑已完成 IME 助手实验。此前分阶段诊断已说明“空格＋Enter”与旧单换行断言不一致；严格可信 compositionend 仍失败，同引擎对照不是产品验收，未重标历史失败。

## 最终验证与发布边界

最终九项门禁在 `rf902-external-close-gates-01` 全部通过：lint、typecheck、build、strict、完整产品 E2E、perf baseline、editing、workspace safety、formal。strict **3864 passed＋8 unchanged exact known，0 unexpected/errors/skip/unresolved**；产品 **29/29、0 skip**，共 **38次真实启动、33次正常退出＋5次原有恢复故障用例的明确强退**，所属进程全部退出、cleanup0。新增四条产品用例共五次真实原生提示选择均验证真实 response；后台 dirty 与原生 Save 拒写/Cancel、Save重开、Don't Save重开全部通过。foundation310、editing79、safety7；formal **121/121 cases、2541 targets、99 known-defect observed、0 unexpected/not-run**。正式 JS gzip **1435819/1500000**，initial **102847/260000**，预算和 allowlist 未改，不作为 RF901 性能验收。

门禁后重新计算12项源码/测试及受测构建哈希，全与冻结记录一致；真实产品报告中的 main/preload/index/lock provenance 逐项匹配。`final-summary.json` 校验全部29报告、磁盘 checkpoint、实际双路径身份/正常与强退边界、原生提示、严格回归和四段前台监控。监控未观察到物理用户操作或输入干扰；允许测试注入的产品完整套件仍保留“远程注入的用户操作可能不可区分”限制。

最终独立 review、提交和对应 CI 记录在本机 `.artifacts/rf902-external-close/` 的 `independent-review-final.txt`、`publication.json`；精确发布 SHA 与 exact-head CI 以该记录和本批最终交付为准。源码/用例冻结哈希在 `frozen-hashes.json`；原产品基线在 `.artifacts/e2e/rf902-external-baseline-01`、`rf902-native-close-01/02`、`rf902-native-discard-baseline-01`。桌面监控结果在 `.artifacts/rf903-preview-authority/<runId>/result.json`；测试 trace、截图、原生日志/提示证明、精确磁盘 checkpoint 和正常退出在 `.artifacts/e2e/<runId>/`。

RF902 仍 IN_PROGRESS，RF901 PAUSED，RF903 IN_PROGRESS，M9 **0/3**。嵌套编辑/源文选区、已有窗口合并缺入口、平台 IME 与性能/其它安全开放项未因本批关闭。Crashmon、真实用户 profile/文档、cp13/cp16 与 Library 均未操作。

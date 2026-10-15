# RF902：嵌套键盘、选区与历史的产品整合

2026-10-15，yuluStation，Windows11 build26200 / i7-13700K / 32GB，Electron41.2.0 / Chromium146.0.7680.179。同一公开 main `8195324cc1c3ba1a8a76da2ebeddd523f80c6da3`、tree `270e75bb5a0ddde0bd6dd68d5536ebaf750bcdf0` 上开始，重新 fetch 核对一致、工作副本干净。本批只补现有 RF902 的产品测试与范围说明，**没有生产代码、依赖、架构或功能改动**。

## 缺口与实际流程

已有 formal121/2541 和 editing79 在独立 controller/harness 中验证大量嵌套语义；formal 还包含 repeat/undo，但没有 redo action。`editor-behavior-manifest-runner.ts` 通过直接 setSelection、insertText 与 synthetic KeyboardEvent 驱动，不是产品 shell、可信 Chromium 键盘和保存管线的一体证明。原产品29用例已覆盖持久化、关闭/冲突、恢复、跨窗与安全，尚无以下三组整合；本批不复制全部 formal 矩阵。

1. 引用内三级子树：从 source UI 的原生键盘定位，切回 WYSIWYM，Tab 移入整个含 leaf 的 child 子树，undo/redo 精确还原源码与光标；Shift+Tab 反向整树操作与 history；保存后再 undo/redo，核对内存变化与已保存磁盘的界限，最终保存重开。
2. 三层列表：Enter 添加同层空 marker，Backspace 只去 marker 并保留空行缩进；两次 undo 回到原文，再两次 redo，逐步核验完整源码与 caret，精确保留尾部空格保存重开。沿用 `runNestedEmptyListMarkerBackspaceCaretCase` 的既有期望，不扩展 Enter/Backspace 功能。
3. 列表内 strong：箭头穿过已揭示 opening marker 的源码字符；真实键盘反向选择 `alpha` 中间子串，source/WYSIWYM 双向切换仍保留 anchor/head；Backspace 后，经 source/WYSIWYM 与 F11 shell 往返，首次 undo 恢复原反向选区，再 redo；另测重复 history，最终保存重开。F11 shell 不等于 source mode 或只读。

## 观测与断言修正

所有实例复用既有真实产品 fixture，在 app ready 前设置独立 appData/userData，核验真实 dist 入口、preload 字节、sandbox、main/metrics 身份，临时文档与窗口之外不输入。键盘由 Playwright/Chromium 产生，目标 editor 事件要求 trusted；没有调用产品 controller、私有 state、测试 bridge 或合成 keydown。可信 Chromium 输入不是物理 OS 键盘或 IME 验收。

多行位置不沿用旧单行 Range helper。每次 checkpoint 要求完整渲染的 `.cm-line` 源码文本加换行重建与 main canonical 全文严格相等，再按所属物理行和行内 Range 计算 DOM anchor/head。source UI 的定位与 mode 切换也要独立断言源码与完整选区，按键次数不是位置 oracle。范围限这三个无替换 widget 的短 fixture，不推广虚拟化大文档、表格或图片；不宣称完整 caret 像素/跨平台布局验收。每一步编号证明、截图、trace、main ACK 和最终磁盘字节均保留，失败也写出最新证明。

baseline01 前两组通过；第三组仅在 undo→redo→模式切换→再次 undo 时，源码正确而 DOM 选区19/19与断言19/16不符，故保留 FAIL。依赖级控制使用同一 lock 和已安装 `@codemirror/state 6.6.0`、`@codemirror/commands 6.10.3`，无 FishMark、UI、模式切换：首次 undo19/16、redo16/16、再次 undo19/19。与 commands 的 opposite-branch HistEvent/startSelection 处理一致，不能把首次选区无条件用于重复历史。

前瞻协议保留更强的首次撤销要求：在 source/F11 切换之后，**第一次** undo 必须恢复原反向19/16；重复 undo 的单点位置另按依赖控制核验。baseline02 三组全部通过，所有原生产品源码均未改变。原失败和原 spec 保留，未将控制试验当作产品验收，也未为制造通过而改产品或放宽源码/首次选区断言。独立6.1-sol审查已核对控制代码、结果、lock哈希和观测范围。

## 最终验证与边界

当前 `rf902-nested-keyboard-gates-01` 九项门禁全部通过：lint、typecheck、build、strict、完整产品E2E、perf baseline、editing、workspace safety、formal。strict **3864 passed＋8 unchanged exact known，0 unexpected/errors/skip/unresolved**；产品 **32/32、0 skip**，共 **44次真实产品启动、39正常退出＋5次既有恢复用例的明确强退**，所属进程均已退出且cleanup0。新增三组共六次正常启动、**36个源码对齐 DOM选区 checkpoint**，反向 DOM Range 的选中文本也与 canonical 区间一致。baseline02独立定向运行另为3/3、六次正常启动，不混入完整套件计数。

foundation310、editing79、safety7；formal **121/121 cases、2541 targets、99 known-defect observed、0 unexpected/not-run**。正式 JS gzip **1435819/1500000**，initial **102847/260000**，预算/allowlist未变。新测试/受测构建五项冻结哈希，以及报告039的12项生产/测试/构建哈希均完全一致，生产源码与产物未因本批变化。实际每次产品 main/preload/index/lock provenance 与冻结记录逐项匹配。

`final-summary.json` 由本机 `summarize.mjs` 验证上述门禁、32产品报告、44组身份/退出、36份源码与 DOM range 数据、保存字节与 hash、依赖控制和四段桌面监控。监控没有观察到物理用户输入或干扰；仍保留远程注入用户操作可能不可区分的限制。最终独立 review、提交与 exact-head CI 以本机 `.artifacts/rf902-nested-keys/` 的 `independent-review-final.txt`、`checkpoint.json`、`publication.json` 和本批最终交付为准。

基线产品证据在 `.artifacts/e2e/rf902-nested-keyboard-baseline-01/02`，原协议为 `baseline-01.spec.mjs`；依赖控制在 `history-control.mjs/.json`。桌面监控沿用 `.artifacts/rf903-preview-authority/<runId>/result.json`，完整产品/各门禁证据以本批 gate runId 区分，没有复用旧门禁报告冒充当前执行。

本批仅证明三组指定 Windows 产品流程的源码、DOM选区、history 和保存往返；不声称所有深度/容器/格式组合已逐项原生验收。嵌套 Enter promotion 等其它组合仍可沿用其既有 formal/controller 证据，不能从本批外推完整产品覆盖。现有99 known-defect targets 保留；IME、Mac平台、已有窗口合并缺入口、RF901 性能预算与 RF903 其它开放项不因此关闭。并发磁盘写入原子性是已披露未测边界，本批没有展开处理。

RF902/RF903 **IN_PROGRESS**，RF901 **PAUSED**，M9 **0/3**。Crashmon、真实用户 profile/文档、OS设置、cp13/cp16 与 Library 未操作。

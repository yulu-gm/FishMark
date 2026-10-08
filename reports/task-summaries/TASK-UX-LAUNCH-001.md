# TASK-UX-LAUNCH-001：yuluStation 激活切片

结果：**FAIL（整体任务未完成）**；激活切片已验证，本地 checkpoint，未 push，待独立 review。

## 来源及环境

- 官方 main `dfcfe36b1e067d049c34d095fe828fb26c964fcd`，tree `877249ab700f80388a83ce0cb6c4f913b2ea0ad6`；新 clone 初始干净。没有触碰其他 checkout 或旧机文件。
- yuluStation：Windows 11 企业版 26200 / i7-13700K / 34088263680 RAM bytes / RTX 4070，驱动 32.0.15.9186；平衡电源计划。
- Node 24.13.0 / npm 11.6.2 / Git 2.53.0；锁文件 npm ci，Electron 41.2.0、Chromium 146.0.7680.179、Electron Node 24.14.0。
- Electron 实测 DPR 1、主屏 2560x1440；font check 中 Microsoft YaHei、SimSun、Segoe UI 为 true（不代表逐字实际字体归属）。GPU、显示详情和隔离 userData 路径见运行 JSON；输入法注册配置和监听端口见 environment.json，Native IME 未测。
- 已读取仓库与用户 .codex/AGENTS.md、执行/验收技能；仓库未发现 .agents 或 memory_summary，明确的用户 memory_summary 路径未发现；未搜索受限会话目录。
- 普通沙箱执行器 setup refresh 失败；本轮 shell 通过工具获准的 escalated 执行，无安全设置变更。

## 本轮结果

| 检查 | 结果 |
| --- | --- |
| build / lint / typecheck / diff check | PASS |
| 定向测试 | 4 文件，34 passed（含新增 5 个激活测试） |
| 双进程 baseline-final | hidden 文档打开但仍隐藏且未聚焦；minimized 文档打开但仍最小化；无参数仍隐藏；visible 正常 |
| 双进程 fixed-final | hidden / minimized / visible / noargs 均 visible=true、minimized=false、focused=true；所有第二进程 exit 0；前三项文档内容已核验 |
| 原版初次 full regression | FAIL：3140 passed +10 exact known +12 unexpected skipped；1 beforeAll 10秒超时（build-win-release），另有 symlink skip |
| 精确 main 源码重跑 full regression | FAIL：3151 passed +10 exact known +1 unexpected symlink skip；0 collection/hook/unhandled errors，首次 hook 超时未再出现 |
| 修后 full regression | FAIL：3156 passed +10 exact known +1 unexpected symlink skip；0 collection/hook/unhandled errors |

最终对照使用相同探针。早期 baseline 探针先因空文档无 `.cm-editor` 超时，后因隐藏窗口 capturePage 失败/超时中断；这些失败保留在 baseline、baseline-r2、baseline-r3，未混入最终四场景结果。最终探针只捕获可见非最小化窗口，已查看修后 hidden.png 确认实际文档渲染；截图本身不证明 OS 前台状态，状态由 BrowserWindow 查询独立记录。

证据目录 `.artifacts/hidden-window/`：environment.json、probe.cjs、baseline-final/result.json、fixed-final/result.json、fixed-final/*.png、baseline-build.log、fixed-build.log、targeted.log、lint.log、typecheck.log、baseline-regression.json、baseline-repeat-regression.json、fixed-regression.json。原始 evidence 未提交（仓库忽略 .artifacts），保留在本地 clone。重跑时仅暂存并恢复本轮自有源码改动，原门禁不加过滤、不更改并发/timeout/allowlist。

## 剩余项

- 多文件参数仍沿用旧逻辑（只选最后一个）；renderer 未 ready 队列、发送异常重试/报告、销毁竞态未实现及未做端到端验证。销毁窗口仅有激活 helper 单测，不等于路由恢复通过。
- 未改原 symlink allowlist、开发者模式、安全配置；全量门禁仍 FAIL，禁止宣称验收完成。
- 独立 review、正式行为121场景、bundle gate、打包版 Explorer 实际双击尚未运行。此次证据为同路径语义的真实 Electron 双进程，不是系统关联测试。
- Typora 安装文件存在，许可未核验；当前工具原生桌面控制不可用，未做同屏/窄窗几何、表格字体或列宽修复。未安装/购买/修改许可。
- cp13/cp16 不变；未尝试绕 Library 阻塞、未获取新候选、RF902/903 未启动。本轮不是 M9 完成。

## 人工验收步骤

1. 用隔离配置启动 FishMark 并打开一个 Markdown，隐藏窗口后以同一程序打开另一 Markdown，确认原窗口显示、聚焦且内容打开。
2. 分别从最小化、已可见状态重复；再隐藏窗口并无参数启动同一程序，确认窗口显示。
3. 后续独立验证多文件顺序、启动未 ready、销毁和发送异常；这些步骤尚未通过，不用本切片替代。

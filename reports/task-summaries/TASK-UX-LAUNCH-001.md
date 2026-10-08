# TASK-UX-LAUNCH-001：yuluStation 激活切片

结果：**窄修复代码与独立 review PASS；Windows 原完整门禁 FAIL**。本地候选，未 push；`e338d35a5bcef03e114ffb740710d068c3b017bd` 保留为首轮回退点。M9仍开放。

## 续轮：启动请求完整边界

- 多文件保留 argv 顺序，并按第二进程 cwd 解析相对路径；首次启动也使用同一队列。
- renderer 完成初始 snapshot、启动路径处理与事件订阅后才声明 ready；main 一次发送一项，收到完成确认后才出队。preload 对相同请求 ID 的重试复用同一个 Promise。
- send failure 保留请求并有界重试，持久失败明确报错；窗口销毁或重载保留未确认项，重新等待有效窗口 ready。ready 等待60秒超时报错；已交由 renderer 处理的请求不因用户对话等待而超时重放。
- IPC沿用 owner/mainFrame/entry URL授权，完成确认还校验当前窗口与请求ID。
- 独立review发现并修复两项退出P1：退出先暂停、取消/错误恢复；明确quit intent允许队列未空时确认退出，will-quit才清理。真实销毁发现的失效webContents getter亦已修复（注册watch时捕获对象）。

| 最终验证 | 结果 |
| --- | --- |
| build / lint / typecheck / diff check | PASS |
| 定向main/preload/renderer/IPC回归 | 9文件，223 passed |
| 真实Electron边界 | startup多文件、未ready多文件、send throw、发送前销毁、发送后销毁、reload、退出取消、确认退出：8/8 PASS |
| 原激活四场景 | hidden/minimized/visible/noargs：4/4 PASS，正确文档、show/restore/focus分别核验 |
| 正式行为协议 | PASS：121/121 cases，2541 targets，unexpected=0、not-run=0（79 verified-existing、2363 verified-runner、99既有known-defect-observed） |
| 原bundle门禁 | PASS：totalJsGzipBytes 1429199/1430000，余量801B；15 forbidden与4 required lazy通过，预算未改 |
| 最后精确main控制 | 原wrapper FAIL：3151 passed +10 exact known +1 symlink unexpected skip，0 hook/collection/unhandled errors |
| 最后补丁控制 | 原wrapper FAIL：3175 passed +10 exact known +同一symlink unexpected skip，0 hook/collection/unhandled errors；相对此次main控制新增异常0 |
| 独立review | PASS；此前两项退出P1经修复与真实证据复核关闭，未见剩余窄范围阻断代码缺陷 |

e338实际运行时基线多文件启动仅打开c.md；未ready追加产生2个窗口且目标窗口仅c.md。新版本分别保持1个窗口、a/b/c顺序。销毁场景保留未确认b/c至替代窗口，tab快照及renderer实际内容均匹配；确认退出由真实app.quit完成，exit0/windows0。测试包装器仅注入指定传输/生命周期故障及原生对话的Cancel选择，不替换业务打开流程。

前两轮补丁全量各出现同一搜索测试 `finds and replaces matches while preserving undo history` 5秒timeout；独立运行117ms PASS，最后精确main→补丁顺序控制均无此timeout。保留原始失败，不称根因已证明或永不再现，不修改timeout/并发/allowlist。早期e338探针与build clean并行启动造成依赖暂缺，该探针未形成产品结果；仅终止经路径/PID核验的本任务进程并顺序重跑。

### symlink前置及发布意见

具体测试为 `src/main/file-identity-resolver.test.ts` 的 `gives symlink aliases one physical identity when the platform permits symlinks`。它调用`fs.symlink(original, alias, "file")`，仅EPERM时标skip；原门禁不允许此skip。独立等价探针也返回EPERM，当前token权限列表未列出SeCreateSymbolicLinkPrivilege；开发者模式注册值未查得，未据此推断或修改系统配置。此前与最后精确main同样skip，所以不是本补丁新增回归。

独立工程意见：可交付为Windows窄bugfix候选；正式发布仍需对既有symlink环境失败作明确门禁例外批准，或在获准且能创建文件symlink的Windows环境完成原门禁。当前整体FAIL不能写PASS，远端CI未运行不能预判通过。保留早前搜索timeout为已观察到的时序风险。无需修改用户系统安全设置来继续本地交接。

当前证据：`.artifacts/hidden-window/phase2-final/*/result.json`及PNG、`phase2-activation-final/result.json`、`phase2-formal.json`、`phase2-final-{build,lint,typecheck,bundle}.log`、`phase2-targeted.log`、`phase2-main-control-regression.json`、`phase2-post-control-regression.json`；失败历史见`phase2-final-regression.json`、`phase2-repeat-regression.json`。完整探针源`phase2-probe.cjs`、`probe.cjs`、`formal-run.mjs`和`formal-entry.cjs`均保留；正式runner仅包装独立userData，manifest/contract/filter未改。symlink证据在`symlink-probe/result.json`和`symlink-token-privileges.txt`。这些原始文件位于本地忽略的.artifacts目录，不随commit上传。

## 来源及环境

- 官方 main `dfcfe36b1e067d049c34d095fe828fb26c964fcd`，tree `877249ab700f80388a83ce0cb6c4f913b2ea0ad6`；新 clone 初始干净。没有触碰其他 checkout 或旧机文件。
- yuluStation：Windows 11 企业版 26200 / i7-13700K / 34088263680 RAM bytes / RTX 4070，驱动 32.0.15.9186；平衡电源计划。
- Node 24.13.0 / npm 11.6.2 / Git 2.53.0；锁文件 npm ci，Electron 41.2.0、Chromium 146.0.7680.179、Electron Node 24.14.0。
- Electron 实测 DPR 1、主屏 2560x1440；font check 中 Microsoft YaHei、SimSun、Segoe UI 为 true（不代表逐字实际字体归属）。GPU、显示详情和隔离 userData 路径见运行 JSON；输入法注册配置和监听端口见 environment.json，Native IME 未测。
- 已读取仓库与用户 .codex/AGENTS.md、执行/验收技能；仓库未发现 .agents 或 memory_summary，明确的用户 memory_summary 路径未发现；未搜索受限会话目录。
- 普通沙箱执行器 setup refresh 失败；本轮 shell 通过工具获准的 escalated 执行，无安全设置变更。

## 首轮e338历史结果

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

## 当前剩余项

- 上述多文件/ready/send/destroy边界已完成续轮验证；renderer进程崩溃自动重启不在本次承诺内（可能等待ready超时并显式报错），不能宣称所有renderer loss均自动恢复。
- 未改原 symlink allowlist、开发者模式、安全配置；全量门禁仍 FAIL，禁止宣称验收完成。
- 独立review、正式行为、bundle已完成；打包版Explorer实际双击与远端CI尚未运行。此次证据为真实Electron双进程，不是系统文件关联测试。
- Typora 安装文件存在，许可未核验；当前工具原生桌面控制不可用，未做同屏/窄窗几何、表格字体或列宽修复。未安装/购买/修改许可。
- cp13/cp16 不变；未尝试绕 Library 阻塞、未获取新候选、RF902/903 未启动。本轮不是 M9 完成。

## 人工验收步骤

1. 用隔离配置启动 FishMark 并打开一个 Markdown，隐藏窗口后以同一程序打开另一 Markdown，确认原窗口显示、聚焦且内容打开。
2. 分别从最小化、已可见状态重复；再隐藏窗口并无参数启动同一程序，确认窗口显示。
3. 传入a.md/b.md/c.md，核验标签顺序及最后活动文档；在隔离探针中验证未ready、发送故障和销毁恢复。退出取消后应继续接收文件，确认退出后应无后台残留。本轮自动化已覆盖；打包版Explorer步骤仍待实际验证。

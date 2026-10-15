# RF902 实际产品持久化 E2E

先执行 `npm ci`、`npm run build`，再执行 `npm run test:e2e`。只列用例、不启动 Electron：`npm run test:e2e -- --list`。可用 `--grep "product open"` 或 `--grep "true idle"` 分别执行两条。本套件使用锁定的 `@playwright/test` 和已有 Electron，不需下载 Playwright 浏览器。

Playwright `_electron` 启动 `product-main.cjs`，后者只配置隔离和被动观测，然后加载真实 `dist-electron/main/main.js`。窗口、preload、renderer、保存处理器和关闭协议全部由产品创建。每次测试新建独立临时目录、Markdown 文件、appData根与userData profile，先于产品单实例锁设置两条路径；不使用 `fishmarkTest`、不替换 BrowserWindow、对话框、保存结果或关闭确认。记录真实Electron appData/userData并精确断言分别等于owned临时根/profile，另断言 `file://` 构建入口；通过 CDP 已执行脚本重放及源码读取验证真实 preload 路径和构建源码，记录 SHA256。Electron41 的 getLastWebPreferences 不返回 preload 字段，不能据其缺字段判定未加载。`chromiumSandbox:true` 无绕过开关；这不改变产品当前的 renderer sandbox 设置，也不构成 RF903 安全验收。

基础持久化流程：

- 原生 `webContents.insertText` 编辑产品 CodeMirror，通过真实 File > Save 菜单回调保存，核验 UTF-8 字节、产品源文和 dirty=false；正常 BrowserWindow.close，等待拥有的进程 exit0，再用同一隔离 profile 和路径重启，核验准确读回。手动保存用例仅在独立 profile 中设置 idleDelay=60000ms。
- 独立 idleDelay=1500ms 用例；真实编辑后不调用 Save，先确认文件仍为原文且 dirty=true，再等真实计时器/保存完成。被动记录配置延迟的 setTimeout/clearTimeout、可信 input、窗口 blur、编辑器 focusout、可见性变化、保存键和实际 main 菜单/保存 IPC；保持编辑器焦点，断言 timer fired 到 save 的顺序、最少完整 idle 间隔、没有菜单/手动/blur 触发、最终 UTF-8 字节和 dirty=false。该观测包装保留原生 timer 的回调、参数和延迟，增加的日志开销不作为性能测量。

每次运行默认独立 `.artifacts/e2e/<UTC+UUID>/`；可设置单路径组件 `FISHMARK_E2E_RUN_ID` 指定唯一运行身份。保留 Playwright JSON/HTML、每次 launch 的 trace、截图、main JSONL、stdout/stderr、产品报告及断言错误，成功和失败都保留。启动前注册 main uncaught/unhandled/console.error 和 renderer console/preload/load/process 事件；Playwright 额外捕获 pageerror，renderer DOM 观测捕获 error/unhandledrejection。真实错误失败，警告和 stderr 原始日志仍保留，无新增已知失败白名单。Node 原生 warning 的事件身份与内部打印调用栈单独记录，避免把其默认 console.error 输出误认作应用异常；不按警告名称放行、不改变 listener 上限。

workers=1、retries=0，测试/启动/等待/清理都有有限超时；90秒 owned-instance watchdog 防止测试进程失败后产品遗留。记录真正 Electron main PID、app.getAppMetrics 后代 PID 和 creationTime，关闭后核验全部已退出。Windows Playwright 的 ChildProcess 是命令 shell；失败清理先退出自身产品，必要时通过仍活着的 owned launcher `/PID /T /F` 清理自身进程树，不能仅 kill shell；其他平台使用自身进程组。不按程序名或全局 PID 列表杀进程，不盲杀可能复用的历史 PID；进程仍活着时保留其目录并报告失败，确认退出后才移除自身临时目录。递归删除前核验 realpath 目标严格位于创建时捕获的临时根下，且是 `fishmark-rf902-` 开头的自身直接子目录。正常关闭成功时不通过强制退出取得通过。macOS 关闭最后窗口后还会执行正常 app.quit；该分支尚需平台实测。

第三条用`--grep "forced-exit recovery"`选择：原生编辑后等待真实apply处理器成功完成，确认精确恢复日志和原始文件未保存，从外部强制结束所属进程树；同一profile重启不传文档路径，核验完整恢复文档/dirty/版本身份，再继续原生编辑、真实菜单保存和正常退出。记录强制退出与正常退出的差异，保存终止前后恢复文件原始字节及hash。该流程发现合法小数文件时间戳被解析器拒绝，修复和基线FAIL→修后PASS见[报告032](../../reports/task-summaries/TASK-RF902-RECOVERY-032.md)。

`cross-window.spec.mjs` 增加真实标签点击、同窗排序、分离、Escape 取消、浏览器捕获丢失、最后编辑 ACK 延迟以及目标提前关闭/15秒未就绪超时。普通拖动由 Playwright Chromium 鼠标/键盘产生可信事件，明确不是 OS SendInput。Windows 两项另用 `windows-pointer-drag.ps1`：核验 HWND/PID、点击命中与鼠标捕获后跨出顶层窗口，使用 SetCursorPos/SendInput 释放；再核验正文、光标、归属、后续插入、真实保存和正常退出。它需要可交互 Windows 桌面、DPR1 和能容纳测试窗口的屏幕，不静默跳过不满足的环境。仅操作临时 FishMark 窗口，恢复鼠标位置；本机执行包装另记录/恢复原前台及可验证键盘布局。

ACK 故障屏障在真实 edit 处理器完成后暂缓其响应；B 输入仍走原生编辑，真实标签分离必须等待 A/B/flush 完成。未就绪屏障同时等待目标窗口首次 watch-sync 与 snapshot 原处理器，避免另一注册路径提前触发 ready；不替换返回值、不缩短产品15秒超时。释放屏障仍执行原处理器，已销毁目标会真实拒绝。故障用例逐项匹配精确 sender/channel/tab/message/count=1、对应完整 main 错误和 stderr 行，原始日志不删，其余错误仍失败。这是明确故障的预期结果断言，不修改 Vitest known-failure 清单。

拖到已有窗口的原生用例保留原产品的“分离到新窗口”行为；修改前目标 renderer 只读本地 drag ref，没有跨窗口接收入口。本批不增加“合并到已有窗口”交互，底层 move API 不等同于完成该真实用户流程。独立审查和基线失败记录见[报告033](../../reports/task-summaries/TASK-RF902-TRANSFER-033.md)。

`recovery-faults.spec.mjs` 增加四项，可用 `--grep "recovery fault"` 选择：截断尾行、完整坏行、单文档失败后其他文档独立恢复、退出期间原路径被外改。先由产品生成真实 ACK 恢复记录并确认所属进程退出，再只改该临时目录中的数据。前三项确认一次真实恢复通知、源文/dirty、原始 snapshot/journal 成对保全、新编辑保存，以及正常退出后原始对仍未改写；离线外改确认普通保存返回精确冲突且不覆盖磁盘，再点击现有重载按钮并继续编辑保存。详情与失败基线见[报告034](../../reports/task-summaries/TASK-RF902-RECOVERY-FAULTS-034.md)。

Windows 恢复提示测试需要现有 `pwsh.exe`（PowerShell 7）和可交互桌面，不修改执行策略。`windows-recovery-dialog.ps1` 读取被动观测事件，验证单一 isolated profile、活进程可执行文件/启动时间、owned HWND 与完整题文，随后点击真实确定控件并验证关闭。Electron 的 TaskDialog 外层 caption 可能为 `Error`，标题正文通过 UIAutomation 树精确核验；特定 `CommandButton_1` 同时须对应所属进程可见可用的 native Button。它不伪造恢复结果、不替代弹窗。无通知或 helper 错误不能使测试通过。前三项为平台标记 Windows 用例；本机 Windows 完整运行必须无 skip。

单文档回放失败用例还要求该次启动的精确 `console.warn` 诊断（完整实际 tab ID）与 stderr 同行各出现一次；分类副本只扣除此已证明来源的一行。原始日志保留，同文 `console.error`、重复诊断及其他错误仍失败。它不改变 Vitest 已知失败名单，也不能替代源文/弹窗/保存断言。

实际执行和 CI 目标是 Windows。Linux/macOS、OS IME、已有窗口合并移动、实际断电/fsync 耐久性仍未由本套件验收。退出后修改原始文件是明确故障注入，不等于捕捉真实写入中断瞬间；M9 依赖和 RF902 整体状态不因局部覆盖改变。既有 workspace-safety 关闭协议和 Vitest 严格基线不变。

## RF902 运行中后台标签外改与原生关闭

`external-changes.spec.mjs` 在同一真实产品窗口打开两个临时文件。File 对象来自 Chromium 原生 file-input 后端，通过合成 drop 事件交给原产品入口；不声称执行了 OS 拖拽。B 活动期间由测试直接改写 A 的磁盘文件，要求真实 watcher 通知发生在切回 A 之前、B 的正文和磁盘不变。干净 A 保留旧文与冲突提示，明确重载后采用外部内容并继续编辑保存。脏 A 必须实际仍为 dirty 且磁盘未被提前 autosave，再验证草稿与外部版本同时保留；真实窗口关闭选 Save 要返回 disk-version-conflict 并保持窗口/编辑器，Cancel 后继续输入，最后明确选择保留当前编辑才允许保存覆盖。

`close-save.spec.mjs` 通过真实 Windows Unsaved Changes 提示覆盖 Cancel→继续编辑→Save→正常退出/重开，以及 Don't Save→原磁盘不变→重开不恢复被丢弃草稿。`windows-close-dialog.ps1` 只读取本次 telemetry，绑定 immediate owned temp profile、活 PID/可执行文件/启动时间和实际提示参数；在同 PID 的唯一 native dialog 中以 UIAutomation 精确核对完整正文，再核验所属 native Button 的标题、可见/可用、父子关系，定向 BM_CLICK。它不替代 Electron dialog，不发送全局键鼠，不修改系统设置。辅助函数同时断言原 showMessageBox 返回的真实 response；缺提示、题文不符、歧义及任何 helper 失败均失败。用例保留平台标记，本机完整 Windows 运行不得 skip。

`product-main.cjs` 仅被动记录原生提示/真实返回值、watcher 通知、close 与 conflict-resolution IPC，全部调用原处理器。普通保存因已知冲突会进入 Save As，因此拒绝原路径覆盖的真实流程由 Close→Save 验证。关闭提示触发的失焦不应启动尾随自动保存；已确认关闭仍保持 editor sealed，迟到保存不得越过关闭决定。已有关闭前保存的 FIFO、安全守卫和其它错误检查保留，Cancel/error 后原自动保存调度恢复。这里验证顺序明确的外部改写，不证明“版本检查至 rename 期间”的外部并发写入具有原子 compare-and-swap 保障，也不替代全部 RF902/M9 验收。

## RF902 嵌套键盘与选区整合

`nested-editing.spec.mjs` 补三条 Windows 产品整合流程，不重复独立 controller 的 formal121/editing79 矩阵：引用内嵌套子树 Tab/Shift+Tab→undo/redo→保存后 undo/redo；三层列表 Enter→空项 Backspace→完整 undo/redo；列表内 strong 开头源码边界、反向选区删除、真实 source/WYSIWYM 与 F11 shell 切换后首次 undo/redo。每组通过原 File Save 保存并重开精确字节。F11 shell 与 editor source/WYSIWYM 是两个独立控制，不将阅读 shell 当作只读。

输入使用 Playwright 的可信 Chromium 键盘事件与真实产品 UI，未直接调用 controller、编辑器 state dispatch 或测试 bridge；不声称物理 OS 键盘/IME 通过。选区设置也走 source mode 的真实键盘，并在切回所见模式后复核。观测仅支持这些短、完整渲染且没有源文替换 widget 的 fixture：每个 checkpoint 必须先将所有 `.cm-line` 文本按物理换行重建并与 main canonical 源文完全一致，再在所属行计算 DOM anchor/head；不能把单行 Range 长度或按键次数当作多行源码位置。编号证明、截图、main ACK、保存结果与正常退出保留；该方法不推广到虚拟化大文档或图片/表格 widget。

首次原生 undo 反向选区的断言保持严格。后续 undo→redo→undo 的光标按已安装 CodeMirror commands6.10.3 的历史规则另列，不能假定每次都恢复首次选区。原 baseline01 对第二次 undo 期待原反向范围而失败，正文正确；同版本依赖独立对照（无 FishMark、UI、模式切换）及依赖源码解释后，修正前瞻协议，在 source/F11 切换后直接核验首次 undo 恢复原反向范围，再单独核验重复历史的单点位置。原失败不重标，产品代码未因此修改。证据与边界见[报告040](../../reports/task-summaries/TASK-RF902-NESTED-KEYBOARD-040.md)。

## 多空行导航与编辑

`blank-navigation.spec.mjs` 四组真实Windows产品流程验证原折叠规则下已可见空行在Up/Down、Shift选区和鼠标定位时可达，隐藏行不会因普通导航被意外激活；同时覆盖输入、原paragraph Backspace契约与undo/redo、source逐物理行双向导航、保存重开、CRLF原字节及300段长文档滚动。短样本先要求全部DOM物理行与main canonical一致，再计算anchor/head和准确选中文本；长样本只测可见唯一末段的内容坐标，不将局部DOM当全篇偏移。隐藏行直接定位的既有编辑例外、Enter生成和CRLF归一化均保留。前轮较宽候选已撤回，未覆盖历史Typora oracle或formal校准；原失败与最小方案见[报告042](../../reports/task-summaries/TASK-BLANK-NAVIGATION-042.md)。

## 文档标签阅读位置

`tab-viewport.spec.mjs` 四组产品流程使用临时文档与独立双路径配置：长A→空白B→A；两长文档独立阅读位置、快速往返、source/WYSIWYM及关闭重开；返回后新滚动意图与视口上方延迟图片实际增高；实际最小窗宽下的表格重挂载。最后一组记录原生minimum/bounds/contentSize，等待实际客户区宽度和虚拟化widget挂载后定位；当前Windows外窗900×800、客户区884×735，不把被钳制的760px请求当作真实尺寸。断言可见唯一源码段落及其相对scroller位置，允许1px舍入差，不以scrollTop相同代替阅读位置稳定。canonical与磁盘全文、dirty均单列验证；离屏caret通过实际插入后的准确canonical偏移验证并undo，不拼接虚拟化DOM计算全篇偏移。

图片先确认实际请求、挂载以及相对阅读段落的位置，再在返回后的新滚动位置释放本地HTTP响应，要求自然高度0→900px和阅读锚点稳定；该流程不声称位于视口内部的图片解码不会重排后续正文。资源load/尺寸与六次two-rAF几何采样是本用例的布局证据，不等同compositor或全平台性能。原File New菜单和可信Chromium点击/滚轮用于导航；第二文档通过native-backed File及既有drop入口打开，不冒称Explorer拖放或OS文件关联。controller单测另锁住无frame/timer的立即再次捕获，renderer单测同时覆盖active/inactive关闭后的同key缓存清理。[报告043](../../reports/task-summaries/TASK-TAB-VIEWPORT-043.md)保留原始失败及边界。

## RF903 sandbox 与 CSP

`sandbox.spec.mjs` 验证真实产品窗口配置、对应 renderer PID 的 Windows OS sandbox metric、隔离桥和精确执行 preload 字节，并覆盖本地文档图片、community 主题 CSS 与 full GLSL/纹理、保存重启。[报告035](../../reports/task-summaries/TASK-RF903-SANDBOX-035.md)记录原始 sandbox=false 基线及本批边界；不能只把 fixture 的 `chromiumSandbox:true` 当作产品 sandbox 已通过。

`csp.spec.mjs` 可用 `--grep "CSP blocks"` 选择。在真实生产 renderer 注入内联脚本、事件属性、预览协议 `.js`、eval、独立本地 HTTP script 和 fetch，逐项核验六条真实 securitypolicyviolation 的 directive/blockedURI/enforce、未执行 marker 和 HTTP server 请求0。eval 用 CDP `allowUnsafeEvalBlockedByCSP:false`，要求实际 EvalError；普通 Playwright evaluate 不作为 eval 拒绝证据。custom-protocol `.js` 必须有明确 CSP violation，不能因既有 MIME 拒绝而通过。测试随后仍执行原生编辑、真实 File > Save、精确字节与正常退出。

预期 CSP console 错误只按本次 launch 的实际 webContentsId、完整实际消息和精确次数1登记，再由健康检查逐条匹配。其他错误仍失败；原始日志保留，没有全局 CSP 错误豁免，也不改 known-failure 名单。旧发布构建的同一内联 canary 实际执行，失败基线保留在 `.artifacts/rf903-csp/`。

`csp-resources.spec.mjs` 可用 `--grep "CSP preserves"` 选择：真实 Mermaid SVG、KaTeX 数学和已加载字体，data 与独立 HTTP fixture 图片的自然尺寸及精确请求，随后编辑保存退出。现有 `--grep "sandbox keeps"` 主题用例也在生产 CSP 下验证本地 CSS、shader、纹理、图片及保存重启。这两条新 CSP 用例属于常规产品 E2E，不用临时脚本代替最终套件。

生产策略只允许 self 脚本；开发 canonical 产品入口额外允许锁定 React 插件的精确受信 preamble SHA256、同源请求和最终端口的 localhost HMR WebSocket，不允许任意内联 hash 或 unsafe-eval。`renderer-csp.test.ts` 检查真实 Vite 转换/构建的最早 meta、策略漂移、恶意 inline 不获授权、5173/5174、Refresh 改动及未知 HMR 端点拒绝；独立 probe HTML 不自动获得产品入口的脚本授权。

本机有界开发补充脚本在 `.artifacts/rf903-csp/dev-proof.mjs`，由协调方串行运行并恢复桌面：保留唯一 runId，隔离 appData 后两次验证产品实际 userData，检查 editor/workbench 的真实精确 WebSocket、同文档 HMR，以及 editor 原生编辑保存与自定义主题 CSS。它不加入常规 suite，不与其他 Electron 或固定端口任务并行。早期 dev01/02 漏 appData 隔离且未记录真实getPaths，共享 FishMark-dev路径由源码事后推导；文件时间变化不能证明首次创建，两个临时seed的recent/lastOpened确认列表更新。没有运行前profile或保存IPC观测，不能排除既有会话恢复或自动保存，未删或回滚。它们不计验收，正式开发证据仅用dev03。gates02产品只断言userData，gates03产品已实际双路径owned但其旧三个probe仍未完整隔离；最终gates04九项全部通过，产品20/20、27次实际双路径owned、全部退出且cleanup0，不混用历史边界。

本批九项门禁实际使用的 editing、workspace-safety、formal 父runner接入 `run-isolated-electron-probe.mjs`/`electron-probe-isolation.cjs`，其他旧probe未扩范围。父创建real临时根下的owned目录与独占registry，child在app ready前官方设置appData/userData，并在配置、ready、loaded、before-exit记录实际路径及main/app metrics PID/creationTime；safety在真实production main加载后再核验。父复用有限时长processlauncher，所有拥有PID退出后才guard realpath/parent/prefix清理成功profile，失败保留profile及外部sidecar。metric PID只观测不杀，PID复用可保守失败；不以unit mock记录替代真实证据，最终汇总仅取三个实际日志引用的精确sidecar。可用 `FISHMARK_PROBE_ISOLATION_EVIDENCE_DIR` 指定这三个真实probe的证据目录，缺协议的child会拒绝启动；不要绕过父runner直接启动它们。11项契约、三真实目标及gates04中相同入口均通过，每实际probe各4真实成员、多阶段实际路径匹配、全部退出并清理成功；全门禁/独审/发布记录见[报告036](../../reports/task-summaries/TASK-RF903-CSP-036.md)。

CSP不授予或撤销文档/主题路径权限。main授予资源根、realpath/symlink边界、生命周期撤销及授权来源仍是后续 RF903 最小批次；本批不宣称已经解决 renderer 提交路径的现有能力，也不改变 RF902 正式剩余清单。

# RF902 实际产品持久化 E2E

先执行 `npm ci`、`npm run build`，再执行 `npm run test:e2e`。只列用例、不启动 Electron：`npm run test:e2e -- --list`。可用 `--grep "product open"` 或 `--grep "true idle"` 分别执行两条。本套件使用锁定的 `@playwright/test` 和已有 Electron，不需下载 Playwright 浏览器。

Playwright `_electron` 启动 `product-main.cjs`，后者只配置隔离和被动观测，然后加载真实 `dist-electron/main/main.js`。窗口、preload、renderer、保存处理器和关闭协议全部由产品创建。每次测试新建独立临时目录、Markdown 文件和 userData，先于产品单实例锁设置 profile；不使用 `fishmarkTest`、不替换 BrowserWindow、对话框、保存结果或关闭确认。断言 profile 和 `file://` 构建入口；通过 CDP 已执行脚本重放及源码读取验证真实 preload 路径和构建源码，记录 SHA256。Electron41 的 getLastWebPreferences 不返回 preload 字段，不能据其缺字段判定未加载。`chromiumSandbox:true` 无绕过开关；这不改变产品当前的 renderer sandbox 设置，也不构成 RF903 安全验收。

三条流程：

- 原生 `webContents.insertText` 编辑产品 CodeMirror，通过真实 File > Save 菜单回调保存，核验 UTF-8 字节、产品源文和 dirty=false；正常 BrowserWindow.close，等待拥有的进程 exit0，再用同一隔离 profile 和路径重启，核验准确读回。手动保存用例仅在独立 profile 中设置 idleDelay=60000ms。
- 独立 idleDelay=1500ms 用例；真实编辑后不调用 Save，先确认文件仍为原文且 dirty=true，再等真实计时器/保存完成。被动记录配置延迟的 setTimeout/clearTimeout、可信 input、窗口 blur、编辑器 focusout、可见性变化、保存键和实际 main 菜单/保存 IPC；保持编辑器焦点，断言 timer fired 到 save 的顺序、最少完整 idle 间隔、没有菜单/手动/blur 触发、最终 UTF-8 字节和 dirty=false。该观测包装保留原生 timer 的回调、参数和延迟，增加的日志开销不作为性能测量。

每次运行默认独立 `.artifacts/e2e/<UTC+UUID>/`；可设置单路径组件 `FISHMARK_E2E_RUN_ID` 指定唯一运行身份。保留 Playwright JSON/HTML、每次 launch 的 trace、截图、main JSONL、stdout/stderr、产品报告及断言错误，成功和失败都保留。启动前注册 main uncaught/unhandled/console.error 和 renderer console/preload/load/process 事件；Playwright 额外捕获 pageerror，renderer DOM 观测捕获 error/unhandledrejection。真实错误失败，警告和 stderr 原始日志仍保留，无新增已知失败白名单。Node 原生 warning 的事件身份与内部打印调用栈单独记录，避免把其默认 console.error 输出误认作应用异常；不按警告名称放行、不改变 listener 上限。

workers=1、retries=0，测试/启动/等待/清理都有有限超时；90秒 owned-instance watchdog 防止测试进程失败后产品遗留。记录真正 Electron main PID、app.getAppMetrics 后代 PID 和 creationTime，关闭后核验全部已退出。Windows Playwright 的 ChildProcess 是命令 shell；失败清理先退出自身产品，必要时通过仍活着的 owned launcher `/PID /T /F` 清理自身进程树，不能仅 kill shell；其他平台使用自身进程组。不按程序名或全局 PID 列表杀进程，不盲杀可能复用的历史 PID；进程仍活着时保留其目录并报告失败，确认退出后才移除自身临时目录。递归删除前核验 realpath 目标严格位于创建时捕获的临时根下，且是 `fishmark-rf902-` 开头的自身直接子目录。正常关闭成功时不通过强制退出取得通过。macOS 关闭最后窗口后还会执行正常 app.quit；该分支尚需平台实测。

第三条用`--grep "forced-exit recovery"`选择：原生编辑后等待真实apply处理器成功完成，确认精确恢复日志和原始文件未保存，从外部强制结束所属进程树；同一profile重启不传文档路径，核验完整恢复文档/dirty/版本身份，再继续原生编辑、真实菜单保存和正常退出。记录强制退出与正常退出的差异，保存终止前后恢复文件原始字节及hash。该流程发现合法小数文件时间戳被解析器拒绝，修复和基线FAIL→修后PASS见[报告032](../../reports/task-summaries/TASK-RF902-RECOVERY-032.md)。

`cross-window.spec.mjs` 增加真实标签点击、同窗排序、分离、Escape 取消、浏览器捕获丢失、最后编辑 ACK 延迟以及目标提前关闭/15秒未就绪超时。普通拖动由 Playwright Chromium 鼠标/键盘产生可信事件，明确不是 OS SendInput。Windows 两项另用 `windows-pointer-drag.ps1`：核验 HWND/PID、点击命中与鼠标捕获后跨出顶层窗口，使用 SetCursorPos/SendInput 释放；再核验正文、光标、归属、后续插入、真实保存和正常退出。它需要可交互 Windows 桌面、DPR1 和能容纳测试窗口的屏幕，不静默跳过不满足的环境。仅操作临时 FishMark 窗口，恢复鼠标位置；本机执行包装另记录/恢复原前台及可验证键盘布局。

ACK 故障屏障在真实 edit 处理器完成后暂缓其响应；B 输入仍走原生编辑，真实标签分离必须等待 A/B/flush 完成。未就绪屏障同时等待目标窗口首次 watch-sync 与 snapshot 原处理器，避免另一注册路径提前触发 ready；不替换返回值、不缩短产品15秒超时。释放屏障仍执行原处理器，已销毁目标会真实拒绝。故障用例逐项匹配精确 sender/channel/tab/message/count=1、对应完整 main 错误和 stderr 行，原始日志不删，其余错误仍失败。这是明确故障的预期结果断言，不修改 Vitest known-failure 清单。

拖到已有窗口的原生用例保留原产品的“分离到新窗口”行为；修改前目标 renderer 只读本地 drag ref，没有跨窗口接收入口。本批不增加“合并到已有窗口”交互，底层 move API 不等同于完成该真实用户流程。独立审查和基线失败记录见[报告033](../../reports/task-summaries/TASK-RF902-TRANSFER-033.md)。

实际执行和 CI 目标是 Windows。Linux/macOS、OS IME、外部冲突、已有窗口合并移动、断电与写入中断恢复仍未由本套件验收；M9 依赖和 RF902 整体状态不因局部覆盖改变。既有 workspace-safety 关闭协议和 Vitest 严格基线不变。

# RF902 实际产品持久化 E2E

先执行 `npm ci`、`npm run build`，再执行 `npm run test:e2e`。只列用例、不启动 Electron：`npm run test:e2e -- --list`。可用 `--grep "product open"` 或 `--grep "true idle"` 分别执行两条。本套件使用锁定的 `@playwright/test` 和已有 Electron，不需下载 Playwright 浏览器。

Playwright `_electron` 启动 `product-main.cjs`，后者只配置隔离和被动观测，然后加载真实 `dist-electron/main/main.js`。窗口、preload、renderer、保存处理器和关闭协议全部由产品创建。每次测试新建独立临时目录、Markdown 文件和 userData，先于产品单实例锁设置 profile；不使用 `fishmarkTest`、不替换 BrowserWindow、对话框、保存结果或关闭确认。断言 profile 和 `file://` 构建入口；通过 CDP 已执行脚本重放及源码读取验证真实 preload 路径和构建源码，记录 SHA256。Electron41 的 getLastWebPreferences 不返回 preload 字段，不能据其缺字段判定未加载。`chromiumSandbox:true` 无绕过开关；这不改变产品当前的 renderer sandbox 设置，也不构成 RF903 安全验收。

两条流程：

- 原生 `webContents.insertText` 编辑产品 CodeMirror，通过真实 File > Save 菜单回调保存，核验 UTF-8 字节、产品源文和 dirty=false；正常 BrowserWindow.close，等待拥有的进程 exit0，再用同一隔离 profile 和路径重启，核验准确读回。手动保存用例仅在独立 profile 中设置 idleDelay=60000ms。
- 独立 idleDelay=1500ms 用例；真实编辑后不调用 Save，先确认文件仍为原文且 dirty=true，再等真实计时器/保存完成。被动记录配置延迟的 setTimeout/clearTimeout、可信 input、窗口 blur、编辑器 focusout、可见性变化、保存键和实际 main 菜单/保存 IPC；保持编辑器焦点，断言 timer fired 到 save 的顺序、最少完整 idle 间隔、没有菜单/手动/blur 触发、最终 UTF-8 字节和 dirty=false。该观测包装保留原生 timer 的回调、参数和延迟，增加的日志开销不作为性能测量。

每次运行默认独立 `.artifacts/e2e/<UTC+UUID>/`；可设置单路径组件 `FISHMARK_E2E_RUN_ID` 指定唯一运行身份。保留 Playwright JSON/HTML、每次 launch 的 trace、截图、main JSONL、stdout/stderr、产品报告及断言错误，成功和失败都保留。启动前注册 main uncaught/unhandled/console.error 和 renderer console/preload/load/process 事件；Playwright 额外捕获 pageerror，renderer DOM 观测捕获 error/unhandledrejection。真实错误失败，警告和 stderr 原始日志仍保留，无新增已知失败白名单。Node 原生 warning 的事件身份与内部打印调用栈单独记录，避免把其默认 console.error 输出误认作应用异常；不按警告名称放行、不改变 listener 上限。

workers=1、retries=0，测试/启动/等待/清理都有有限超时；90秒 owned-instance watchdog 防止测试进程失败后产品遗留。记录真正 Electron main PID、app.getAppMetrics 后代 PID 和 creationTime，关闭后核验全部已退出。Windows Playwright 的 ChildProcess 是命令 shell；失败清理先退出自身产品，必要时通过仍活着的 owned launcher `/PID /T /F` 清理自身进程树，不能仅 kill shell；其他平台使用自身进程组。不按程序名或全局 PID 列表杀进程，不盲杀可能复用的历史 PID；进程仍活着时保留其目录并报告失败，确认退出后才移除自身临时目录。递归删除前核验 realpath 目标严格位于创建时捕获的临时根下，且是 `fishmark-rf902-` 开头的自身直接子目录。正常关闭成功时不通过强制退出取得通过。macOS 关闭最后窗口后还会执行正常 app.quit；该分支尚需平台实测。

本批实际执行和 CI 目标是 Windows。Linux/macOS、OS IME、外部冲突、多窗口 move/detach、未 ACK 编辑和产品崩溃恢复尚未由本套件验收；M9 依赖和 RF902 整体完成状态不因这两条覆盖改变。既有 workspace-safety 关闭协议和 Vitest 严格基线不变。

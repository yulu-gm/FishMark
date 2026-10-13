# RF903：renderer sandbox 与单文件 preload

2026-10-13，YULUSTATION / Windows 11 / i7-13700K / 32GB / Electron41.2 / DPR1。重新 fetch 的官方 main 为 `ed67eb5f8c599c036076332679225f230e537e96`，tree `393379113680d634d58dd2e674e6bc0706994e6c`，开始时工作区干净。使用现有隔离工作区；不修改 OS 安全、网络、凭据或用户文件，不增加外部权限或依赖。

## 最小批次与实现

按用户授权由 astra-high 设计及独立审查、6.1 sol-high 实现。依据[RF903路线图](../../docs/refactor/editor-foundation/roadmap.md#rf-903-electron-security-hardening)和[安全缺口审查](../../docs/plans/2026-10-13-m9-acceptance-ledger.md#rf-903实现缺口与已有边界)，本批只启用 sandbox 并适配 preload。[Electron 官方 sandbox 文档](https://www.electronjs.org/docs/latest/tutorial/sandbox)说明沙箱 preload 的受限 require 无法加载任意本地 CommonJS 模块，因此不能只翻配置布尔值。

所有 runtime-manager 窗口设置 `sandbox:true`，保持 `contextIsolation:true`、`nodeIntegration:false`。现有产品／editor-test／test-workbench typed bridge 及 main sender/frame/mode/tab 边界不变。现有 Vite 将 preload 与本地共享代码打为单个 `dist-electron/preload/preload.js`，唯一运行时外部模块为 `electron`；不加入通用 invoke、Node 或测试能力到产品页面。构建契约拒绝 Node/bare 模块输入，并检查单文件、无动态分块和实际 require。

main TypeScript 与 watch 的输出不再包含 preload；独立 noEmit 配置检查 preload 类型，bundler 独占最终目录。生产构建、开发准备及开发 watch 均使用同一配置，打包文件清单包含相同产物。隔离 watch 实验已验证初次构建与本地依赖变化后的重建：唯一 preload.js、electron 外部依赖、产物哈希随变更变化，watcher 正常关闭。打包脚本／清单契约检查不等于安装包或 ASAR 的实际动态验证；本批未运行安装包。

## 同协议产品证据

修前 `rf903-sandbox-baseline-01` 启动已发布构建，真实窗口配置 `sandbox:false`，对应 renderer PID 的 Windows `app.getAppMetrics()` 为 `sandboxed:false`、integrity `medium`。相同 sandbox 断言失败；页面未暴露 Node 并不能替代 OS sandbox。这份基线的报告、trace、截图和原始失败保留。

修后统一产品 fixture 对主窗和观察到的分离窗口验证：配置 sandbox=true、对应 renderer PID 的实际 Windows metric sandboxed=true、main argv 无 `--no-sandbox`，页面无 require/process/ipcRenderer/fishmarkTest，产品桥可用。通过 CDP 获取真实执行脚本，要求唯一脚本包含完整 preload 构建字节，并对应非默认隔离上下文；保留脚本与构建哈希、上下文和进程指标，不能用存在文件或桥可调用替代来源证明。

新增两条真实产品用例：沙箱内编辑／保存，以及隔离 community 主题与文档资源兼容。后者检查本地 SVG 可见且自然尺寸20×16、主题 CSS 已生效、GLSL+纹理的实际主题表面处于 full 而非 fallback、真实资源协议响应的 shader/SVG 字节精确一致，再编辑保存、正常退出和重启读回。测试没有修改系统主题或用户目录。

开发过程保留：target01 两例在旧 CDP 文件名匹配超时，实际产品已加载；Electron 沙箱以匿名包装执行 preload，改为完整执行字节与隔离上下文验证。target02 沙箱、图片、CSS和实际full主题已通过，但 Chromium Resource Timing 未完整列出自定义协议资源；改用真实响应精确字节并保留原资源观测，不修改产品或扩大任何安全白名单。target03 两例通过。早期构建测试的执行环境 EPERM、Vite 返回数组／resolver顺序及测试清理 lint 失败同样保留在 `.artifacts/rf903-sandbox/`。

## 门禁与剩余范围

冻结代码的九项门禁全部通过：lint、typecheck、build；strict **3761通过＋8 exact known**，0unexpected/skip/collection/hook/unhandled，名单未改；产品 E2E **18/18**，0skip/flaky；foundation310、editing79、workspace-safety7；正式行为 **121/121、2541 targets**（99既有known-defect）；renderer gzip **1,435,693 / 1,500,000 B**，预算未改。原日志里的既有MaxListenersWarning和预期IPC拒绝原样保留，不宣称所有日志无警告或无拒绝。

最终产品运行 `.artifacts/e2e/rf903-sandbox-final-01/`：25次启动全部退出，清理错误0；29份主窗／已就绪分离窗观察均匹配renderer PID、OS sandboxed=true、integrity untrusted。2026-10-13T12:04:34Z核验前台及输入布局恢复，无遗留测试进程。`product-final-summary.json`保存汇总和main入口/preload/index/lock的测试后哈希一致性；这些入口指纹不等于整个main模块树的哈希。门禁、定向53项与最终bundle10项、watch证明、独立签核、精确提交 CI 见本机 `.artifacts/rf903-sandbox/` 的交接与发布记录。本报告不把修前失败、开发期定向通过或静态打包契约当作整个 RF903 验收。

RF903 仍 IN_PROGRESS，M9 0/3。CSP、main 授予的文档／主题资源根、realpath与symlink边界、关闭／移动／卸载后的撤销、IPC路径授权来源和组合负例仍开放。尤其 renderer 提交的 targetPath、clipboard documentPath 或临时图片偏好不能直接成为新增资源根授权；本批没有把这些路径统一加白，也未宣称修复现存任意路径能力。后续按独立最小批次处理。

RF902 保持未验收，本轮暂停其源码工作。正式剩余来源为[路线图 RF902](../../docs/refactor/editor-foundation/roadmap.md#rf-902-playwright-electron-data-safety-and-editing-suite)与[报告034](TASK-RF902-RECOVERY-FAULTS-034.md#正式剩余项与额外建议)：运行中 inactive-tab 外改拒写；已有窗口 move 用户入口；关闭提示尚未全部进入产品 E2E；嵌套键盘／源文／选区／undo；平台 IME 指引和证据。已验证的保存重启、idle、detach／取消／失败恢复、崩溃与四项恢复故障不重复施工。RF901 PAUSED；cp13/cp16 与 Library 阻塞未触碰。

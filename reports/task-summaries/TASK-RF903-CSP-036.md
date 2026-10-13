# RF903：生产与开发 renderer CSP

2026-10-13，YULUSTATION / Windows 11 / i7-13700K / 32GB / Electron41.2 / DPR1。源码基线为 `2f4866234affb0683785d674b13d72f65030db7a`；本批开始时工作区干净。按用户授权继续 RF903 的 CSP 最小批，保留[报告035](TASK-RF903-SANDBOX-035.md)已发布的 sandbox 与单文件 preload。本批实施和最终独立审查使用用户最新指定的 gpt-6.1-sol。最终 gates04 九项门禁、实际双路径隔离证据及独立源码/证据审查通过；gates02/03、早期隔离失败及其边界原样保留。最终文档经同模型审查后按授权普通推送 main，精确发布结果以本机 publication/handoff 记录为准。

## 实现与允许的资源

生产 `src/renderer/index.html` 在 head 最早位置声明 CSP，Vite 的最终 HTML 转换将其放到注入的 script、link、style 之前。策略为：

```text
default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' fishmark-asset://preview; img-src 'self' fishmark-asset://preview data: http: https:; font-src 'self' fishmark-asset://preview data:; connect-src fishmark-asset://preview; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
```

`script-src 'self'` 保留构建模块和实际按需加载；不授予内联脚本、事件属性或 eval。样式允许应用、CodeMirror 和主题需要的内联样式及本地主题 CSS。图片保留本地预览协议、data 图片及既有 HTTP/HTTPS Markdown 图片；字体保留构建字体、主题字体和 Vite 内联 data 字体。`connect-src` 只允许现有预览协议，为主题 GLSL 与纹理读取提供兼容；不因此授予新的文件路径能力。没有任意 script/network 通配符或 `unsafe-eval`。

开发模式额外允许同源模块请求和实际最终配置端口的 `ws://localhost:<port>`。React Refresh 只获得锁定插件导出的精确 preamble 字节的 SHA256 授权，使用其实际 resolved base；不扫描任意 HTML 内联内容生成允许哈希，不使用可重复的静态 nonce。Vite 以 CommonJS 加载本项目配置，而 React6 的 CommonJS callable wrapper 不带 `preambleCode`，因此配置通过原生动态 import 读取插件的 ESM 导出。实际注入内容须恰好匹配一次，否则构建转换失败。未知 HMR 主机、协议或不同端口配置拒绝，不能静默改成广泛 WebSocket 来源；禁用 HMR 时不加入 refresh 哈希或 WebSocket。

插件只处理 resolved root 的 canonical `index.html`，editor 与 test-workbench 使用同一入口；独立 probe HTML 保留既有测试入口合同。本实现不是任意 HTML sanitizer，也不声称独立 probe 页都获得同样 CSP。canonical 元标记缺失、改动或重复均拒绝，源码策略与模块常量通过测试防漂移。生产构建不带开发 hash、nonce、localhost 或 WebSocket 权限。

## 真实产品正负例

修前 `rf903-csp-baseline-01` 在上批真实已发布产物中插入同一内联 canary；其 marker 实际变为 true，预期“未执行”断言失败。原始报告、trace、截图、入口指纹及桌面恢复证据保留。该基线仍使用已启用 sandbox 的产品，说明 sandbox 本身不替代 CSP。

修后 `rf903-csp-target-02` 验证六次实际 `securitypolicyviolation`：内联 script、事件处理器、预览协议 `.js`、eval、独立本地 HTTP script 和 fetch。逐项核验有效 directive、blockedURI、enforce 状态及未执行 marker；eval 通过 CDP 设置 `allowUnsafeEvalBlockedByCSP:false`，返回真实 `EvalError`，不把普通 Playwright evaluate 的调试器权限当作 eval 拒绝证据。独立 HTTP server 请求计数为0，阻断发生在网络读取前。custom-protocol 脚本有明确 `script-src-elem` CSP violation，不能将其既有 MIME 限制当作 CSP 证明。继续原生编辑、实际 File > Save、精确磁盘字节和正常退出均通过。

这类负例只在本次 launch 按实际 webContentsId、完整实际 console message、次数1记录预期拒绝；其余 main、renderer、pageerror、stderr 错误仍失败。原始日志完整保留，没有全局放行 CSP 错误或调整 Vitest known-failure 清单。target01 已通过实际阻断、eval、console 和网络0，但 blockedURI 期望与 Chromium 实际格式不同而失败；按真实 custom scheme `fishmark-asset` 和完整 HTTP URL 修正精确断言，保留该次失败。

已有主题正例在 CSP 下通过：文档本地 SVG 可见且自然尺寸20×16、community 主题 CSS 实际生效、GLSL/纹理主题表面处于 full、预览协议响应字节精确一致，随后保存并重启读回。`rf903-csp-resources-01` 的新增正例也通过：真实 Mermaid SVG、KaTeX 数学与已加载 KaTeX 字体、data 和 HTTP 图片均可用，图片自然尺寸20×16，独立 HTTP fixture 只收到预期资源请求，再继续编辑保存退出。两项新增 CSP 用例进入常规产品 E2E 套件。

## 开发验证与隔离首失

**早期开发探针的隔离失败必须保留。** dev01/02 只设置 userData，未隔离 appData；产品开发入口会重新设置开发 userData。首两次没有记录实际 Electron getPaths，共享目录 `C:\Users\wuche\AppData\Roaming\FishMark-dev` 是事后依据生产源码推导，不能冒充当时的实际路径断言。现有 recent-files.json、recovery-snapshot.json 的创建/修改时间落在运行窗口，recovery journal 和 Chromium Preferences/DIPS 时间也变化；文件可能曾被原子替换，不能据 birthtime/mtime 断言此前不存在或首次创建。最近列表含两个 owned 临时 seed 文档及其 lastOpened，证明列表更新，但初始字节未知。dev01 的 UTC 运行窗口为2026-10-13T12:42:41.414Z–2026-10-13T12:42:48.113Z，dev02 为2026-10-13T12:43:43.584Z–2026-10-13T12:43:45.952Z。

没有运行前 profile 快照，也没有完整保存 IPC 观测。两次虽然都在显式原生插入/File > Save 之前失败，但不能据此断言没有恢复用户原文档或没有自动保存。只读审计时的 recovery snapshot checksum 有效、sessions=0，仅描述当前状态，不推断运行前也没有会话；8条非本次临时文档的 recent 记录只保存路径哈希，没有读取正文。原应用 preferences.json 的时间未变化不能证明其他数据未受影响。已告知用户，保留 `dev-isolation-first-failure.json` 与最终[本机只读影响审计](../../.artifacts/rf903-csp/dev-impact-audit-02.json)，没有删除或回滚该目录；该本机审计的hash/checksum/runtime证明经6.1独立审查通过，但不消除未知的运行前状态。本机证据链接不随仓库提交。这两次探针不计入验收，不声称本批所有尝试均未改动用户数据。

正式开发证据仅来自修正后的 `rf903-csp-dev-03`：通过 Electron 官方 appData 路径设置把开发 profile 限定到每个 mode 的 owned 临时根，启动和最终阶段两次断言实际 userData 路径。editor/5173 与 workbench/5174 均真实启动、加载精确 CSP 和 React Refresh，对应 renderer PID 的 Windows sandbox metric=true、integrity untrusted。实际 HMR WebSocket 使用各自精确端口；修改 owned canary 文件后收到 update，值由 one 变 two，document identity、timeOrigin 和 navigation count 不变，证明没有以整页重载代替 HMR。editor 另验证自定义主题 CSS 生效、原生插入、真实 File > Save 和精确磁盘字节。

dev03 在正常退出后再检查所有 main/renderer/page/原始 stderr 错误，结果为空；拥有的 main、launcher、app metrics 后代 PID 与 creationTime 全部退出，两个 server 已关闭，随后才核验 realpath/root/owned prefix 并清理临时 profile，清理错误0。证据目录拒绝覆盖既有 runId；早期 Node stderr tee 与后续 child pipe 日志分开保留，前者不覆盖 Electron 原生启动写入来源。开发探针是本机有界补充，不在每次常规 E2E 中占用固定 Vite 端口。

## 本批三个实际探针的隔离补强

gates03九项通过，产品 E2E 的20例/27次启动实际 appData/userData 均 owned，不能据此说该轮所有 Electron 探针都双路径隔离。独立审查发现 editing/formal 共用的 offscreen 配置只设 Chromium switches，没有设置两条路径；workspace-safety 仅设 userData。gates03中这三个旧阶段已在默认 profile 配置下运行，UTC记录窗口为2026-10-13T13:00:22Z–2026-10-13T13:00:43Z；这些原始记录保留，不计为“所有探针双路径 owned”证据，也不把测试门禁通过推断成 profile 无影响。

按用户要求，修补仅限本批九项门禁实际使用的三个父 runner 和对应 child：editing、workspace-safety、formal。共享 test-only isolation helper 由父进程在 real temporary root 新建 owned 目录，提供精确 label/token/root/env 与独立进程注册表；child 在 app ready 前通过官方 setPath 设置 appData/root、userData/root/user-data，实际配置、ready、window-loaded、before-exit阶段记录并核验两条真实路径。workspace-safety 加入生产 main 加载后 product-ready 再核验，防止路径被重新设置。common offscreen helper 的其他调用者和生产 Electron/CSP 策略未改，没有推广到所有旧 probe。

父 runner 复用已有有限时长 process launcher，editing替换了原裸 spawn 的无超时等待。actual-path journal 与 Electron main/app metrics PID、creationTime、运行身份持久保存在 owned profile 外；父进程等待所有观测到的拥有 PID 退出，再核验 realpath、创建时父根和 owned prefix 后删除成功运行的目录。失败或未知身份保留目录与 sidecar。metrics PID仅用于存在性核验，不作为杀进程列表；PID复用会保守失败并保留 profile，不声称动态再次核验了复用 PID 的身份。进程注册表独占 owned root 并覆盖外部继承值，终止复用已有的 live-owned launcher tree流程。

新契约单元测试11/11通过，覆盖缺父协议、beforeReady双路径、多阶段/creationTime证据、配置后被覆盖、成功退出后才删除、非零退出留存、活PID仅观测不杀、缺阶段/错token/错path、escaped root拒删，以及真实有界 Node child 的继承注册表覆盖且不改 foreign registry。Node child 是明确的 unit simulation，不是 Electron产品证据。9个脚本语法、相关lint/Vitest类型检查通过。

真实 `.artifacts/rf903-csp/probe-target-01/summary.json` 中 editing79、safety7、formal121/121及2541 targets/99既有known-defect通过。每个实际 probe 的多阶段路径匹配、4个实际 PID/creationTime、全部退出、root删除与清理错误0均已验证。最终 gates04 再运行这三个相同入口，`.artifacts/rf903-csp/gates-04/isolation/` 的三个真实 sidecar 同样全部通过：各4个实际成员、required phases/token/实际路径匹配、processes gone、root removed、cleanup0。汇总只读取三个真实运行日志明确引用的精确 sidecarPath，不通配收集mock unit报告。

## 门禁、独立审查与发布记录

可靠的定向记录：CSP 配置测试7/7、定向 Vitest 类型检查/相关 lint 和生产 renderer build 通过；这些不能替代全部 TypeScript 配置或完整门禁。测试使用真实 Vite 转换与构建，覆盖生产最早元标记、按需模块/CSS、正常与 workbench 端口、额外恶意 inline 不获 hash、missing/changed/duplicate 元标记、refresh 字节变化拒绝、HMR 禁用和未知端点拒绝。首轮 React CJS/ESM interop、测试 hook 设置和 sandbox 内 Terser 解析失败保留；没有重装依赖或修改 lock。

完整 gates01 的 lint 通过，随后 typecheck 因 renderer composite 配置未包含新 CSP 插件脚本而触发 TS6307 失败，原日志保留。已仅将 `scripts/vite-renderer-csp.ts` 加入 `tsconfig.renderer.json` 的 include；Vitest 配置也显式包含该脚本。gates02之后先加强产品测试 bootstrap/fixture 实际双路径断言，gates03之后再按独立审查补强上述三个实际 probe；产品业务源码未因隔离补强改变。最终统一验证以 `.artifacts/rf903-csp/gates-04/` 与 `rf903-csp-final-04` 为准。

最终 `.artifacts/rf903-csp/gates-04/gate-results.json` 的九项门禁均 exit0；gates02/03的历史结果和原 gates01 失败均保留，不混用不同阶段的隔离证据：

| 门禁 | 最终状态 |
| --- | --- |
| lint / typecheck / build | 全部通过 |
| strict 回归及 exact-known 计数 | 3779 passed＋8 exact known；skip/unexpected/collection/hook/unhandled均0，名单不变 |
| 完整产品 E2E、启动退出与清理汇总 | final04 20/20；0skip/flaky，27次启动两实际路径均owned，全部退出、清理错误0 |
| foundation / editing / workspace-safety | 310 / 79 / 7，通过；实际三个probe隔离证据均通过 |
| formal cases / targets / 既有 known-defect | 121/121 cases、2541 targets；99既有known-defect，0unexpected/not-run |
| renderer gzip / 1,500,000 B 合同 | 1,435,693 / 1,500,000 B；initial 102,734 / 260,000 B，预算不变 |
| gpt-6.1-sol 独立审查 | 冻结源码、gates04真实证据及四份最终文档签核PASS，无未解决finding |
| 普通 main 发布与精确 SHA CI | 门禁及审查后按授权普通推main；精确SHA/CI以本机publication/handoff为准，不预写远端成功 |

gates02的历史结果为：strict3768 passed＋8 exact known，skip/unexpected/collection/hook/unhandled均0；foundation310、editing79、workspace-safety7；formal121/121、2541 targets、99既有known-defect、0unexpected/not-run；gzip1,435,693 / 1,500,000 B，initial102,734 / 260,000 B。产品 `.artifacts/e2e/rf903-csp-final-02/` 包含20份报告、27次启动（22次正常关闭、5次明确强制故障退出）和31份对应 renderer PID 的 sandbox=true/untrusted 观察；0skip/flaky，所有拥有的进程均退出、stillOwned=[]、清理错误0，4项main入口/preload/index/lock指纹匹配，2026-10-13T12:54:11Z前台/布局恢复。该次27次启动只断言 userData owned，appData 使用系统默认且未记录实际路径，因此不能当作新的双路径隔离验收。入口指纹不等于全部 main 模块树的哈希；既有警告、known-defect 和明确预期拒绝原样保留。

最终 `.artifacts/e2e/rf903-csp-final-04/` 包含20份报告、27次启动（22次正常关闭、5次明确强制故障退出）和31份对应 renderer PID 的 sandbox=true/untrusted 观察。all27实际appData/userData均owned，actualProductPathsFailures=[]，所有拥有进程已退出、stillOwned=[]、清理错误0。main入口/preload/index/lock的4项运行后指纹匹配；这些指纹仍不等于全部main模块树的哈希。最终 `.artifacts/rf903-csp/gates-04/product-final-summary.json` 保存产品与三个真实probe的准确汇总；2026-10-13T13:19:39Z前台与输入布局核验恢复。

本机原始证据位于 `.artifacts/rf903-csp/` 和各运行的 `.artifacts/e2e/`，旧失败不覆盖。冻结代码完整门禁和最终源码/证据审查通过；既有MaxListenersWarning、99 known-defect及明确预期IPC/CSP拒绝原样保留，不把通过表述成所有日志无警告或行为零缺陷，也不把本地通过当作已发布或远端CI成功。

## 状态与剩余范围

路线图 CSP 实现项已完成；RF903 整体仍 IN_PROGRESS，M9 0/3。main 授予的文档/主题资源根、路径来源授权、realpath/symlink 逃逸、关闭/移动/卸载撤销、IPC 能力及组合负例仍开放。CSP 不改变 renderer 提交 targetPath、clipboard documentPath 或临时图片偏好的信任来源，也没有收紧现有预览协议到授权根；路径批须单独处理。没有新增生产依赖、安全绕过开关或 OS/网络设置修改；早期开发 profile 的已述影响保留为实际例外。

RF902 的正式剩余项严格沿用[报告035](TASK-RF903-SANDBOX-035.md)列出的清单与既有来源，不增加验收 criteria、不因本批 CSP 验证而完成 RF902。RF901 继续 PAUSED；cp13/cp16 和 Library 阻塞未触碰。macOS 与安装包/ASAR 的实际动态证据仍不能由本机 Windows 或打包清单契约替代。

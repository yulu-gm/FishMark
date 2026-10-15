# RF903：窗口预览资源与主题生命周期（本地阶段）

2026-10-13，YULUSTATION / Windows 11 26200 / i7-13700K / 32GB / Node 24.13.0 / Electron 41.2.0。官方 main 基线 `ab740c15b20bd163b1eb89fc67484389f7a7549c`，tree `d7362655925fdd692ce3c8c884eb685b3002336b`；本批开始 fetch 后一致，初始工作区干净。DPR1 来自上一阶段已核验记录，本轮没有接管桌面重新测量。实施与独立审查按用户授权使用 gpt-6.1-sol high。

用户正在使用电脑。本阶段不接管前台，不发送原生按键或 IME 输入，不操作剪贴板，不捕获后恢复焦点，也不启动会显示窗口的产品或正式探针。上一批 IME 并发输入和更早的 FishMark-dev 隔离事故记录保留，未为本批调查、删除或回滚真实 profile。RF901、RF902、cp13/cp16 与 Library 保持原边界。

## 实施边界

每个 runtime 窗口由 main 创建唯一非持久 Session，加载前注册该 Session 的资源 handler，并由闭包绑定真实窗口。URL、header、referrer 和 renderer 提供的 owner 不发放权限。此方案证明窗口/Session 范围，不宣称每个 Request 都有可信 mainFrame 身份；原有 CSP、导航与新窗口限制保留。非持久 Session 会隔离 HTTP 缓存、cookies 和本地性能开关；业务偏好、最近列表与恢复数据仍由 main 持有。

同一 Session 的 file handler 限定为程序 index 与必要 assets；它检查实际文件仍位于该确切资源根，不能从 assets 的 junction 绕到 theme-packages。Electron 41.2 ASAR stat 的 inode 是合成值，不适合普通文件身份固定，[官方实现](https://raw.githubusercontent.com/electron/electron/v41.2.0/lib/node/asar-fs-wrapper.ts)明确区分归档与物理文件读取。因此本批将 renderer 的 dist 明确解包，入口、IPC 身份、协议和 builtin 主题共用 main 指定的物理目录；没有任意 .asar 路径例外或私有引擎 API。

文档资源来源为请求窗口仍拥有的 tabs 的 main canonical 文档目录，只允许图片类型；切活动 tab 不撤销仍拥有的其他 tab。历史图片查询也先检查绝对文档路径与 main 文件身份一致，再传入已验证路径；不一致的恢复路径不能附着历史文档授权，未保存 tab 的自身导图来源仍独立有效。关闭、移窗、Save As 或页面生命周期变化使旧来源失效，移出再移回仍不能复活旧请求。相同目录的另一个合法 tab 可以授权新请求。主题目录枚举只提供 metadata；权限来自 main 当前选中主题、实际模式和默认 fallback，切换/刷新撤销旧请求。停用效果拒绝 shader 文本，但 CSS、字体和图片仍属于当前主题的静态资源，因为 CSS 可以共享纹理。

新资源 URL 提供目录基址，供主题 CSS 的相对 font/image/import 引用使用；旧 query URL 仍必须经过同一来源检查。未知来源不能进入目标文件读取。已批准来源需要 canonical 包含检查与实际文件句柄身份核验，在读取正文前固定对象并在异步边界复核生命周期，finally 关闭句柄。文件系统并发改指可能触发外部 metadata 查询，不能把正文读取保护说成原子阻止一切 metadata I/O。撤销阻止未来响应，不能擦除 renderer 已合法取得并解码的字节。

## 临时图片来源与恢复

来源记录仅由 main 实际导入的精确临时图片产生，包含 canonical 路径和可靠物理身份，绑定 tab；保存后可延续到实际 main 保存的 canonical 文档。关闭后的记录本身没有窗口访问权，必须在 main 认可该文档并重新拥有 tab 后才能使用。不会扫描 Markdown 路径扩大授权，也不会开放整个临时目录。

记录进入现有 checksummed recovery snapshot 的 main metadata，不新增 capability 文件或 renderer 字段。缺少字段的旧 snapshot 仍有效；非法 metadata 不授予权限并沿既有机制保全原始恢复文件。图片 checkpoint 与已确认编辑共用现有队列，在队列执行时取得新 snapshot，避免旧 snapshot 截断新 journal。保存绑定的 RAM 事实在失败与并发 checkpoint 中保留，同一路径的新物理图片不能继承旧文档绑定。无导图的打开/保存不为此重写恢复快照；只有保存涉及自身 live 导图时才同步相关绑定与持久化。

磁盘提交与 IPC 返回不是原子事务。观察到授权失效时必须补偿移除新增来源；如果进程在写入与检查/补偿之间退出，可能保留 main 实际创建的图片事实。持续磁盘写失败或重试前退出不保证新保存绑定已经耐久化，不能宣称所有故障都已闭环。

没有可信历史记录的旧文档目录外临时图片，以及 ../shared 或其他目录外引用，仍需要明确的资源授权兼容方案。不能由 filename、默认临时目录或任意 Markdown 内容推定来源。本批不以全局目录放行掩盖这些未完成项。

## 验证与交接

执行连接一度中断，末次补丁调用审批超时，未据此重复写入。恢复后实际 PowerShell、git status/diff 和 fetch 成功，核对超时 helper 当时没有落盘，原 WIP 与本报告草稿保留；再由实施者完成 helper 与测试。首次 main typecheck 的旧 workspace 声明错误、首次 sandbox 下 Vite cache rename EPERM（0 collected）、fixture 将 owner 字段看成平级、测试类型/lint 错误均保留，修正后再验证。

定向9文件61/61、最后类端口复测1/1通过，使用真实 workspace class，覆盖 canonical 历史绑定负例、未保存来源、close/Save As/reload/theme 撤销、移窗返回 ABA、真实 junction 逃逸、读取前物理身份、保存重开与恢复、metadata 语义损坏及补偿/并发 checkpoint。profile 语义损坏使用重新计算后的有效 checksum，单字段负例没有以 duplicate-path 拒绝掩盖验证。

五项后台适用门禁通过：lint、完整 typecheck、build、strict regression、perf baseline。gates01 前三项 exit0；首次 strict 有1个新增架构失败，原因是新 main 测试导入 renderer。保留原失败，只移除该测试跨层依赖，架构/策略238/238、测试类型检查及该文件 lint 通过；冻结哈希确认仅此测试改变，生产代码和受测构建不变。gates02 重跑 strict 与 perf 均 exit0：**3861 passed＋8 unchanged exact known，0 unexpected/skip/collection/hook/unhandled/unresolved**；foundation310/310，正式 JS gzip **1435790/1500000**，initial **102818/260000**。预算、架构规则与 known-failure 清单未改；这不代表 RF901 运行时性能验收。

实际 Windows dir 打包使用当前配置、本机 Electron41.2 文件，输出仅在 owned `.artifacts`，publish never、无 afterPack/npmRebuild、没有运行应用或安装器，也没有执行正式 NSIS/icon 发布链。当前核验 helper 进程在加载 builder 前为 spawn/fork/execFile 强制 windowsHide，退出后还原；记录的两个 cmd.exe 已退出。首次构建成功后的核验因 Windows ASAR selector 使用 POSIX 分隔符失败，原包、日志及 exit1 保留。改用 host-native selector 对同一包只读复核：**189个 renderer 文件逐字节与 SHA256 相符，全部真实 ASAR metadata 标为 unpacked**，包含入口、JS、字体和 builtin 主题；main/preload 仍 packed，归档完整性哈希与受测构建一致。没有重复打包或以单文件推定全 payload 通过。只能证明布局，不能保证所有 OS 通知或嵌套 native CLI 行为，也不能替代实际打包版运行。

gpt-6.1-sol high 独审已复核冻结源码、定向测试和后台门禁，并独立重算布局的189份实体文件、当前 dist 与归档 metadata；最终文档及 bounded 签核以本机独审记录为准。

证据根为 `.artifacts/rf903-preview-authority/`，保留 baseline 身份与文件哈希、当前主机基线、冻结源码与仅测试修正、所有首次失败和后续后台门禁、实际包与最终布局核验。**本轮实际 Electron 启动数为0**；没有隐藏模块探针。因此每窗 Session 的实际引擎运行、file 拦截与 bundle/lazy/font/shader 兼容，尤其自定义主题 CSS 字体跨协议 CORS，仍未实测。现有 product/E2E、editing、safety、formal runner 会显示窗口，本轮保持未测；开发 HMR、完整产品流程、真实打包运行、Mac 和 Windows 独占 IME 也不能由单元或布局核验替代。

此阶段仅保存本地 checkpoint，不普通 main 推送，也没有新提交的官方 CI 通过结论。前台需要用户再次明确空闲；本轮不要求用户暂停工作。RF903 为 IN_PROGRESS，RF901 PAUSED，RF902 未验收且源码暂停，M9 **0/3**。精确本地提交、最终后台结果与 bounded 独审以同证据根 handoff/checkpoint 记录为准。

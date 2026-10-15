# RF903：窗口预览资源与主题生命周期

## 2026-10-15 恢复执行与真实验证

原工作副本保留，恢复后首先核对 git status、报告及未确认的交接写入：handoff 当时没有落盘，25项生产/单元源码哈希与此前受测冻结版一致。重新 fetch 后官方 main 仍为 `ab740c15b20bd163b1eb89fc67484389f7a7549c`。先按授权保存原27文件本地 checkpoint `d401c2f65a6a36d92e985a9b103fb2ff51ff67da`，tree `00259bc83aeba70644b5e418462274bda473530c`，保留本地引用，无远端分支。后续生产源码没有改变；新增预览 E2E 和测试夹具的打包路径、HTML剪贴板保全能力。

用户于06:44 UTC明确表示不在电脑前并授权接管。所有产品实例沿既有 before-ready bootstrap 隔离 appData 与 userData，启动后核对实际路径、preload字节、sandbox和main/metrics进程身份，再输入。监测未发现物理用户输入；原生键鼠助手另核验owned HWND/PID或capture。注入的远程用户事件可能与测试注入不可区分，此限制保留。只关闭测试进程；未读取、回滚或修改真实FishMark-dev与真实文档，Crashmon继续暂停。

当前九项门禁组合通过：gates-final-01的lint/typecheck/build，gates-final-02的strict，以及gates-final-03的完整产品、perf baseline、editing、workspace safety、formal。strict **3861 passed＋8 exact known，0 unexpected/collection/hook/unhandled/unresolved/skip**；产品 **25/25**；foundation **310/310**；formal **121/121 cases、2541 targets、99 known-defect、0 unexpected**。首次strict的导出异步等待失败保留，该文件单独5/5、同版本完整strict复测通过；没有修改测试超时或known清单。首次产品24/25由当前HTML剪贴板安全拒写阻断，未写入后才补充仅HTML单格式的原生`HTML Format`字节备份/恢复和精确校验，正文只在main RAM，未知/混合格式仍拒绝，并保全并发改变的剪贴板。原失败均未删。

新增真实产品用例验证：CSS相对`@import`与实际`document.fonts.load`字体解码；切换主题后旧资源403；两窗口真实Session对象不同且非持久、storagePath=null；空白窗口不能读取另一窗口文档图片；UI关闭文档后原图片403。既有用例同时验证bundle/lazy、Mermaid、KaTeX、data/HTTP/本地图片、当前主题CSS与实际纹理shader surface。runtime02/03的测试驱动错误分别为直接关闭IPC未同步renderer、阅读模式隐藏关闭按钮，原记录保留；runtime04两项通过，未为此修改产品。

实际Windows dir包仍逐字节/哈希核对189份unpacked renderer文件，main/preload保持packed且匹配编译产物。额外打包测试将入口显式设为既有隔离`product-main.cjs`及stderr tee，再加载原生产main；**实际FishMark.exe、app.isPackaged=true、app.asar.unpacked/dist入口**下5项资源测试通过。它证明受测生产payload及打包路径的运行兼容，不能称为原始shipping入口、NSIS安装链或Mac验收。开发editor/workbench双端口、同文档HMR、真实保存和主题CSS也通过。

临时导图在开发态provenance11与packaged-01分别通过同协议、各2次正常退出的真实产品启动：untitled原生图片粘贴并解码→真实Windows Save对话框写入owned文档→关闭后403→正常退出/重启→最近文件重开后200且解码。同临时目录的未导入PNG始终403。原生Save助手通过UIA的确切filename host发现HWND，再验证PID/创建时间、子窗口、Edit/Button类、唯一IDOK、目标不存在与文件名回读；仅向owned控件发送WM_SETTEXT/WM_GETTEXT/BM_CLICK，不发送全局键鼠。前10次诊断的语法、剪贴板安全拒写、UIA代理/前台前提/控件定位或跨进程文本读取失败均保留，不能计为通过或产品修复。

**Windows IME严格验收仍失败。** 独占IME01观测到可信start/update，结束事件为trusted=false，且实际`Windows IME fixture\n\n你好\n\n`比期望多一个尾部换行；保存断言尚未执行。窗口布局恢复、进程退出，监测0物理用户输入。原始proof的`syntheticCompositionEvents:false`仅表达runner没有主动dispatch合成composition，不能解释为未观测到不可信事件。新的同引擎/同native助手纯contenteditable对照在默认持久与独立非持久Session中均复现缺少可信end，正常退出；这是有界诊断，不是IME通过、历史baseline对照、换行语义结论或无IME回归证明。

6.1-sol high独审对预览授权源码、全部有界证据与临时导图流程给出bounded PASS；最终冻结身份、签核、普通main发布及对应CI以本机handoff/publication记录为准。仅此预览授权小批进入发布判断，RF903仍IN_PROGRESS，RF902 IME与其他未完成验收保留，RF901 PAUSED，M9 **0/3**。legacy目录外图片授权设计、精确shipping入口/NSIS、Mac与IME不借本批关闭；cp13/cp16及Library保持冻结。

## 2026-10-13 源码实施及断线时点记录

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

证据根为 `.artifacts/rf903-preview-authority/`，保留 baseline 身份与文件哈希、当前主机基线、冻结源码与仅测试修正、所有首次失败和后续后台门禁、实际包与最终布局核验。**截至2026-10-13断线，本阶段实际 Electron 启动数为0**，下列未测判断为该时点记录；2026-10-15新增实际验证以上节为准。当时没有隐藏模块探针，每窗Session、file、bundle/lazy/font/shader/CORS、product/E2E、editing、safety、formal、HMR、打包运行、Mac及独占IME均未实测。

2026-10-13交接仅允许本地checkpoint、没有新官方CI结论，前台等待用户明确空闲。2026-10-15已取得新授权并实际验证，最新发布与验收边界以上节及同证据根handoff/publication为准。RF903 IN_PROGRESS，RF901 PAUSED，RF902未验收，M9 **0/3**。

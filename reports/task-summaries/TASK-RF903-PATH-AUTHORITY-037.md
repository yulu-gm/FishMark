# RF903：main 文件打开与图片粘贴的路径授权

2026-10-13，YULUSTATION / Windows 11 / i7-13700K / 32GB / Electron 41.2 / DPR1。源码基线为官方 main `43969807a905389593fbaf73da28258d85259a38`，tree `7ee4eaff1b374f4a2b41ec594ec83ae6841629b2`。本批按用户授权使用 gpt-6.1-sol 实施和独立审查，只收口 main 文件打开入口、原生 File 授权、图片粘贴目标和临时图片目录来源。预览资源协议、主题资源授权另留下一批。

## 授权来源与生命周期

renderer 的路径字符串本身不授予访问权。main 先在内存中查询已授权来源，再进入窗口注册、文件身份解析、stat、磁盘版本、正文读取或最近列表记录。授权来源是 main 原生 chooser、OS 启动/第二进程/open-file 队列、main 当前最近列表、已有恢复/当前 tab 的身份以及 main Save/Save As 写入后的身份。editor-test session 由 main 对自身生成的夹具路径发放能力，没有任意测试模式或 renderer source 字段绕过。

原生文件拖入通过 preload 的 `webUtils.getPathForFile(File)` 取得原生 backing path，再使用只存在于 main 与隔离 preload 的窗口随机能力调用私有 IPC。renderer 不能使用普通路径字符串发放能力，JavaScript 构造的 File 返回空路径、不调用发放 IPC。窗口能力与 WebContents 绑定；未消费授权及其异步解析与页面 generation 绑定，reload、进程失联、destroy、完成/失败会撤销，native File 未使用授权另有60秒期限。不同窗口不能消费对方未使用能力；多文件逐个消费，切换活动文档不会撤销同一批剩余文件。

每次读取校验授权时固定的 lexical/canonical 对应及文件身份，拒绝 symlink/junction 改指和本次读取中的文件替换。最近列表是独立的 main 来源：它授权 canonical 文件位置，允许同位置的正常外部原子保存，并在本次消费首次解析时固定文件对象；列表/偏好刷新不能把原 canonical 路径改指到其他目的地重新授予。当前 tab 的 main 身份优先于旧最近记录，真实 Save 后关闭并从最近列表重开保持可用。

## 图片粘贴与临时目录

图片导入 IPC 改为 tabId，main 取得实际 owner、活动 tab、文档路径与文件身份，使用同一 tab lease 协调 close/move/Save As，并在异步边界重新验证。renderer 保存 EditorLoadIdentity，旧图片返回后若已经切换文档便丢弃插入；实际 IPC 拒绝沿既有错误通知返回 null，不产生未处理 rejection。

已保存文档仍使用其 assets 目录。mkdir 前通过最近存在的祖先解析实际位置，mkdir 后及每次写入前再次检查，拒绝 assets junction 指向文档目录之外；保留10MiB限制、实际图片格式与独占 wx 写入。未保存文档使用 main 已认可的默认或自定义临时目录。启动时已有本地偏好属于 main 来源，保留现有自定义目录；失联自定义目录不阻断启动或已保存文档的 assets 粘贴。原生目录 chooser 在 main 校验并保存，成功后提交目录授权；普通 renderer 偏好更新只允许清空或保持当前目录值，不能通过字符串扩展写入目录。

## 基线与真实产品证据

旧构建 `rf903-path-negative-baseline-01` 对未经选择、也不在最近列表中的 owned 临时 Markdown 路径返回打开成功，负例预期失败，保留真实结果。基线四项既有产品用例通过；最终工作流基线两项通过。原生 File 来自 Chromium 文件输入后端；drop 手势为携带这些原生 File 的 synthetic DOM event，不能冒充 OS 文件拖入手势。

候选 `rf903-path-target-02` 三项通过：任意 open 字符串、伪造 drop 字符串、无效 clipboard tab、临时目录偏好扩权均精确拒绝；JavaScript File 不发放能力；多文件顺序打开、实际编辑/File Save、真实关闭 tabs 和 Welcome 最近重开通过；真实 Ctrl+V 图片进入 assets、保存通过。导入实际完成后只暂缓原 IPC response，真实 File New 切到另一文档，再释放原结果，新文档保持空且原文档不变。此屏障没有替换 handler 或伪造成功。未授权读取前零 I/O 的证据来自单元的端口计数与 main 绑定审查；E2E 的结果和字节不变本身不能证明未读取。

剪贴板测试只接受可恢复的标准 text/plain 与 image/png；旧正文/图像仅在 owned main RAM 中保存，不序列化到证据。写入测试图片前停止 trace，粘贴阶段及失败不截图；实际 PNG 必须等于自有 fixture 字节后才保存。finally 核验可见格式、text、图像像素恢复，检测到并发变化则保留当前剪贴板并使测试失败。此机制不是原子 CAS，不保证原编码/不可见 OS 元数据，也不提供主进程崩溃后的 RAM 恢复。正式候选的恢复 booleans 全 true。

辅助失败原样保留：初期夹具直接调用 close/open 绕过 renderer 状态、阅读模式隐藏 tabstrip、无效 PNG 在写剪贴板之前被拒、assets 相对路径格式假设错误；target01 的过滤器锚点导致 No tests found，未启动 Electron。按实际产品行为修正测试，没有放宽允许失败清单。

## 验证与剩余边界

用户并发输入澄清后立即停止新的前台发键/IME，继续后台收尾；后续前台 IME 需用户再次明确空闲。已完成助手正常返回，探针每个按下均立即成对发送释放，owned PID5376/HWND138142；发键前目标检查没有报失配，但缺少逐键发送后及其他应用的持续观测，不能完全排除检查/发送间切窗或输入进入非测试应用。未为调查读取或改动其他应用内容；可能误入的按键是否影响其他应用未观测，不能断言无影响。桌面恢复证据只证明本次启动前捕获的前台/HKL恢复，不证明 TSF/转换状态；复用的普通产品桌面 helper 中“No IME … changed”限制句不适用于这次调用 IMM 的 IME 诊断，原始文件保留，补充边界见 `ime-interference-boundary.json`。

`gates-01` 九项完整门禁全部通过：lint、typecheck、build、strict regression、真实产品 E2E、perf baseline、editing experience、workspace safety、formal behavior。严格回归3832 pass＋8 exact known，0 unexpected/skip/collection/hook/unhandled；产品23/23、30次启动（25次正常＋5次强制故障）、34份实际 OS sandbox/untrusted/PID 匹配观察；所有进程退出，清理错误0，实际 appData/userData mismatch0。三个真实探针的 configured/ready/loaded/before-exit 阶段路径、随机身份和退出后 guard 清理均通过。foundation310、editing79、safety7、formal121/121/2541 targets（99 known-defect、0 unexpected/not-run）；正式 JS gzip1435749/1500000，initial102777/260000，未改预算或 known-failure 清单。构建后 main/preload/index/lock 指纹与真实产品受测指纹一致；另保存完整 candidate build 文件清单，不能把四个入口指纹冒充整个模块树。

源码/单元独审由同一 gpt-6.1-sol 独立 reviewer 给 bounded PASS：36项授权契约、312项粘贴相关测试，以及真实 target02证据通过。独审指出的 Ubuntu 测试夹具使用 Windows 规范化路径的问题已改为 host-native 夹具，不能用本机 Windows 通过冒充 Ubuntu 运行通过；精确官方 CI 在发布后另行核验。

完整门禁后按用户已给授权运行前台中文 IME 诊断 `rf903-path-ime-01`。诊断 runner 1/1 exit0，真实可信 compositionstart/update/input、CJK 与保存观察完成；但用户随后明确报告当时正在键入，actual final text 也不等于预定输入。故单独摘要明确 `userReportedConcurrentTyping=true`、`exclusiveImeAcceptancePassed=false`；原始事件保留，compositionend 的 trusted=false，不能据 runner pass 宣称独占 IME 或严格 trusted-end 通过。仅使用 owned 测试文档，实际双路径隔离、进程退出、profile 清理和本次启动前捕获的前台/布局恢复通过。没有再接管前台重复测试；纯净独占 IME 仍未测，本批 main 路径授权的九项门禁不以这份诊断替代。

本批所有实际产品窗口使用既有 appData/userData 双路径 owned 隔离并在启动后验证；三个正式探针使用既有隔离 launcher，必须以实际阶段 journal 和退出后 guard 清理证明。没有启动或读写真实 FishMark-dev，没有清理或回滚上批会话事故，没有修改 OS 安全、开发者模式、网络、凭据、许可或持久访问设置。cp13/cp16、Library、RF901/RF902 源码保持暂停。

`fishmark-asset` 预览协议仍缺少可信请求窗口身份、main 文档/主题资源根和对应撤销生命周期；本批未修改它，不能声称整个产品已阻止所有未授权文件读取。原生文件 chooser、OS 文件拖入手势、单独 Save As 以及失联目录 UI 本批没有逐项新跑，它们的授权契约由 unit/source 审查覆盖。RF903 保持 IN_PROGRESS，RF901 PAUSED，RF902 未验收且源码暂停，M9 **0/3**。

本机原始证据、完整门禁、独审及精确提交/官方 CI 以 `.artifacts/rf903-path-authority/` 的 handoff 与 publication 记录为准；真实产品 raw report/trace 位于 `.artifacts/e2e/rf903-path-*`。上一批隔离事故的准确边界仍见[报告036](TASK-RF903-CSP-036.md)，不以本批安全隔离覆盖或否定历史影响。

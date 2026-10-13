# RF-901：磁盘打开后的标题首输入与 IME 引擎归因

2026-10-13，YULUSTATION；基线公开 main `cf0502cc89bb65f1b664c1dc2b1ff4d414010157`，tree `8c429bb9a891766ce1904d094aa9efff2a77399d`。Windows 11 26200 / i7-13700K / 32GB / Electron 41.2.0 / Chromium 146.0.7680.179 / DPR 1。本批没有再次占用前台，没有修改系统输入法、执行策略、用户文件或冻结 cp13/cp16。

## 触发与最小修复

打开 canonical mixed20k 后，在首行标题正文开头输入一个 `x`，会触发全篇解析。已有局部路径只支持受限 paragraph 编辑，因此同样的字符输入在不同块上差异明显。生产构建基线三次标题输入 `insertText` Promise 耗时 1541.8 / 1795.4 / 1499.2ms；同协议 ON 定位到一次 full parse 1503.2–1549.8ms、11500 次 inline parse。完整快照读取与光标准备分别计时，未混入输入区间。

本批扩展既有叶节点局部更新，只接受顶层 ATX 标题的纯文本内容编辑。开头 `#` 前缀必须保持不变、内容不得为空或改变两端裁剪边界；仅 Unicode 字母、数字和有限常规标点/空格，不含行分隔或 Markdown inline 语法。带关闭 `#`、尾部空白、setext、嵌套、组合符及未配对 surrogate 等继续明确 full-parse fallback。只重解析目标 inline，沿用已有全局 reference/footnote 坐标映射；没有新缓存、widget 重用或第二份 parser。

## 测量协议

私有可复现脚本 `.artifacts/m9-first-edit/{run.mjs,main.cjs}`。OFF 使用真实 dist main/preload/renderer，ON 仅改用同生产 App 的 Vite 诊断构建并安装已有阶段插桩；ON 用来归因，不能与 OFF 绝对值混算。每个大小/光标位置独立 Electron 进程和 userData，三个不同临时磁盘文件：首次 CLI 打开，后两次应用菜单和替代 chooser。主窗口 1280×900，位于桌面外，showInactive，后台节流关闭。没有并行运行性能测试。

canonical20k SHA256 `545601ad9d770898e23e5551e938bcaa4ebaecd8446941a4145a4db8777f6d37`，531783B；前5000个 LF 分隔行且无末尾LF：`01f2df9e46755985544a75ba1977a0460df3b6ff5f975078e1fea882751208ba`，132783B。

ready 定义为活动文档路径正确、可编辑内容 DOM 已存在、fonts.ready 和两次 rAF；另记录 DOM 阶段、字体/窗口尺寸、完整快照往返、原生光标准备、insertText Promise、精确主进程投影校验，以及 renderer beforeinput/input capture/bubble、两帧机会和 long-task。每次输入必须在预定源码位置只插入一个 x，原生 Ctrl+Z 必须恢复完整源文。首次计时始于 built-main require，排除 Electron 进入脚本前启动和 harness 准备；不清 OS 磁盘缓存。三样本仅按首次/暖进程逐项报告，不估算 p95/p99。

这不是 OS 按键到 compositor 呈现测试。DOM input 回调早于 CodeMirror 后续处理，不能用 beforeinput→input 的亚毫秒差宣称输入完成；两帧只是渲染机会，截图不是呈现时间戳。首次 ready 也尚未达到正式预算。

同协议 OFF 生产构建，按“首次 / 暖1 / 暖2”报告 native insertText Promise 的 main 时钟区间（ms）：

| 输入位置 | 基线 | 候选 |
| --- | --- | --- |
| 5k 标题正文开头 | 251.2 / 222.8 / 239.8 | 51.3 / 40.7 / 41.9 |
| 20k 标题正文开头 | 1541.8 / 1795.4 / 1499.2 | 172.4 / 151.3 / 154.5 |
| 5k 段落词内对照 | 51.0 / 43.1 / 43.8 | 51.9 / 41.7 / 34.6 |
| 20k 段落词内对照 | 174.0 / 149.2 / 145.7 | 172.9 / 151.8 / 161.3 |

候选 ON 的三个标题样本每次 full parse=0、inline parse=1；仍有约45–47ms增量树/坐标处理、全篇派生和装饰开销，不宣称16ms semantic预算达标。标题打开 ready 基线→候选：5k首次1579.8→1641.3ms，暖272.2–292.5→296.5–313.0ms；20k首次4211.0→4179.6ms，暖1610.1–1623.0→1601.9–1606.3ms。没有证据表明本批改善打开时间，首次ready仍显著超预算；段落对照没有宣称尾延迟改善。

24/24基线与候选打开/精确字符插入/undo恢复通过。`comparison.json`包含逐样本字体、几何、renderer事件和long-task数据以及raw与脚本SHA256；`baseline/candidate-transform-manifest.json`保留ON源码变换身份。本地原始基线、失败和诊断数据均在 `.artifacts/m9-first-edit/`；错误 DOM 光标设置的初次 paragraph 试验原样保留，最终使用真实光标键和精确源码位置断言。原MaxListeners警告及部分探针进程退出时的workspace sender失效日志保留，不描述为生命周期修复。

## 正确性和门禁

新增32项测试：31项标题parser差分/回退和1项controller矩阵。覆盖完整canonical20k树、前后reference/footnote/table依赖、旧树不可变、首中末插删、CRLF/EOF/tab前缀、Unicode BMP/非BMP与surrogate切断、结构/inline边界回退，以及source/wysiwym、reading/editing、真实undo/redo。相关407项通过；最终strict **3663 passed +8 exact known、0unexpected/skip/collection/hook/unhandled**。

lint/typecheck/build、foundation310、gzip **1434756/1500000B**、真实editing79/safety7/formal121/121及2541targets通过，formal99known、0unexpected/not-run。审查建议补10项Unicode/边界测试后重新完成lint/typecheck/相关及完整严格回归；生产实现不变。独立只读review无阻断，结论和证据边界存 `.artifacts/m9-first-edit/independent-review.md`。公开main精确提交与CI在发布时另存checkpoint，不能把本批门禁当整个RF-901完成。

## IME 结束事件：引擎来源证据

前一批 OS IME 在临时 FishMark 文档实际输入“你好”“日本語”，有 trusted start/update/input，但 end=false，原 strict `realComposition:false/pass:false` 保持不变。本轮只做后台调查。

Electron [v41.2.0 DEPS](https://github.com/electron/electron/blob/v41.2.0/DEPS) 固定到 Chromium146.0.7680.179。该版本 [InputMethodController 的结束路径](https://github.com/chromium/chromium/blob/146.0.7680.179/third_party/blink/renderer/core/editing/ime/input_method_controller.cc#L363-L375) 直接调用 ScopedEventDispatcher，保留 Event 构造的默认 false；开始路径经 EventTarget::DispatchEvent 显式设置 true。固定版本 CodeMirror 及生产源码没有找到 DOM compositionend 转发，executeJavaScript 的 listener 在主 world 立即拷贝布尔值，不经产品 bridge 传送 Event 对象。完整链接与 Electron patch 审计边界保留在 `.artifacts/m9-ime/source-review.md`。

本轮 `.artifacts/m9-ime-engine/pinned-electron-control/result.json` 使用相同 Electron、show:false/focusable:false 的独立 plain contenteditable，无 FishMark/CodeMirror/React/preload；仅 CDP composition/commit，没有 OS 按键或布局变更。main world 和 isolated world777 的 capture/bubble 日志一致：start/update/input=true、唯一 end=false，两侧均无 JavaScript composition dispatch hook 命中。显式 synthetic 阴性对照均 false 且命中各自 hook。前后和中途四个检查点的 foreground HWND/PID/layout 不变，窗口始终隐藏且不聚焦。

因此相同打包引擎在无应用代码时也可产生该 trust 差异，支持 Blink 原生路径解释，排除 FishMark/CM 是必要原因；未捕获历史 OS run4 的 native stack。引擎对照 `controlCompleted:true` 与 `strictTrustedEnd:false` 分别记录，不把失败改绿。CDP 不是真实 OS IME；后续协议需区分 OS 输入来源与引擎 trust 标志，仍保留事件链和源码审计，不能简单删除 isTrusted 条件冒称旧门禁通过。

## RF-901/902/903 边界

RF-901 仍 IN_PROGRESS、M9 0/3。剩余：冷/暖 editor-ready 预算、全篇 offset/派生/装饰耗时、结构编辑与完整场景、真实呈现/掉帧、Windows/macOS IME 与 soft-wrap、长期 retained memory。前批十分钟自然 GC 和终末 forced GC 结论不外推；本批未新增缓存，没有为凑时长重复同一内存探针。RF-902 的独立 Playwright 数据安全/编辑完整套件、RF-903 的 Electron 安全收口仍 PLANNED，未被局部行为门禁替代。

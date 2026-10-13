# M9 验收清单与下一批顺序

**跨窗口更新（报告033）：** RF902新增真实点击/排序/分离/取消、Windows离窗释放、pending ACK排空和目标关闭/超时恢复覆盖，并修复光标丢失、Escape仍分离、失败后编辑未重新绑定三项缺陷。已有窗口合并移动仍无用户入口，原生拖到已有窗口保留新建分离窗口行为；不把底层move测试当产品流程验收。完整边界及失败证据见[报告033](../../reports/task-summaries/TASK-RF902-TRANSFER-033.md)。RF902仍IN_PROGRESS，RF901 PAUSED、RF903 PLANNED、M9 0/3。

**后续实施更新（报告032）：** 以下表格保留报告030审查时点的缺口记录。RF902现为唯一IN_PROGRESS源码任务，RF901为PAUSED、RF903仍PLANNED。产品保存重启及真实idle流程已发布`e006460`且CI38374591185四项全绿；随后真实异常退出恢复发现并修复小数文件时间戳校验错误，同协议恢复及继续编辑保存已通过，完整门禁/发布见[报告032](../../reports/task-summaries/TASK-RF902-RECOVERY-032.md)。跨窗口、未确认编辑、断电/写入中断及平台证据仍开放，M9保持0/3。用户后续明确授权无人桌面可由测试接管，因此下文“前台待协调”是历史边界；本恢复批未运行OS IME。

2026-10-13，YULUSTATION。基线为官方 main `3fee9ef20c8d83ce58ebc430e648ae4c74ea4245`，tree `f9f7ac06bb4f523547dcf26d15ce421f0a968043`；本批重新 fetch 核验一致。[CI 38363749630](https://github.com/yulu-gm/FishMark/actions/runs/38363749630) attempt 1 的 Quality、Full regression、Bundle 全部成功。标题/脚注优化及保存关闭锁序、确定性关闭 Save 协议均保留。

这是逐项证据盘点，不是三个任务的验收通过。RF-901 为 `IN_PROGRESS`；RF-902/903 的实现仍为 `PLANNED`，本次完成只读缺口审查。路线图的 RF-901 → RF-902 → RF-903 验收依赖不变，M9 **0/3**。本轮用户明确授权“下一批可并行只读审查RF902流程和RF903安全缺口，执行则各批最小范围不冲突”，因此允许依赖未验收时提前串行实施验证小批，覆盖旧规则中“依赖COMPLETE前不得开始”的实施顺序限制；不覆盖正式验收依赖。每次只执行一个源码任务，实施RF-902/903小批时暂停RF-901源码修改；待正式开始该批才更新其实施状态，不借此宣称依赖任务完成。

## 可沿用的门禁

相同生产/测试代码的本机标准门禁通过：lint、typecheck、build，strict **3682 passed + 8 exact known**，0 unexpected/skip/collection/hook/unhandled；foundation 310、editing 79、workspace safety 7、formal 121 cases / 2541 targets。Formal 的 99 known-defect targets 仍明确存在，不能把通过 wrapper 理解为零行为缺陷。gzip **1,434,741 / 1,500,000 B** 是当前公开 main 已获准合同，不修改冻结 cp13/cp16 的旧合同。

生产修复 `9fe0d3c` 与测试协议 `3fee9ef` 的证据分别见[报告028](../../reports/task-summaries/TASK-WINDOW-CLOSE-SAVE-028.md)、[报告029](../../reports/task-summaries/TASK-WINDOW-CLOSE-PROTOCOL-029.md)。本机原始证据为 `.artifacts/m9-close-save/` 的 `check-results.json`、`protocol-strict.json`、`protocol-safety.json`、`ci-terminal-38363749630.json` 和 `protocol-publication.json`。旧失败 CI38358340321、38362468526 保留，未重跑或下载其失败包。

本批仅修改文档，不重复不受影响的本地长门禁；核对相同代码、文档链接、diff 和独立审查。普通 main 推送后仍核验本批精确 SHA 的完整 CI。任何后续源码、配置、测试或依赖批次都须重新运行其相关测试、标准/严格门禁及受影响的真实 Electron 门禁。

## RF-901：产品性能与测量缺口分开

预算仍以[路线图 §8](../refactor/editor-foundation/roadmap.md#8-performance-budgets)为准；YULUSTATION Windows11 / i7-13700K / 32GB / Electron41.2 / DPR1 的数据不与旧 Windows 或 Mac 混算。

| 验收项 | 现有证据 | 当前结论与剩余工作 |
| --- | --- | --- |
| mixed5k/20k 首次打开 ≤500/1500ms | [报告027](../../reports/task-summaries/TASK-RF901-FOOTNOTE-LINE-INDEX-027.md)：首次1564.2/2923.9ms；暖5k250.5–271.8、20k931.1–960.1ms | **已测区间超预算，存在产品性能债务**。首次独立进程/profile，并非清空 OS 磁盘缓存；活动路径/DOM/fonts/two-rAF ready 不等于 compositor。三样本不估算尾分位。 |
| 普通输入 semantic p95≤16ms；结构输入≤24ms | mixed20k 普通输入 dispatch p95 曾由2385.2降到278.8ms，后续高亮复用185.1ms；标题首次输入151–172ms | 这些是不同场景/阶段的端到端或 dispatch 区间，**不能替代 semantic p95**。需按原 fixture 和编辑类别分离语义工作、装饰/派生及呈现，结构编辑尚缺完整同协议预算报告。 |
| selection/暖普通输入 full parse=0、fallback=0 | 已有结构行复用、受限顶层 ASCII 词内/ATX 标题路径及差分测试；局部 ON 30次 full parse→0 | 可沿用已覆盖路径的正确性与计数，不能推广所有单行编辑/容器/引用/围栏。完整矩阵的 parse windows、扫描字节、节点复用/失效、fallback 原因仍要合并。 |
| 首开 full structure build≤1、装饰强制重建≤2 | ON 开发 StrictMode 首次记录多次解析；静态发现 controller 构造及初始 load-revision effect 可疑重复 | **待测诊断，不是已证实的生产重复构建**。先给真实生产 OFF 路径计数，保留文档身份/revision/undo 边界；不能以相同文本跳过真实 reload。 |
| outline/metrics 不阻塞 first paint；输入到 paint p50/p95/p99、long tasks、掉帧/滚动跳动 | 有同步热点和 two-rAF 观测 | **呈现证据不足**。后台窗口不能代替可见 compositor 测量；不得把 two-rAF 当作 paint。 |
| scroll、源码/所见切换、tab切换 | 既有功能与局部性能 probes | 缺最终固定 mixed fixture、同机同协议的完整性能矩阵及尾分位，不能从功能成功推断速度。 |
| 内存和缓存生命周期 | `.artifacts/m9-session/`：60轮/10分钟自然GC，错误0，缓存容量内；终末forcedGC单列。widget对照浏览器GC后释放 | 仅关闭**该固定工作负载的容量/回收观察**。无正式长期堆预算，不外推多小时或自然GC widget；原V8-only失败保留，无新增泄漏因果结论。此次没有长期缓存改动，不重跑10分钟。 |
| Windows/macOS IME、软换行 | Windows真实OS中文/日文文字正确，start/update/input可信，end不可信；相同Electron空白contenteditable后台CDP对照也出现end=false | 原 strict pass=false 保留。**不能单凭 isTrusted 将其定为产品bug，也不能删除校验**；引擎对照不是OS对照。完整平台/几何/延迟仍缺证据。 |
| 只保留 opt-in 结构化指标 | 已有 opt-in 报告与校验器 | 仍需最终扫描临时日志、校验构建 provenance，并将 fixture hashes、原始结果及预算结论固定到接受提交。 |

RF-901 目前没有可签署的整体 PASS。局部性能改进、十分钟会话和关闭修复可沿用，但不能抵扣未过预算或未测平台项。

## RF-902：实际产品流程覆盖

路线图要求的 Playwright 依赖/配置、隔离 Electron fixture 和 `test:e2e` 尚未建立；`tests/e2e/README.md` 仍是预留目录。现有真实 Electron probes 是可复用证据，不是这一缺失套件已存在的证明。

| 验收项 | 可复用 | 缺口 / 最小后台批次 |
| --- | --- | --- |
| 启动与隔离 | `scripts/probe-workspace-safety.mjs` + `electron-workspace-safety-main.cjs` 启动真实 dist main/preload/renderer，独立 userData/temp，原生输入、实际IPC与菜单；只替代 chooser/prompt，另有真实保存顺序屏障 | 建立 Playwright Electron fixture 和 `test:e2e`；只清理自身进程及临时目录，绑定运行ID/版本/fixture/证据，失败也清理并保留报告。 |
| open/edit/save/reopen、autosave | safety两次原子保存、取消关闭后继续编辑、关闭Save/准确磁盘；renderer autosave 单元/集成测试 | 增加真实关闭重启后读回；autosave 必须观测实际触发原因和磁盘内容，不能用 menuSave 冒充。后台可自动化焦点事件，但不能冒称OS前台blur。 |
| 非活动tab外部修改与阻止覆盖 | 文件身份、外部变更和保存守卫的单元/集成测试 | 真实两个tab + 磁盘写入 + 切回/保存，断言非活动tab收到冲突、旧草稿未覆盖外部字节。 |
| pending edits 下 move/detach 与ACK | workspace application、renderer queue、move/close 集成覆盖 | 产品多窗口跨进程屏障，保留未ACK编辑，移动/分离后核验源文、revision、ownership与继续输入；模拟port结果不替代真实边界。 |
| 关闭与崩溃恢复 | 当前真实Cancel/Save顺序及销毁/磁盘强断言；应用恢复/journal测试 | 保留确定性关闭协议；另加隔离产品实例的强制退出/重新启动及恢复字节校验，不杀用户程序。 |
| 嵌套键盘/选区/undo、源码及所见模式 | formal121/2541和editing79；正式runner有独立窗口与受控DOM按键 | 复用语料/期望，补真实产品入口和原生输入链路；明确99known target，不能说全部期望零缺陷。 |
| 平台IME说明 | Windows既有真实OS记录及失败；固定Electron引擎对照 | 提交平台标记、键盘/IME版本、开始/结束/取消、源文与选区/undo的人工协议；Mac实测缺失。 |

RF-902 可以先完成无前台的启动/持久化最小批次；在真实流程、平台手工项及依赖未齐前不能关闭任务。

## RF-903：实现缺口与已有边界

本节是源码审查，不是对用户文件的攻击实验，也不是已经落地的安全修复。

| 验收项 | 当前源码事实 | 结论 / 后续最小边界 |
| --- | --- | --- |
| renderer sandbox +兼容preload | `src/main/runtime-windows.ts` 明确 `sandbox:false`；contextIsolation=true、nodeIntegration=false；preload使用多个本地CommonJS模块 | **实现缺口**。先构建可在sandbox中运行的单preload及契约，再启用并验证真实生产窗口，不能只翻布尔值。 |
| CSP | `src/renderer/index.html` 未声明CSP，未发现生产响应CSP设置 | **实现缺口**。按bundled模块、lazy模块、主题样式/字体/图片及必要协议验证允许项；`useThemeController.ts` 的GLSL/纹理fetch也须覆盖connect-src；禁止为通过测试任意放宽脚本策略。 |
| 预览资源根 | `preview-asset-protocol.ts` 仅检验scheme/host/absolute path，然后直接readFile；无document/theme注册根授权 | **高优先实现缺口**。需要main授予根及生命周期、规范化/realpath、边界与symlink逃逸拒绝；成功读CSS/SVG的现有测试不覆盖越权。 |
| IPC sender/窗口/mode/tab/输入界限 | `ipc-sender.ts` 已校验主frame、owner、销毁状态、main登记mode与entry URL；workspace大部分tab操作另查ownership；输入有shape/类型检查 | 可沿用这些边界测试，但**不是“受损合法renderer不能扩权”验收**。需审计下方路径能力及资源大小/集合上限，不能随意新增会截断合法大文档的数值。 |
| navigation/window/external | runtime阻止will-navigate和新窗口；external registrar仅http/https/mailto | 实现与单元证据可沿用；最终仍需产品安全E2E和sandbox/CSP组合回归，不能把CI的no-sandbox测试豁免作安全证据。 |
| unauthorized paths/senders契约 | sender/mode/lifecycle负例已有；preview测试只含成功CSS/SVG和缺path | 增加跨根、编码/规范化、symlink、关闭/移动/主题卸载后的授权撤销及伪造合法renderer路径测试，验证拒绝发生在读写前。 |

**资源根不能由renderer任意声明。** `register-workspace-command-handlers.ts` 的 `OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL` 只校验非空 `targetPath`，接到 `openMarkdownFileFromPath` 后读取regular UTF-8文件，未要求main发放的用户选择能力。`register-clipboard-handlers.ts` 同样接受renderer提供的 `documentPath` 决定图片导入位置。clipboard写入受真实剪贴板内容、大小及排他创建限制，不能夸大为任意字节覆盖；但目标目录归属仍需main确认。若将这些renderer声称的目录直接注册为预览根，根allowlist仍可自我扩权。

路径批先收敛main授予路径/文档身份的模型与拒绝契约，再接预览根和clipboard目标；临时图片目录偏好也纳入授权。保留chooser、启动路径、最近文件、拖放及合法相对资源的功能。安全批次不能偷偷删掉已有打开方式来获得绿灯。Sandbox可先作为独立实现批，CSP另批评审和发布，最后组合验收。[Electron sandbox文档](https://www.electronjs.org/docs/latest/tutorial/sandbox)解释了preload的受限模块加载；[安全清单](https://www.electronjs.org/docs/latest/tutorial/security)作为最终复核依据，具体行为以锁定Electron41.2构建验证。

## 执行顺序与前台边界

1. 本文档批：固定现有证据、两项独立只读审查、文档链接/diff检查、普通main提交与精确CI；RF901/902/903均不关闭。
2. 下一执行批以RF-902隔离启动及open/edit/save/relaunch为最小可运行目标，随后单独补autosave/冲突/move/crash；先提供保护数据安全的产品级运行入口。RF-903授予路径模型可并行只读设计，源码批串行，不混合两个RF任务的diff。
3. RF-903按路径能力与资源根、sandbox/preload、CSP分别闭合；每批保持标准/严格/真实门禁及独立review，不将配置布尔值或静态字符串扫描当运行验收。
4. RF-901继续时先对生产初始结构构建计数及重复初始化候选归因，再改所属层。最终必须汇总全部§8预算、呈现、内存、两平台证据；不是无限增加局部优化就能完成。
5. **本批不占用前台。** 如再次调查Windows OS IME，先准备FishMark与相同Electron空白contenteditable的最小配对协议，再向协调方给出约3分钟独占窗口：现有中文/日文输入各一次，保留trusted字段及实际OS来源，观测源文/选区/undo，恢复前台及可验证输入布局。这是待协调提案，不能用过去许可直接启动；完整平台性能/软换行验收仍另列。

不改变指标、allowlist、系统安全配置或许可，不回退已发布优化，不访问旧受限会话目录，不触碰冻结cp13/cp16或绕过Library阻塞。

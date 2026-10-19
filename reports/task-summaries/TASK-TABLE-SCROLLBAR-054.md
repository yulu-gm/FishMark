# TASK-TABLE-SCROLLBAR-054

4.0.0隔离版本门禁已通过：lint/typecheck/build exit0；完整回归4023PASS＋8exactknown，0unexpected/collection/hook/unhandled errors；未放宽allowlist。安装包和提交CI进入下一阶段，视觉效果仍未确认。

2026-10-19 4.0.0发布阶段：用户14:56 UTC明确直接发布，取消等待原始文档/可见复现的条件。代码审查结论为无具体阻断缺陷，可带已知限制发布；仍须本次版本构建、回归和安装包基本核验。Windows手工两版均未见抽动，视觉效果尚未确认，不能称已修复。后台隔离发布，不运行被安全检测拦截的guard、不注入键鼠、不关闭现有手工窗口；以下旧“等待复现后才发布”状态已由本段更新。

2026-10-19 14:06 UTC只读复核：用户两窗手测反馈“原版也没抽动”，当前应记为**用户未复现，candidate03真实原生有效性未证实，暂停发布**。不是修复PASS，也不是由未复现推断原问题不存在。两窗磁盘样本SHA256均2853c315f7447cee0ad56a95b79d4accc9bdff6d1f1e3a0b1955d72511799b78；原版editor bundle为hBy0hcLe/8b458f5e…，候选为CtaqFIRu/5879126c…，实际rendererUrl各指向正确冻结构建。初始live内容一致，当前未读取未保存的内存文本。

准备没有程序滚动；两边ready和首次mousedown均top0/height43673。用户首轮全幅操作后原版约3.087s到height105860，候选约2.802s到93552，第二次操作至105860。后续范围稳定说明测量状态已改变，不能写准备阶段已全表预热，也不能用后续稳定否定用户首次仍看不见异常。只读采样没有逐表测量或连续OS轨迹；首轮mouseup已在viewport外，不能把该手势等同旧协议的track内100px往返。当前字体Aptos系16.8px、1084×785/DPR1；旧headless Times New Roman18px结果不能混为同协议。

独审及原24例复算：主干和旧路由candidate01各6/12绝对scrollTop反向；按top/(height-client)各12/12出程有反向比例步，回程0，最大0.0319015248。它们是位置/范围观测；没有连续thumb画面，不能直接认定用户可见抽动，旧文“用户抽动FAIL/复现”等表述须按此边界理解。candidate03未在该旧24例里。用户另澄清“上号”是在测试期间误输入，具体时段未知，不把guard未观测当成无人干扰证明。

本轮未开新窗、未关闭/重置原两窗、未操作键鼠、未执行被安全软件拦截的guard。只保存两份只读JSONL快照和复算结果：.artifacts/table-scrollbar-054-manual/readonly-reassessment-2026-10-19T14-06-34-273Z/reassessment.json。建议的最短复测路径（尚未证实稳定复现）：新冷文档→Outline直接Section14→关Outline→track内短距离上拖50–100px→停→反向→松手；active-cell另用冷文档对照，避免先全幅遍历。现有窗口留给用户，本轮没有启动这项复测。若合成样本仍均无异常，最小补充为脱敏表格及相邻文字、字体/窗宽/缩放和触发动作，无需完整私人项目。HEAD仍7bdf04739415fb0750835da66e1c9d35fe893fe1；未提交/推送/发布。

用户13:48 UTC批准打开手工窗口后，两窗已正常Electron启动并保持可见：左侧FishMark 原版 MAIN · 7bdf047 · 0.2.10（tab原版 MAIN.md，PID37796），右侧FishMark 修复版 Candidate03 · 0.2.10（tab修复版 03.md，PID2380）。main冻结524构建、candidate03的1476源/524构建启动前逐hash核验；实际appData/userData各自独立，source SHA一致/1831行30表0图片，均1084×785/DPR1，ready时均focused=false。仅隔离/标签/首次showInactive和只读滚动采集包装，加载未改的各自built main；未运行被拦guard或编译、未键鼠注入/改安全设置，无90s自动关闭；真实用户首次点击后恢复正常focus/show。窗口留给用户，等待中段上拖/停/反向/松手及激活cell后重复反馈；手工局部观察不算完整原生或发布通过。会话与实际路径见.artifacts/table-scrollbar-054-manual/latest-session.json及session-QYRvjD/ready-outcome.json，未自动清理这两个仍在用的profiles。

只读安全复核补充：拦截对象是外层输入guard由Add-Type生成的临时s1kfp3zc.0.cs，失败时间只能界定在UTC13:14:17.905之后至13:15:15.723之前（本机UTC+8约21:14–21:15），没有精确单秒日志。本轮默认受限会话读取SecurityCenter2清单和Defender/CodeIntegrity/AppLocker/PowerShell日志均被拒，未提权；检测厂商/名称/规则仍未知，旧窄查询无事件不代表不存在检测。首选下一轮由用户手工操作可核验来源的主干/候选隔离窗口，先做4关键对照，不伪称完整38例或自动逐帧通过；本轮不启动窗口/操作前台，不使用替代注入方式。另可由用户或设备管理员只读查安全软件的相应拦截记录，无需关闭保护或加排除。已另存3份4.0.0版本/发布说明草案并深比较依赖不变，均未应用，项目仍0.2.10；原生/包门禁及正式发布继续阻塞。证据.artifacts/table-scrollbar-054-live4/security-audit-readonly.json、manual-check-plan.md、version-preparation-review.json，旧证据保留。

最新原生/发布阶段：BLOCKED。用户已明确授权继续接管，并于13:04 UTC批准质量通过后提交main及发布4.0.0；授权无需重复索取。13:14:16-17桌面只读预检PASS，但随后既有外层输入guard第8行Add-Type被Windows安全检测阻断（临时cs提示包含病毒或潜在垃圾软件），未执行后续保护启动/Node产品启动。guard目录0文件、E2E run目录不存在，本轮产品启动0/手势helper0/OS输入0/产品profile0。13:15已告知归还键鼠，13:18:33完成结束归档。具体安全产品/规则未知；窄时段Defender日志无匹配事件，不能擅自归因。未重试、改排除、换编译路径或降低安全设置。

新版38计划原生例均未运行，不是产品native FAIL，也没有native PASS；4.0.0正式发布因关键门禁阻塞，未提交/推送/tag/release。版本预检：公共最新版v3.0.0，tag5a882f51b5f89b4ac36dff7512700572a54b01b7是当前main祖先，相差326提交；main、tag源码和锁/说明版本均0.2.10。公开未见4.0.0，未来发布前仍须认证核查已有草稿/标签，不能覆盖。元数据未提前改号，包版本/来源验证及CI/附件发布均未执行。4生产文件＋2测试＋7文档待审查/验收；调试产物均在ignored.artifacts。后台既有4023＋8exactknown、36新契约、headless07的25/25及代码/协议独审仅证明可进入原生，不能代替之。最终证据.artifacts/table-scrollbar-054-live4/blocked-outcome.json，授权/同hash11文件协议/release-plan.json/结束归档/独审均保留，原main524构建、2349历史、053的72证据与candidate03的1476源/524构建hash不变。下一步先由设备安全策略维护者核实该保护器拦截，再以合法允许的原保护协议、新唯一runId恢复验证；不能去掉保护或绕过拦截。以下为此前后台及原生历史。

最终后台检查点candidate03：ViewPlugin.update只排队一次keyed requestMeasure.read，布局读取在专用read阶段完成，generation丢弃已取消的旧请求；测量后维持纵向bar手势比例。headless07仍25/25，max归一误差0.000017507/输入后≤2px；新增两项验证update不读布局及取消后旧read不运行。28测量/生命周期＋8路由=36项定向用例，独立1476源码/524构建原lint/typecheck/build/strict通过（4023PASS＋8exactknown，0unexpected/collection/hook/unhandled errors）。最终只读复审允许进入原生验证，尚不能发布；errors[]只覆盖pageerror，未审计console测量循环警告。新版native、track/page/arrow及任意异步widget尺寸仍未测，前台继续释放，本阶段无可见窗口/OS输入，未提交/推送，HEAD仍7bdf04739415fb0750835da66e1c9d35fe893fe1。最终证据.artifacts/table-scrollbar-054-bg2/background-outcome-03.json；candidate02/headless06与全部失败冻结保留。以下包含02中间检查点及更早历史。

状态：**IN_PROGRESS / 新锚点候选后台门禁与独审通过，原生验收待测；未提交/推送**。

后台阶段：冷表格未测量高度触发CodeMirror测量后的文档锚点补偿，与scrollbar按范围比例定位冲突。headless02中30表有29表估计33.296875px、实际约1505.390625px；7次程序scrollTop写入来自EditorView.measure，其中+1676/+1614与anchor增量一致。等字符/字节/1831行无表格控制也有13次较小补偿；逐表预热后高度变化和程序补偿均0。这证明一个明确机制，不声称已解释所有视觉位移。

新候选用公开ViewPlugin.update在补偿前捕获当前top/上次完成测量的range，updateListener在测量循环后恢复比例。仅纵向bar手势有效，显式事务（含effect-only scrollIntoView/scrollSnapshot）、松手/取消/失焦/隐藏/普通输入/resize/font/load终止；全局监听只在活动期间注册。无全表扫描、DOM重建、高度缓存或估算算法改动。host保留轴向几何策略，adapter不反向依赖renderer；CM依赖升级须重跑plugin-update→anchor→updateListener时序检查。

已通过：26测量阶段/生命周期契约＋8路由=34PASS；headless06为25/25（冷table/plain×上中下×上下行、warm、cell.focus→scroller.focus、wheel/up/effect/font/load/Outline/reading/snapshot）。活动组比例误差最大0.000017507，输入后像素误差均≤2px；取消组0候选纠正写入，25组源码不变。Chrome155.0.8059.84/headless、980×650/DPR1、Times New Roman18px，非Electron146原生窗口；合成mousedown/程序滚动不算native，jsdom不算布局实测。

独立candidate-02快照1476源码/524构建，原npm lint/typecheck/build/strict均通过：4021PASS＋8exactknown、0unexpected/collection/hook/unhandled errors。独审“可进入原生验证，尚不具备发布条件”。原main524构建、2349历史、053的72证据及candidate01的1474源码/524构建/10helper逐hash不变；31native proof/34report/6guard原件hash匹配。证据.artifacts/table-scrollbar-054-bg2/background-outcome-02.json，06的4生产文件＋2诊断入口另存/hash冻结。headless01准备失败、03过期scroll比例回拉、04错误range和unit01一次blur失败全部保留，早期原型没有冻结源码快照，不冒称可逐字重建。

未测：新版Windows持续按住/反向、track/page/arrow，以及非load/font/显式事务的任意异步widget尺寸变化。比例稳定不等于正文绝对位移为零，不能称视觉抽动已解决。用户说明测试时正在输入，时段未定位；guard只能报告未观测，不能证明物理输入绝不存在。前台仍自12:26:47.117UTC释放，本阶段0可见窗口/OS输入，不提交/推送；下一原生阶段先报告并另存协议，不使用candidate01预检冒充candidate02。

09退出异常只定位到正常关闭协议前captureOwnedProcesses的Promise GC，上游V8/Playwright确因未知；fallback后4成员exit0/profile删除可证，但不算正常QuitPASS，原1条cleanup错误保留。以下是原生对照与更早阶段历史，当前以上述后台结论为准。

12:14用户解锁后已成功原生拖动。前台激活需同时连接caller/foreground和caller/精确owned目标线程，正常激活true且两连接解除；锁屏与激活准备问题均已越过，未改安全设置或降低校验。以原1831行30表无图片样本，1100×850/DPR1，在主干与候选各12种(顶部/中部/底部×起步方向×cell激活状态)做持续按住并反向，实测指针48点/例与帧级scrollTop/scrollHeight/DOM选择焦点/最终事件消费全部保留。

结果：两侧各6/12有反向跳回，均为向上起步，覆盖全部位置和两种cell状态；两侧最大1554px。主干6个active事件最终被消费，候选6个均不消费，但高度变化和跳回仍在，候选未解决用户抽动。初始08的一次微任务字段早于完整分发，最终判断使用live2的afterTurn，未删除旧原始记录。具体高度估计/测量来源待后台定位，不能把相关性当全部根因已查清。

主干09首个底部例拖动完成后调试Promise回收造成退出捕获失败，保留1条原始cleanup错误；进程与目录已实际清理。10补跑底部4/4正常退出；候选11的12/12诊断执行正常完成。诊断执行PASS不等于体验PASS。12:26:47.117UTC已归还键鼠；31启动/124产品成员退出、34临时目录删除、全部guard无物理输入、原文原盘一致，31helper退出。原524构建/2349历史/053的72证据hash不变。完整比较与原始证据hash见.artifacts/table-scrollbar-054/native-comparison.json。

下一阶段后台定位虚拟高度与锚点，当前候选和全部失败保留、不提交推送；再次需要前台先报告。以下为此前阶段历史。

最新阻碍已具体定位为Windows锁屏。用户11:12UTC批准直接接管后，冻结主干524文件校验通过；04普通激活返回false；05普通AttachThreadInput返回false、Win32错误5(ACCESS_DENIED)。原生记录前台PID10328，只读核验ProcessName=LockApp、SessionId1，测试和helper也同会话。未降低保护或绕过权限，OS输入0。11:15:24.898UTC结束释放键鼠；8产品成员+2helper退出，2临时隔离目录删除、cleanup0、source/disk一致，证据lockscreen-stage.json。需要用户解锁yuluStation Windows桌面后才能恢复；候选及持续/反向/顶部中部底部矩阵仍未跑，不称抽动修复完成。以下保留此前后台与前台尝试历史。

后台结论：首轮坐标计算混淆native client与Electron内容（差26px）；product.focus会额外聚焦正文，无法保留cell；SetForegroundWindow返回值原来被忽略，现增加BOOL/前后HWND/PID/thread/session与100ms限定观察。6项虚拟前台策略及5项坐标测试通过，未执行native API。03确切的系统拒绝条件仍未知；不以Windows前台限制的通用规则冒充本次确因。

局部产品候选：renderer将既有scrollbar判定通过配置传给adapter，Markdown capture在记录pointer意图/消费事件/改选择或焦点前返回。生产仅2文件8行，不重写DOM/宽高/锚点。8项新纵/横与正控制全部通过，加38控制共46PASS；原1PASS/2RED保留。独立1474文件快照中lint/typecheck/build/strict通过：3995PASS+8exactknown、0unexpected/errors/skip。候选副本fishmark-054-background-candidate-01的524构建/10helper及源码hash冻结；原构建与历史保留，详见candidate-ready.json/background-outcome.json。

剩余证据：真实前台激活预检、inactive/active四例native对照、候选真实窗口/原生拖动回归及独审，均未完成。用户抽动问题没有解决结论，native undo/IME未测。下次先约30–60秒无OS键鼠注入预检，具体新许可命令见handoff；成功后再报告安排拖动。当前前台权限已结束，无新窗口/抢焦点/输入，未提交或推送。

以下为此前授权尝试与后台准备历史。

用户10:55UTC明确授权后，10:57:05–10:58:44UTC按原1831行/30表/无图片样本尝试3次，每次均在任何鼠标注入前停止。01坐标校验拒绝（native client高811与Electron内容785）；02修正内容区映射后前台归属不匹配；03仅对精确自有窗口show/focus及SetForegroundWindow仍不匹配，target12519314/actual5706778。未绕过保护，没有真实拖动，active-cell/up对照未运行；不能据此确认用户抽动根因。原生选择/scrollTop/高度未变、DOM mousedown0、注入0、物理输入0、leftHeld=false。

前台10:58:44.973UTC结束并归还；3个helper退出、12个owned产品成员退出、3个临时appData/userData目录删除、cleanupErrors0，源文和原盘一致。实际隔离路径与精确原始证据hash见.artifacts/table-scrollbar-054/foreground-attempts.json。后台需先解决自有窗口前台激活失败；再次前台须报告协调，不再沿用本轮时段。以下为此前后台准备与候选诊断的历史记录。

基线main7bdf04739415fb0750835da66e1c9d35fe893fe1，开始时工作区clean。YULUSTATION Win11build26200/i7-13700K/RAM34088263680B/Node24.13.0。本地未见重复node/Electron测试；任务列表接口系统错误，跨线程排重尚不完整。

用户补充“有表格吧 没有图片”。已生成无图片固定长样本(1831行/30表/223530B)及纯文本控制样本(1261行/154750B)，均明确为合成样本；不冒充用户原文。

已确认的后台契约失败：新jsdom测试中，916/900px scroller的右侧gutter事件被现有shell helper识别；inactive1PASS，active2RED。表格active时capture处理preventDefault；fallback正文分支还令selection31→59并将focus转正文，源码不变。**未证实真实原生scrollbar事件经过该路径，不能把它称为用户抽动根因**；虚拟高度与锚点问题也待实测。

已运行：4文件38项既有table/viewport/caret控制测试PASS；typecheckPASS；新契约测试2FAIL/1PASS(预期RED，原log保留)。未跑Electron/native/截图、完整回归/lint/build。当前没有任何054前台窗口或OS输入。

原生协议已准备但未运行：独立内部track helper及inactive/active × down/up四例，绑定PID/starttime/executable/HWND与实际客户区track，每步核验、自有进程清理、物理输入中止及独立2.5s释放deadline。PowerShell AST、PowerShell5 C#仅编译、Node语法和4例发现通过；两个无授权入口拒绝通过，没有native API/输入。原运行时916文件、构建524、历史2349及053证据72文件hash再次通过。旧外拖helper/guard未修改。

新增中央表格合成样本1620行/31表/190986B/无图片，从50%thumb中点开始以避免猜测最小thumb大小；原1831行样本保留。真实输入仍未测，不把程序定位或CDP点击作为原生拖动。一次基线对照预计前台6–8分钟，父线程等待本轮接管答复。命令和限制见handoff，native-preparation.json记录准备hash。真实证据后再选最小修复，完成门禁/审查/发布；保持Tab/Outline/table点击行为。

证据根.artifacts/table-scrollbar-054；[intake](../../docs/plans/2026-10-19-table-scrollbar-intake.md)、[handoff](../../docs/plans/2026-10-19-table-scrollbar-handoff.md)。1470原源码/524构建/2349历史及053的72证据文件已核对冻结。M9仍0/3，性能与cp13/cp16/Library边界不变。

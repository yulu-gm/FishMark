# TASK-TABLE-SCROLLBAR-054 background handoff

2026-10-19 4.0.0发布阶段：用户14:56 UTC明确直接发布，取消等待原始文档/可见复现的条件。代码审查结论为无具体阻断缺陷，可带已知限制发布；仍须本次版本构建、回归和安装包基本核验。Windows手工两版均未见抽动，视觉效果尚未确认，不能称已修复。后台隔离发布，不运行被安全检测拦截的guard、不注入键鼠、不关闭现有手工窗口；以下旧“等待复现后才发布”状态已由本段更新。

2026-10-19 14:06 UTC最新结论：用户手测两边均未见抽动，**未复现，不足以验收candidate03，不发布**。只读已核对同样本SHA、不同且来源正确的editor bundle；无程序预滚，两边首mousedown仍top0/height43673，首轮大幅手动遍历后才趋于height105860。没有逐表测量，不能写准备时已全表预热，首次用户未见异常也须如实保留。旧24例的主干及candidate01各6/12绝对top反向、各12/12出程归一比例反向（最大3.19个百分点），是测量指标，不等于已证明可见thumb抽动；旧组不是candidate03。当前手工日志无连续OS轨迹/滑块画面，且字体与headless不同。

本轮0新窗口/OS输入/关闭/重置；两现有手工窗口不动。用户“上号”为测试期间误输入，时段未定位，不把guard未观测当成无人干扰证明。只读快照/逐例复算在.artifacts/table-scrollbar-054-manual/readonly-reassessment-2026-10-19T14-06-34-273Z/reassessment.json，详细边界见reports/task-summaries/TASK-TABLE-SCROLLBAR-054.md首段。最短**待验证**路径：新冷文档→Outline直接Section14→关Outline→track内短上拖50–100px→停→反向→松手，再以新冷文档测cell-active；不要先全幅扫过。未在本轮执行或开新窗。若仍两边无异常，由父线程收集最小脱敏复现片段及窗宽/字体/缩放/触发动作，无需完整私人项目。HEAD7bdf04739415fb0750835da66e1c9d35fe893fe1，未提交/推送/发布；旧安全拦截不绕过。

用户13:48 UTC批准打开手工窗口后，两窗已正常Electron启动并保持可见：左侧FishMark 原版 MAIN · 7bdf047 · 0.2.10（tab原版 MAIN.md，PID37796），右侧FishMark 修复版 Candidate03 · 0.2.10（tab修复版 03.md，PID2380）。main冻结524构建、candidate03的1476源/524构建启动前逐hash核验；实际appData/userData各自独立，source SHA一致/1831行30表0图片，均1084×785/DPR1，ready时均focused=false。仅隔离/标签/首次showInactive和只读滚动采集包装，加载未改的各自built main；未运行被拦guard或编译、未键鼠注入/改安全设置，无90s自动关闭；真实用户首次点击后恢复正常focus/show。窗口留给用户，等待中段上拖/停/反向/松手及激活cell后重复反馈；手工局部观察不算完整原生或发布通过。会话与实际路径见.artifacts/table-scrollbar-054-manual/latest-session.json及session-QYRvjD/ready-outcome.json，未自动清理这两个仍在用的profiles。

只读安全复核补充：拦截对象是外层输入guard由Add-Type生成的临时s1kfp3zc.0.cs，失败时间只能界定在UTC13:14:17.905之后至13:15:15.723之前（本机UTC+8约21:14–21:15），没有精确单秒日志。本轮默认受限会话读取SecurityCenter2清单和Defender/CodeIntegrity/AppLocker/PowerShell日志均被拒，未提权；检测厂商/名称/规则仍未知，旧窄查询无事件不代表不存在检测。首选下一轮由用户手工操作可核验来源的主干/候选隔离窗口，先做4关键对照，不伪称完整38例或自动逐帧通过；本轮不启动窗口/操作前台，不使用替代注入方式。另可由用户或设备管理员只读查安全软件的相应拦截记录，无需关闭保护或加排除。已另存3份4.0.0版本/发布说明草案并深比较依赖不变，均未应用，项目仍0.2.10；原生/包门禁及正式发布继续阻塞。证据.artifacts/table-scrollbar-054-live4/security-audit-readonly.json、manual-check-plan.md、version-preparation-review.json，旧证据保留。

最新原生/发布阶段：BLOCKED。用户已明确授权继续接管，并于13:04 UTC批准质量通过后提交main及发布4.0.0；授权无需重复索取。13:14:16-17桌面只读预检PASS，但随后既有外层输入guard第8行Add-Type被Windows安全检测阻断（临时cs提示包含病毒或潜在垃圾软件），未执行后续保护启动/Node产品启动。guard目录0文件、E2E run目录不存在，本轮产品启动0/手势helper0/OS输入0/产品profile0。13:15已告知归还键鼠，13:18:33完成结束归档。具体安全产品/规则未知；窄时段Defender日志无匹配事件，不能擅自归因。未重试、改排除、换编译路径或降低安全设置。

新版38计划原生例均未运行，不是产品native FAIL，也没有native PASS；4.0.0正式发布因关键门禁阻塞，未提交/推送/tag/release。版本预检：公共最新版v3.0.0，tag5a882f51b5f89b4ac36dff7512700572a54b01b7是当前main祖先，相差326提交；main、tag源码和锁/说明版本均0.2.10。公开未见4.0.0，未来发布前仍须认证核查已有草稿/标签，不能覆盖。元数据未提前改号，包版本/来源验证及CI/附件发布均未执行。4生产文件＋2测试＋7文档待审查/验收；调试产物均在ignored.artifacts。后台既有4023＋8exactknown、36新契约、headless07的25/25及代码/协议独审仅证明可进入原生，不能代替之。最终证据.artifacts/table-scrollbar-054-live4/blocked-outcome.json，授权/同hash11文件协议/release-plan.json/结束归档/独审均保留，原main524构建、2349历史、053的72证据与candidate03的1476源/524构建hash不变。下一步先由设备安全策略维护者核实该保护器拦截，再以合法允许的原保护协议、新唯一runId恢复验证；不能去掉保护或绕过拦截。以下为此前后台及原生历史。

最终后台检查点candidate03：ViewPlugin.update只排队一次keyed requestMeasure.read，布局读取在专用read阶段完成，generation丢弃已取消的旧请求；测量后维持纵向bar手势比例。headless07仍25/25，max归一误差0.000017507/输入后≤2px；新增两项验证update不读布局及取消后旧read不运行。28测量/生命周期＋8路由=36项定向用例，独立1476源码/524构建原lint/typecheck/build/strict通过（4023PASS＋8exactknown，0unexpected/collection/hook/unhandled errors）。最终只读复审允许进入原生验证，尚不能发布；errors[]只覆盖pageerror，未审计console测量循环警告。新版native、track/page/arrow及任意异步widget尺寸仍未测，前台继续释放，本阶段无可见窗口/OS输入，未提交/推送，HEAD仍7bdf04739415fb0750835da66e1c9d35fe893fe1。最终证据.artifacts/table-scrollbar-054-bg2/background-outcome-03.json；candidate02/headless06与全部失败冻结保留。以下包含02中间检查点及更早历史。

状态：IN_PROGRESS / 新锚点候选后台门禁与独审通过，真实原生待测；未提交/推送。

最新后台阶段：headless程序写入栈与height/anchor增量确认EditorView.measure文档锚点补偿，冷表格放大高度估计误差；等长无表格较小，warm表格0。03/04原型因过期事件或错误range被否决并留原始失败。最终公开ViewPlugin/updateListener候选仅在纵向bar手势维持比例，按当前top/上次完成测量range捕获；普通导航/编辑/轮滚及结束信号终止。无DOM重建/宽高算法/全量测量/缓存。

新副本C:/Users/wuche/Documents/Codex/2026-10-08/task/fishmark-054-background-candidate-02冻结1476源码/524构建；原npm lint/typecheck/build/strict=4021PASS＋8exactknown、0unexpected/errors。34定向PASS、headless06=25/25（含active-cell→scroller和Outline/reading/snapshot取消），最大比例误差0.000017507/输入后≤2px。06另存/hash固定4生产文件＋2诊断入口；Chrome155/headless/980×650与Electron146/native/1084×785分开。原main/candidate01/历史证据hash不变，见.artifacts/table-scrollbar-054-bg2/background-outcome-02.json及independent-review.json。

独审仅“可进入原生验证，尚不具备发布条件”。下一步准备并报告新版native，不继续无限堆后台仪表；candidate02尚无冻结的新native helper预检，须另存版本、核验源码/构建/协议。真实持续反向/上中下/两种cell状态与track/page/arrow待跑，同时区分thumb归一比例与正文位移。任意异步widget自身尺寸（非load/font/显式事务）未覆盖，CM依赖升级须重新核验时序，不能称全部视觉抽动已解。本阶段无可见窗口/OS输入，前台仍释放，禁止commit/push。

用户说明测试时正在输入但无准确时段；guard未观测不等于输入绝不存在。09异常发生在normalClose前owned-process捕获，上游Promise GC原因未知；fallback四成员退出/profile删除与原1条cleanup错误并存，不称normalQuit全过。以下为旧原生与准备历史。

最新12:14UTC用户反馈“已解锁”并允许继续。12:14:57只读确认前台explorer/session1；06普通激活false，连接前台线程成功但仍不激活；07增加连接精确自有目标线程、正常Restore/BringWindowToTop/SetForegroundWindow后返回true，前台精确匹配，两连接均正常解除。无安全设置/权限改动。07仅前台预检1PASS+3有意skip，不能当拖动通过。

真实主干08中部4例均跟踪native拖动，向上时scrollTop反向+1300/+1393，分别与scrollHeight45244→47007、47379→49228同时发生。初始微任务事件字段记录早于完整native分发，不应用其名为preventedAfterDispatch的false值判断是否消费；新live2同时保留microtask与下一task的afterTurn，后者才作为最终比较。

live2协议逐hash相同地复制到原checkout和冻结候选副本：原1831行/30表/无图片、1100×850、DPR1；从当次截图识别实际thumb，记录48个实测指针点，先持续24步再同次按住反向24步，精确窗口/track/物理输入保护与2.5s独立释放保持。主干09顶部/中部8例正常完成，底部首例拖动完成后normalClose的owned-process捕获遇到“Resulting promise was garbage collected”；原失败和1条cleanup错误保留，fixture确认4成员退出和目录删除。10以新实例同协议补跑底部4例均正常完成，不修改产品/guard/allowlist。主干最终12种与候选11的12种全有真实tracking证据。

可靠对照结论：主干6/12、候选6/12出现反向跳回，均是向上起步，顶部/中部/底部及active/inactive均覆盖；两侧最大反向跳回均1554px。主干6个active事件afterTurn均preventDefault=true，候选6个均false，证明路由局部效果，但跳回/高度变化仍存在，不能称用户问题修复。各帧scrollTop/height/DOM选择/焦点、OS指针/前台/capture和截图均保留；具体所有高度增量由哪部分未测布局产生仍需后台定位，不能单凭相关性重写列宽或高度算法。

12:26:47.117UTC候选结束后已归还键鼠，不再占用前台。本次解锁后的31个隔离启动、124个产品成员全部确认退出；34个临时目录（含3个有意skip的未启动fixture）已删除，原文/原盘一致，全部guard无物理输入。31个helper均已结束并有runner退出记录。1条原始cleanup观测错误保留，后续底部恢复4/4，不能写总cleanup0。native-comparison.json记录24对照、全原始路径/hash、恢复失败和清理证据。原524构建/2349历史/053的72证据hash复核不变；候选构建与旧helper仍冻结，live2是新增版本而非覆盖旧证据。

下一步仅后台定位视口测量/高度估计和滚动锚点更新，保留事件路由候选但不提交/推送。若再次需要前台，先报告；本轮实际输入已结束。以下为此前锁屏/准备历史，最新结论以本段/native-comparison.json为准。

最新11:12UTC用户明确允许直接接管直到可靠结果或需用户处理的阻碍（authorization-20261019-1112.json）。本轮先校验524个冻结主干构建文件和当前候选源码身份，再跑foreground-main-04/05无键鼠注入预检：04记录SetForegroundWindow返回false、before/after5706778、target10688708、actualPID10328、caller/owner session1；05沿用既有native helper的正常同会话AttachThreadInput方式，返回false、GetLastError=5(ACCESS_DENIED)，不尝试移鼠/按下。只读Get-Process核验PID10328实际为LockApp/session1，即Windows锁屏占据前台；连接/授权可用不代表桌面解锁。本次没有修改安全设置、绕过权限或放宽精确前台检查。

11:15:24.898UTC测试全部结束、键鼠已释放；8个owned产品成员与2个helper退出，2套临时appData/userData删除、cleanup0、source/disk一致。OS输入0，inactive/active持续/反向及顶部/中部/底部矩阵均未执行，候选未启动。lockscreen-stage.json保存完整日志hash与实际路径。需要用户先解锁yuluStation Windows桌面；收到解锁完成反馈后，按本次已授权目标报告恢复预检，再主干与候选真实对照，不把LockApp阻塞当作产品失败或原生修复完成。此前手动激活测试窗口的泛化建议由“先解锁桌面”的具体阻碍取代。

运行协议注意：foreground-main-04/05在原源码checkout执行，明确使用FrozenMainBuild模式（即旧dist已逐hash与官方main一致，当前2文件候选源码未被加载）。候选副本及其helper哈希仍冻结未改；本轮原checkout helper额外添加普通线程连接诊断，不能把它冒称候选已跑。未来需要同协议对照时应显式冻结/核验两侧测试协议版本，保留旧版本与本轮失败。

后台续阶段：确认01将native client811高当成网页viewport785高，实际Electron内容原点较client向下26px；抽成纯坐标函数，保留native外窗/内容/viewport交叉校验，5项记录回放/拒绝测试通过。旧product.focus()除window.focus还会focus正文，不能用于active-cell对照；专用入口改为仅show/focus自有window。03的SetForegroundWindow结果原来被丢弃，且立即检查，无法区分API拒绝、异步就绪或随后丢失前台。现在记录调用前后HWND、BOOL返回、caller/owner/actual PID/thread/session（不读取别的窗口标题/内容），限定100ms观察后仍精确要求target=actual。6项虚拟callback策略测试通过；实际系统拒绝的具体条件尚无证据。Microsoft明确限制后台进程设置前台且即使条件满足也可能拒绝：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow 。未新增强制激活手段。以上变更只后台解析/编译/虚拟回调测试，未再调用native API。

独立成立的产品缺陷是host识别为scrollbar的事件仍被adapter Markdown capture消费。最小候选只改code-editor.ts与extensions/markdown.ts共8行：host注入已有isEditorScrollbarPointerEvent策略，capture在建立pointerEntry/改selection/focus之前返回，不重复算法、不改table高度/列宽/DOM或Tab/Outline/reveal。原3例1PASS/2RED保留；扩展8例(纵/横、inactive/active、null/body fallback、正文/无溢出正控制)全部PASS，与既有38项共46PASS，内容/onChange/选择/焦点/history深度均检查。这不是native undo/IME或用户抽动问题验收。

独立副本C:/Users/wuche/Documents/Codex/2026-10-08/task/fishmark-054-background-candidate-01保存1474文件源码快照、524构建、10运行helper哈希；原npm lint/typecheck/build/strict回归通过，3995PASS+8exactknown，0unexpected/errors/skip。原位旧构建与此前证据保持冻结。candidate-ready.json记录四门禁日志；副本内verify-candidate预检通过，错误目录调用会拒绝。HEAD仍7bdf04739415fb0750835da66e1c9d35fe893fe1，改动未提交。

下次需重新协调前台：先只做约30–60秒、无OS键鼠注入的前台预检（仍会创建/请求聚焦自有隔离窗口，需新许可），在上述副本目录执行下列命令；只有重新明确授权时才能运行，RunId必须唯一：

```powershell
./.artifacts/table-scrollbar-054/run-authorized.ps1 -RunId scrollbar054-foreground-probe-01 -Candidate -ForegroundProbeOnly -AuthorizedForeground
```

该模式只运行inactive/down的准备阶段，其余3例明确skip；结果不能当四例拖动通过。记录API返回与实际HWND后立即关闭、释放前台。如果确认前台成功，再报告并安排原1831行30表四例native对照；若失败，先据新诊断决定是否需用户手动激活的独立准备步骤，不能删除精确前台/own-track/物理输入检查。当前后台工作结束后没有执行该命令，也没有继续占用前台。

以下为此前授权尝试与最初准备的历史记录，生产候选与最新helper以本段/candidate-ready.json/background-outcome.json为准。

2026-10-19最新执行：用户10:55UTC明确同意本轮接管（authorization-20261019.json）。按指定原1831行/30表/无图片样本执行baseline-01/02/03；每次launch均先核验实际appData/userData位于新建Temp测试目录，文档仅为其中roundtrip.md。01在注入前因native client811px与Electron内容785px不一致而拒绝；02改为以实际Windows外窗与Electron内容bounds交叉映射，得到原点(688,353)/DPR1/比例1，随后前台归属校验失败。03在helper ready后仅show/focus自有窗口，helper对精确已验证HWND尝试SetForegroundWindow，仍失败：target12519314、actual5706778。未枚举其他窗口内容，未绕过前台检查；三次都没有进入pressed，也没有SetCursorPos/SendInput。这里的失败是测试工具前台准备失败，不是产品滚动体验FAIL，更不能称原生复现。

10:58:44.973UTC全部测试进程结束，已归还键鼠，不再使用本次前台时段。3次各1个inactive/down前置尝试失败，active/up共其余用例均未运行。3个helper已退出，12个owned产品成员均退出，3个appData/userData目录已删除，cleanupErrors0；原source/disk一致。原生事件0/注入0/物理输入0/leftHeld=false；before/after scrollTop22469、scrollHeight45587、clientHeight650保持不变，选择不变，只能证明未拖动。完整原始guard/proof/report及hash审计见.artifacts/table-scrollbar-054/foreground-attempts.json。后续先后台查明前台激活失败；再次占用前台须先报告并重新协调，不能直接重用本次接管。下文准备记录为本次尝试前的历史协议，native-preparation.json也为旧准备快照；实际执行以本段和foreground-attempts.json为准。

环境/排重：YULUSTATION，Windows11企业版26200，i7-13700K(16C/24T)，RAM34088263680B，Node24.13.0。HEAD与fresh origin/main均7bdf04739415fb0750835da66e1c9d35fe893fe1；开始时clean，无匹配本仓库node/Electron测试进程，最新计划053。任务列表MCP系统错误，跨线程无法完全排重。未读取受限会话目录。

后台发现：packages/codemirror-adapter/src/extensions/markdown.ts 的handleMouseDown，在表格cell激活、目标不在table时，fallback即使返回null也preventDefault；有正文位置时还改selection并focus正文。此为候选事件路径，不等于已证实用户原生滚动条抽动根因。真实Chromium原生thumb按下是否产生并经过这个DOM事件仍未测；虚拟高度/锚点候选未证实。table-widget已有mounted与offscreen高度复用，不能无证据重写。

新结构测试src/renderer/code-editor-scrollbar.test.ts：合成scroller为916px外宽/900px客户宽，scrollHeight12000、clientHeight600，clientX910/Y100被现有shell scrollbar判定识别。未激活casePASS；激活两caseRED(defaultPrevented=true)，fallback映射正文时selection31→59、focus从cell转正文，源码不变。仅jsdom契约，不是原生拖动或几何验收。raw background-red-01.log保留。

控制测试4文件38/38通过；npm run typecheck通过。未跑完整回归/lint/build/Electron/截图/native，不能称修复或验收PASS。

合成样本.artifacts/table-scrollbar-054/tables-no-images.md：223530B，1831行，30表，无图片；plain-no-images.md：154750B，1261行，无表无图片。fixtures.json记录sha256，明确不是用户原始Markdown。原1470源码/524构建/2349历史及053的72证据文件已核对并冻结引用于baseline.json。未继续性能实验。

下一步：先向父线程报告并获得054本轮明确接管，再通过现有product fixture创建独立实际appData/userData/临时文档。第一次只做一个固定样本的inactive/active-cell对照，观测原生scrollbar按下是否进入DOM捕获、是否preventDefault/改焦点，以及drag期间scrollTop/scrollHeight与可见唯一段落或table锚点。单独记录cell点击前后几何，不把程序scrollTop/CDP拖动算原生。

原生执行准备已完成，尚未执行：独立windows-scrollbar-drag.ps1与NativeScrollbar.cs仅供内部track手势；旧windows-pointer-drag.ps1和外层guard均未修改。新helper绑定本次PID/startTicks/executable/HWND，按实际client/viewport映射track坐标，每一步核验前台/同一HWND且不移出track，不主动激活窗口。设置physical-input hook、独立2.5s释放deadline、有限准备等待及自有进程清理。capture仅观测，不假定Chromium必须提供capture。远程用户注入与测试注入可能不可区分的限制保留。失败清理仍须保存证据并关闭自有product session。以上为静态准备，真实退出/拖动仍未验证。

新增对称上下段落包围中央表格的central-tables-no-images.md：1620行/31表/190986B/无图片，SHA256为2087c614813d85d1ff348f218c706ee14fa5eb287bd3621c7250484acc9af5be。明确是合成样本，原1831行/30表和纯文本样本保留。程序scrollTop仅用于准备50%位置，实际拖动必须用Windows原生鼠标；至少3个held期间不同scrollTop与足够归一化进展才能认定确有thumb跟踪，单次track点击不算拖动。

准备验证：PowerShell AST、Windows PowerShell5 C# CompileOnly（无native API调用）、Node语法通过；Playwright --list准确发现inactive/active × down/up共4例，未运行。两个入口缺少本轮授权均按预期拒绝。preflight-scrollbar054-static-20261019-02.json确认916原运行时源码/524构建/2349历史/053的72证据文件及中央fixture hash不变；native-preparation.json记录准备文件hash。

预计一次基线对照占用前台6–8分钟（四例串行，全局测试上限6分钟，另留准备清理时间）。父线程已询问本轮接管，等待明确答复，不重复询问、不重用053旧许可。授权后才可在本仓库执行下列命令，RunId须未使用：

```powershell
./.artifacts/table-scrollbar-054/run-authorized.ps1 -RunId scrollbar054-baseline-01 -AuthorizedForeground
```

默认仅诊断采样：执行成功不等于体验PASS，反向运动/heightRange/焦点/DOM消费保留原始记录。无法确证native thumb拖动则停止，不据此修改生产代码。未来生产候选须重建并冻结对应构建和严格稳定性验收，不能直接使用当前baseline-only预检。

验证后仅按证据做最小修复，保留Tab锚点、Outline与表格click/reveal/undo。再运行相关结构/实际窗口、lint/type/build/strict回归与必要完整产品门禁，审查通过后普通main推送并查精确CI。若仍未复现，记录未复现和样本边界，不盲改事件或高度算法。

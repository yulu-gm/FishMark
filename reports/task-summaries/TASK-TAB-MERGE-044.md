# 拖动标签到已有窗口

2026-10-15，YULUSTATION Windows11 / i7-13700K / 32GB / Electron41.2。公开main基线`a20f996c46b1cf305b34c7739a9e280ed5948435`，tree`af3a8e74715f0f13bbf4a8ed93cc9d8daf5ff6ff`；实施前及门禁前远端一致，起始工作区干净。本批只处理已有窗口接收标签，纯文本粘贴和排版间距继续独立排队。

## 原问题与最小修改

原pointer capture只支持本窗排序，其他释放位置一律分离新窗。真实原生探针在有正文的目标标签栏释放，确认实际命中目标HWND，仍出现第三窗；目标正文和来源身份完整保留。原生日志另显示来源mouseUp后5ms，目标收到同一globalX/Y的mouseMove。这是本机正向路由证据，不外推所有事件必在100ms内到达。

保留原捕获、Escape与同窗排序，通过main记录原生释放和真正接收事件关联一次性路由。窗口bounds只冻结保守否决：可能落在已有窗口却缺少正向事件时取消，目标关闭或移走也不能改为第三窗；不同目标竞争同一次释放则取消。目标仍须确认该点位于可见标签栏。空窗口保留有限标签栏接收区，支持最后一tab移回原窗。

来源复用现有removeTabMutation的seal、FIFO排空和失败恢复。非活动tab先通过既有激活/阅读缓存恢复自身视图，再封存，不能取当前另一个tab的caret。目标排空自己的草稿，暂存精确版本只读正文后才ACK；暂存不进入editable tab或授予文档资源权限。复用独立ACK broker，另保留覆盖ACK后等待文档锁的绝对deadline。提交仍走原transfer及资源epoch包装，并在锁内新增expectedRevision复核；提交前取消和提交后watcher故障区分，后一种不能再detach或盲目回滚。

跨窗handoff增加严格范围/有限数校验的源码锚点、相对y和横滚，原043 opaque effect不进IPC。目标用公开CodeMirror scrollHandler及同步公开测量完成恢复；不可见view拒绝排入迟到滚动，替换/销毁清理请求，保留未消费兜底的anchor映射和取消语义。没有重建cell DOM、改正文/列宽算法或缓存完整EditorState/history。

## 真实验证与保留的失败

基本真实两窗join与正常退出已通过。正式矩阵首轮1/6：图片语法中的视觉箭头不能当源码offset、恢复后的nativeInsert缺显式焦点、一次目标被遮挡而被HWND保护拒绝。修正测试前置条件后6/6通过，正文/位置/权限断言未放宽，全部正常退出。第二矩阵覆盖双方dirty、活动/非活动文档、原空窗往返、精确caret插入、阅读相对y、新滚轮和资源200/403往返，以及目标关闭、15秒timeout、非strip拒收与1.25倍接收窗缩放。后续补充的pending ACK、失败后重拖、同文件唯一owner与遮挡用例纳入最终完整门禁。

首次候选join正文正确，但normalClose异常退出4294930435并出现11个destroyed监听警告，该轮计FAIL。移除原生鼠标回调中的同步WebContents缩放查询，将换算移到发送请求阶段，并复用每窗唯一生命周期监听后，candidate02正常exit0、全部owned成员退出、错误/清理为0。两轮早期路由探针在目标React尚未挂载时过早发送File New，均属前置失败；等待真实欢迎界面后原基线探针通过。所有原日志、trace和失败记录保留在本机`.artifacts/tab-merge-044/`与对应`.artifacts/e2e/`运行目录。

旧“上号/误输入”回复在当前任务缺消息ID和时间，不构成本轮新输入干扰证据；没有据此撤销今天11:26的有效许可或否定历史测试。来源核实及更正单独保留，不读取原始会话目录。真实OS输入helper和物理输入guard均继续生效，guard的remote injected input局限保留。

## 恢复执行与当前验证

保留本地checkpoint `c24de83341e8fdfdee31b09c001cf61da36be205`及下节原始失败，继续在同一a20官方基线推进。15:02:47 UTC真实输入guard在Electron启动前观察到物理输入（injected0），当即停止自有Node树并暂停前台；此记录与旧无时间戳回复分开。用户15:57 UTC重新确认可接管，随后所有本轮真实拖拽和四项最终guard均未观察到物理输入，remote injected input局限继续保留。

关闭问题先有限比较精确a20独立构建与候选：原收尾idle各8/8，inspector待回包压力下基线6/6、候选5/6，复现实际0xC0000005。原失败和复现的Windows事件均指向同一offset `0x87dff5`；官方Electron41.2.0符号包通过SHASUMS校验，安装EXE CodeView GUID与符号MODULE匹配，地址落在`node::inspector::TcpHolder::WriteRaw`、Node24.14 `inspector_socket.cc:734`。这是故障位置证据，不把监听告警或所有原生崩溃归为同一原因。正常测试收尾改用公开`ElectronApplication.close()`请求真实application Quit、分离Node inspector并等待实际进程退出，保留exit0、所属进程退出及全部健康断言；无app.exit/kill成功兜底。改后压力12/12、idle8/8、原生Cancel→继续编辑→Quit Save/Don't Save及重启6/6，共32次正常启动退出通过。非终态Window.close/Cancel及目标关闭仍显式测试；最终入口是application Quit，不冒充标题栏关闭验收。候选压力首个配置误收集0用例不计通过，原记录保留。

路由增加真实mouseUp后250ms主线程停顿用例。旧150ms候选真实命中目标却取消；修后6/6通过，RAM日志捕获同点目标事件延迟251–252ms，离线纯路由回放c24均拒绝、新规则均接收。原477ms失败没有完整目标时序，不伪称已证明其每个细节。生产只将目标事件关联寿命与既有release freshness统一为500ms；100ms rendezvous、真实目标事件、同坐标±1、按钮状态、首目标/歧义、一次性路由及撤销保持。新350ms接受及501ms/错误坐标/按钮拒绝用例通过，没有放宽整屏授权。

960px模拟布局将自有窗口竖向错开，使目标strip在源矩形外。恢复首轮zoom0/6：原生日志确认起点被另一个同PID窗口遮住，foreground保护拒绝，未算产品通过。receiver改showInactive，来源最后重置topmost叠放；helper起点新增精确顶层HWND校验，原捕获、离源矩形和终点HWND保护均保留。修后1.25倍zoom6/6，完整9项矩阵重复18/18，包含双方dirty、活动/非活动长文、往返、caret/阅读/资源权限、关闭、超时、失败重拖、pending ACK及标题栏遮挡。没有修改OS显示或输入设置。

最终九门禁全部通过：lint/typecheck/build、strict3916＋8精确known（0unexpected/errors/skip）、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）。gzip1437333/1500000、initial103892/260000，预算/known合同未改。**完整Windows产品49/49、0失败/跳过/重试**，62次启动中57次正常exit0、5次预期恢复强退，无失败清理退出；所有所属进程退出、隔离profile清理及错误检查通过。新增merge流程记录12次原生gesture，另保留旧流程原生拖拽覆盖，物理guard无干扰；三个正式probe各4个实际成员，多阶段appData/userData均匹配独立临时根。

type/build/strict/perf沿用恢复批已通过结果，之后仅两个原生E2E fixture调整；38项输入与191项构建/lock/provenance哈希核对，重新lint及完整产品/三个probe。文档收尾只更新四份说明，运行源码不再改变。本机`.artifacts/tab-merge-044-resume/`保留`final-validation.json`、`real-stall-replay.json`、`close-validation-summary.json`、最终冻结清单、独立审查及`publication.json`中的精确提交/tree/官方CI；发布只有在最终独审通过后普通推送main，不强推。源码与运行审查的最终结论以该发布记录为准。

## c24 checkpoint当时的门禁与发布阻塞（历史保留）

以下是恢复修正之前的时点记录，不能替代上节最终验证或精确提交CI。

九门禁已运行，**8项通过、完整产品E2E失败，不能发布**。lint、typecheck、build、strict3915＋8 unchanged exactknown通过（0unexpected/errors/skip）；foundation310、editing79、safety7、formal121/121/2541通过（99known、0unexpected/not-run）。gzip1437333/1500000、initial103892/260000，预算与known名单未改。

最终完整产品为**45/48，3失败、0跳过**：

- idle autosave的正文、磁盘、dirty、焦点及timer/save归因均通过，正常关闭却实际退出3221225477/0xC0000005；日志虽已到app:quit(exitCode0)，仍不能覆盖真实失败。file-watch-registry每次sync重复绑定destroyed是a20已有缺陷，044多一个监听可能较早触发告警，尚无native crash因果证据；本批未擅改watcher或用重试掩盖退出异常。
- active长文一次真实命中目标HWND后只有drop:start/end、未发receipt请求，来源保留、目标仍为B、没有第三窗；首个drop调用约477ms后返回。原矩阵及gates02该场景通过不覆盖此可靠性失败，根因尚未定位。
- 960px模拟布局的zoom用例落点EndX103仍在源矩形60…960内，helper在发送前拒绝；不算真实窄屏接收通过。实际宽屏1.25倍缩放曾通过，但不能替代此失败。本批保留保护条件与失败fixture供下一步修正。

61次产品启动均验证所属进程退出，cleanup0；其中53次正常exit0、1次正常关闭异常退出、5次预期恢复强退、2次失败清理退出，不能统称61次正常成功。三个正式probe各4个真实成员、多阶段实际appData/userData一致，正常退出并清理成功。四次最终guard均未观察到物理输入，产品运行含22个预期注入事件；remote injected input局限仍保留。

gates01执行连接中断，完整E2E未到终态且旧空窗固定落点拒收，只计此前type/build/strict通过；不根据缺失guard终态声称该轮无干扰。旧空窗fixture改用真实strip落点后gates02通过该case，整套47/48，唯一失败是960px zoom落点EndX865仍在源0…900内。final03仅改变自有窗口布局和相应落点，其余36项输入及191项产物hash一致，沿用gates02的type/build/strict，重新lint、完整48产品及其余四门禁；final03的三个失败如上，不继续重跑以求全绿。

33项运行源码/测试与191项产物/lock哈希经汇总核验；文档收尾另冻结37项checkpoint输入。独立源码审查有界PASS、运行验收与发布签核BLOCKED。汇总、原始证据、独审及精确本地commit/tree见`.artifacts/tab-merge-044/`中的`final-summary-blocked.json`、`frozen-inputs-runtime03.json`、`frozen-inputs-checkpoint.json`、`frozen-build.json`、`independent-review-final.txt`及`checkpoint.json`。只创建本地checkpoint，不push，未触发对应HEAD的官方CI；公开main仍为上述a20基线。下一步先定位原生命中后的取消及正常关闭崩溃，并修正实际可达的窄布局前置条件，再完成完整产品门禁与发布审查。

本批不涉及Mac或真实IME验收，不动冻结cp13/cp16、Library访问、系统设置或文件关联。RF901 PAUSED，RF902/RF903 IN_PROGRESS，M9保持0/3。

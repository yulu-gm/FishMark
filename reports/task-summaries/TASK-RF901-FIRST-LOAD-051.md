# TASK-RF901-FIRST-LOAD-051

结果：**Windows局部修复验收PASS；RF901首次打开预算FAIL**。基线main2b6e8dff320f086c76d6c1a4b6841ba77ef3bced/tree7ce4f487f0a820f84e63dd7da065d9f364c7b00c，CI38798265982四绿。最终独审及普通main精确commit/tree/四项官方CI终态以本批`.artifacts/rf901-first-load-051/publication.json`为准，本地通过不替代发布。

实现及开发证据见[handoff](../../docs/plans/2026-10-15-rf901-first-load-handoff.md)。组件本地receipt仅消费同controller、首次tab/epoch/loadRevision及实际构造source；不匹配也消费，新实例fallback不受保留applied revision拦截。身份/session/selection/reading/ACK照常，后续同文本reload仍replace，无通用缓存或parser架构改造。

真实产品用例发现基线同文本外部reload不新load revision，旧undo可复活；未改应用实现时新增回归RED。独审另定位IPC将error/stale误报成功，typed现有结果后只success映射resolved；应用仅实际成功且活动target相同的reload复用forceEditorReload。committed watch-error在seal/lease内await现有非force对账，保留错误并恢复新正文，同文本错误不强制清history。两个独审阻断均收口，最终源码审PASS。

开发：首构造RED7/16、应用同文本RED1、IPC结果RED4/1、已提交watch-error对账RED2；终版501定向PASS。target01原始同文本history失败、target02 checkpoint读取缺失文件、target03按钮名称、target04删除重建触发file-identity-changed保护均保留；target05移走/移回同一临时物理文件，两真实成功/失败重载流程PASS。未放宽history/disk/身份断言。

051-final-01原位lint失败：冻结050与051诊断TS共28any；不改旧文件或规则，在干净1466文件源码镜像逐hash核对、同node_modules依赖原样npm run lint。final02仅新增React测试类型声明失败，修正tuple非空和Activity.children，不改断言；final03镜像lint及原位其余八门禁全通过。strict3986＋8精确known（0unexpected/errors/skip）、Windows60/60（0skip/retry/flaky）、74启动=69正常exit0+5预期恢复，310所属成员退出，14native助手九阶段，全部profile删除/cleanup0；foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）；Windows gzip1437871/1500000、initial104006/260000。74原始日志监听超限warning0，100快照destroyed监听4→4。原位九门禁全绿并未声称。

初始次数：050/051相同531783B源码SHA545601ad9d770898e23e5551e938bcaa4ebaecd8446941a4145a4db8777f6d37，非空全文parse2→1。051唯一production诊断constructor1/replace0、controller1/tab-1/epoch2/loadRevision1；两个额外empty parse单列。子进程canonical/offset2插入/精确undo/disk/实际preload/sandbox/双路径/4owned退出/profile删除/cleanup0通过。父run-count以短label匹配完整span而后处理FAIL，原051-count-01 guard exit1保留；新离线完整label审计及独审PASS，没有诊断重跑，也未创建冒充旧命令成功的count-completed。

性能：最终无插桩产物一次051-six-01，计时main脚本与049字节相同；两个独立fresh进程/profile，每个随后两次不同文件warm；相同fixture、1280×900窗口、light/effects off、DPR1、字体/宽度、500/1500ms预算。主进程单调时钟t0在require生产main之前（非OS spawn），warm在open menu之前；20ms轮询DOM，再fonts.ready+两RAF，完整源码/插入/undo检查都在t1之后。构建/磁盘cache可能暖；不是compositor/物理IME或p95/p99证明。

|样本|049 DOM ms|051 DOM ms|049 fonts+2RAF ms|051 fonts+2RAF ms|snapshot ms|正确性 ms|预算|
|---|---:|---:|---:|---:|---:|---:|---|
|5k fresh|1366.794|1183.295|1414.860|1236.361|3.689|164.264|FAIL|
|5k warm1|253.848|257.465|262.022|269.222|1.232|152.623|PASS|
|5k warm2|234.158|249.872|244.168|262.224|1.402|151.521|PASS|
|20k fresh|2686.354|1824.128|2810.476|1945.669|3.752|497.966|FAIL|
|20k warm1|947.441|919.325|957.610|929.684|3.484|414.129|PASS|
|20k warm2|898.111|915.782|906.206|924.054|3.773|417.967|PASS|

首次观察分别减少178.4994ms/864.8078ms，仍超预算；四暖样本三高一低，不能推断稳定分布或把050嵌套837.7ms视作承诺。全部六样本source/insert/undo/disk、8owned退出、两profile删除、guard物理/注入0均PASS。原始全精度在本批mixed-5000/mixed-20000/sample-*.json、results和measurement-validation；单独diagnostic不混入六样本。

原始证据`.artifacts/rf901-first-load-051/`与`.artifacts/e2e/051-*/`，049/050冻结587文件全hash保持；047原FAIL/profile未动。用户本机YULUSTATION Win11/i7-13700K/32GB/RTX4070/Electron41.2，独立environment记录，不混Mac/9900X。M9仍0/3，RF901未验收，RF902/903 IN_PROGRESS；Mac/strict真实IME、Typora对照、cp13/cp16及旧Library交接不纳入本批。未重跑六样本或为预算做新改动。

人工验收：临时文档编辑/undo/redo/save，同文本外部touch后Reload不能undo回旧草稿；删除文件后的Reload失败保留undo。切换长文与阅读/source/outline后继续准确保存。

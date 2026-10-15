# TASK-WATCH-LIFECYCLE-048

结果：**Windows本地验收PASS**。基线main60bedefd6319373674d65dca6fe1d17472996027，tree c9403583b96b5fa8e56cfdaa7ec2d62164e47cfe，CI38791422167四绿。最终独审及普通main精确提交/tree/四项官方CI终态见`.artifacts/watch-lifecycle-048/publication.json`，本地通过不能替代发布。

原实现每次工作区同步都注册once(destroyed)，空路径/重试也累加。异步初始stat返回之前未发布订阅，销毁清理看不到它，返回后可能复活watcher。新增受控测试在原实现11失败/12通过；修复后25/25。

仅FileWatchRegistry内部使用WeakSet一次绑定、预发布desired/订阅、共享初始化Promise及entry身份撤销；初始化失败可重试、旧失败不删除替代entry、共享存活窗口保留watcher。内部写等待初始化并复核身份，防止晚baseline覆盖。没有修改公共接口、renderer、监听上限、warning策略或known allowlist。逐路径初始化仍存在，未承诺多路径原子观察或外部writer原子性。

真实产品048-target-01通过：100公开快照后destroyed监听总数稳定、无监听超限warning、canonical/disk/dirty不变；正常exit0、owned成员退出、隔离profile删除和cleanup0；guard无物理/注入输入。独立源码审查PASS，最终九门禁/发布以本批原始记录和publication精确身份为准。

最终048-final-01九门禁：lint/typecheck/build、strict3966＋8精确known（0unexpected/errors/skip）、Windows58/58（0skip/retry/flaky）、foundation310、editing79、safety7、formal121/121/2541（79existing+2363runner+99known、0unexpected/not-run）。Windows gzip1437744/1500000、initial103958/260000。72启动=67正常exit0+5预期恢复，全部owned退出/profile清理/cleanup0；14native助手完整九阶段，四guard无物理输入、三probe双路径隔离通过。72启动原始process:warning无监听超限；100快照actual destroyed总数4→4，warning列表空。源码与构建hash冻结，最终独审/精确CI另存本批publication。

证据：`.artifacts/watch-lifecycle-048/`、`.artifacts/e2e/048-target-01/`；047原始FAIL及保留profile未改，不重跑六样本。M9保持0/3，RF901 PAUSED、RF902/903 IN_PROGRESS；Mac和真实IME未验收。

人工验收：在自有临时Markdown打开两个窗口，反复切标签；关闭一窗后外部修改副本，另一窗应继续提示冲突；继续编辑保存并核对字节，再正常退出。不要用真实文档冒险验证。

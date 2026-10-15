# TASK-WATCH-LIFECYCLE-048 execution handoff

实现：FileWatchRegistry用WeakSet为每个target只绑定一次destroyed；异步stat之前发布desired路径和订阅，共享初始化Promise。返回后核验entry身份和有效订阅，新同步可撤销旧setup，失败只移除自身entry并允许重试；watch同步回调销毁也关闭返回的watcher。内部写入等待初始化并复核身份，防止初始baseline覆盖写入完成值。公共接口、renderer和warning策略不变。

开发证据：原实现新增生命周期用例11失败/12通过，修后25/25。实际产品100次getWorkspaceSnapshot，WebContents destroyed监听总数稳定、无MaxListenersExceededWarning、canonical/disk/dirty不变、正常exit0、所属进程退出和隔离profile删除；guard无物理/注入输入。原始证据在`.artifacts/watch-lifecycle-048/`和`.artifacts/e2e/048-target-01/`。

最终验收：冻结输入后依次lint/typecheck/build/strict/完整Windows产品E2E/perf:baseline/editing/safety/formal，独审后普通main推送并核验精确SHA四项官方CI。最终数值见本批任务报告和publication；不预先认定通过。

本地终态：048-final-01九门禁通过，strict3966＋8精确known、Windows58/58、72启动（67正常+5预期恢复）全部owned退出/cleanup0；foundation310、editing79、safety7、formal121/121/2541、gzip1437744/1500000。72启动监听超限warning0，100快照4→4。最终独审和精确发布仍依publication，047冻结不变。

人工验收：自有临时Markdown在两窗口打开；重复切标签/读取工作区，关闭其中一窗后外部更改文件，另一窗应继续收到冲突提示；关闭最后一窗后正常退出。只在副本确认继续编辑/保存字节一致。

边界：受控Promise覆盖初始化stat途中销毁与共享存活；外部change stat途中销毁不发送事件是原有行为，本批保留。047失败/保留profile不改、不重跑六样本；不提高监听上限、不隐藏warning。M9仍0/3；Mac、真实IME未验收。

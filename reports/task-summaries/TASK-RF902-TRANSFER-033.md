# RF902：跨窗口交接、取消及失败后继续编辑

2026-10-13，YULUSTATION。起始 fetch 核验官方 main `a843ebb6a4db9d6b9be4f37c260e644d653874e0` / tree `ba014136842152a2dc2dd8e88b404e04e7e66b7c`，工作区干净；上一批恢复修复 CI38377745817 attempt1 四项成功。本批只推进公开 main 的 RF902，RF901暂停、RF903待实施，M9仍0/3。

真实 UI 基线先复现两项缺陷：普通标签分离正文/归属正确，但第7位光标变0，后续 X 插入开头；原生 HTML 拖动中 Escape 触发可信 dragend 后仍执行 detach。正常松开与取消的 button/buttons/dropEffect 相同，页面也收不到被 Chromium 吞掉的 Escape，不能用字段猜测取消。`.artifacts/e2e/rf902-detach-baseline-02/`、`rf902-detach-baseline-03/`、`rf902-cancel-baseline-02/` 保留失败。最初阅读模式隐藏标签、取消证据选择错误等夹具失败另外保留，不混作产品结论。

修复将标签手势限定为 primary pointer capture，移动6px后进入拖动，仅匹配 pointerup 提交；Escape、pointercancel、lostcapture、卸载均取消。普通点击、同标签无操作、同窗排序、空白条分离和真实离窗释放保留。Windows原生拖到已有窗口也保持分离为第三窗口，原目标不变；修改前目标只检查自身 drag ref，不读取其他窗口的 tab data，产品原本没有合并到已有窗口入口。本批不扩展该交互，底层 move 的单元覆盖不能冒充真实用户流程完成。

光标作为临时视图状态交接：源编辑器 seal/drain 后采集，绑定 tab/修订与 UTF-16 边界；main 校验当前归属后，在目标 ready 前暂存，随目标首次正文快照交付。渲染器先载入正文、恢复选区，再确认 load，每个交接身份只消费一次；关闭/版本变化清理缓存。此状态不进入 Markdown、domain snapshot 或恢复日志。失败时只对相同 tab/版本/正文恢复源选区。

故障测试进一步复现失败后编辑丢失：目标提前关闭和原15秒超时均保住源正文/光标，但 trusted insertText X 没有发送 edit。原因是 removeTabMutation 的 catch 返回异步 reconciliation，而 finally 提前解除只读；canonical 尚未知时的 load ACK 未绑定编辑，后续同内容快照不会触发重新绑定。最小修复为等待 reconciliation 完成后再 release。新增单测严格核验 sealed期间无pending load、恢复后load ACK和继续编辑admission/apply；首次不一致mock revision元数据导致的失败也原样保留，纠正mock而不放宽断言。修后118项聚焦测试通过，真实两种失败恢复及继续编辑保存通过。

证据位于 `.artifacts/rf902-transfer/` 和 `.artifacts/e2e/`。已独立实际通过：普通分离、Escape取消、点击/排序、Windows SetCursorPos+SendInput跨顶层释放、拖到已有窗口保留分离行为、真实浏览器捕获丢失；受控ACK延迟证明真实A处理完成但ACK未返时B留队，分离等A/B/flush后精确转移并继续插入保存。目标未就绪测试同时hold其watch-sync和snapshot原处理器，首次只hold snapshot的错误夹具记录保留。预期故障按精确channel/sender/tab/message/count=1及对应完整main/stderr日志逐项断言，其他错误全部失败，不增加known-failure豁免。

桌面边界：每次隔离实例清理自身进程。最初桌面目标HWND787424/PID6132后来已不存在，`rf902-ready-failure-03`三项产品断言虽通过，包装恢复步骤明确FAIL；没有伪称恢复成功。后续重新只读记录当前HWND1513336/PID40824，布局仍134481924，`rf902-existing-window-01`恢复核验成功。未改变IME转换模式、系统安全设置或文件关联，也未操作其他程序。

最终完整门禁通过：lint/typecheck/build，12条产品E2E；strict **3720 passed +8 exact known，0unexpected/skip/collection/hook/unhandled**，foundation310、editing79、safety7、formal121cases/2541targets（仍含99known-defect），gzip **1,435,669/1,500,000B**。首次strict有两条App测试仍发送旧HTML拖放事件，保留失败后迁移到pointer输入，原有结果断言未改；App162通过，再跑strict通过。源码未变的build/E2E沿用最后冻结运行，新增测试输入后重跑lint/typecheck/strict；其他受影响门禁均实际执行。astra-high独立生产/协议审查及测试迁移补核均PASS。原始日志/首败与最终JSON见`.artifacts/rf902-transfer/`；发布提交及其精确CI另存publication记录，不在推送前预报成功。

RF902剩余：非活动标签真实外部冲突/阻止覆盖、已有窗口合并移动入口与真实流程、写入中断/损坏恢复等有限故障矩阵、产品原生嵌套选区/undo/模式和平台IME；本批不宣称整体完成。cp13/cp16及Library访问阻塞不变。

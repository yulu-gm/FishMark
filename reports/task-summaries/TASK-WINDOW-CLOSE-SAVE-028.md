# 保存排队时关闭：延迟获取关闭锁

2026-10-13，YULUSTATION，基于 main `59e9cd19a1067a011d1e5ec544bdf27e9955aca6`。本批只恢复关闭门禁，不增加性能优化。此前 CI38358340321 Quality 在第二次保存关闭超时，Full regression、Bundle 成功；失败包下载受审批服务超时阻断，原始日志保留，不重跑掩盖。

## 确定性证据

本机已安装 Electron41.2.0 的真实 main/preload/renderer，独立 userData 和临时文档，窗口屏幕外、showInactive、focus noop，无特权测试桥。保存到达 main handler 尚未取锁时设屏障；触发第二个 native close，观察 REQUEST1:2，再放行保存。基线 `.artifacts/m9-close-save/local-lock-order-20261013/result.json` FAIL：REQUEST 在1048.7ms，保存进入listener1079.0ms，约15秒关闭 transport 超时后保存才结束，迟到 CONFIRM 被取消，提示仅[2]、runtimeErrors为空、窗口未关闭。这证明本机生产等待环；未取得旧 Linux 内部时间线，不宣称已证明其精确因果。

根因是 main 提前持有关闭 tab lease，renderer 的关闭确认排在保存 FIFO 后；保存却等待该 lease。超时最终解除互等，但关闭意图已取消。手动保存与自动保存共用 `runSaveTransaction` / FIFO。真实程序化 blur 自动保存入口实验未进入屏障，保留为该入口未成功覆盖；不能称为真实 OS blur 或真实 IME 测试。

## 修复及边界

关闭 use case 给握手一个请求内幂等的延迟取锁函数。main 仅在有效 CONFIRM scope 建立、renderer 已完成既有保存并 seal/drain 后取锁；获取前后检查 active 请求，保持初始 ordered tabs、revision 检查。成功确认仍持有至 COMPLETE／原生窗口销毁。取消、异常及请求结束释放已获 lease；结束后迟到取锁立即释放。没有放宽超时、修改断言或扩大豁免，没有让保存绕过关闭锁。

`src/integration/workspace-close-save.test.ts` 使用生产自动保存调度器、renderer FIFO 和 main keyed coordinator 验证保存先完成再确认，并验证 memoize、返回后迟到获取、无获取的虚假确认，以及生产 broker/confirmation handler 取锁等待期间 abort、drained、锁释放、迟到确认和下一请求。已有取消重复关闭意图、tab/revision、确认 Save 等测试保留。

候选 `.artifacts/m9-close-save/candidate-lock-order/result.json` PASS：相同保存屏障后额外输入 ` after-save-start`，确保关闭仍有新草稿需 Save；提示[2,0]、窗口销毁，磁盘精确为 `Smoke first-save second-save pending-close after-cancel after-save-start`。此额外编辑是加强验证，基线动作没有这段。既有 workspace safety 也 PASS。警告 MaxListenersExceededWarning 保留，未提高上限。

## 门禁及发布

最终固定源码串行 lint/typecheck/build exit0；strict **3682 passed +8 exact known，0 skip/unexpected/collection/hook/unhandled errors**；相关 focused53/53，foundation310；gzip **1,434,741/1,500,000 B**；真实 editing、workspace safety、正式行为门禁均通过。独立只读审查 PASS，无阻断P0/P1/P2，并补齐其要求的 abort/drain 边界。所有原始证据在 `.artifacts/m9-close-save/`，精确提交与远端 CI 终态在发布检查点记录。

新增跨层测试最初放在 main 目录导致架构门禁失败，已移到独立 integration 目录；中间移动期间的 collection 失败也保留，未弱化 boundary 规则。首次编译类型错误、脚本 CRLF 错误及未执行审批请求有独立原始记录。发布前已重新 fetch origin/main，确认仍为59e9cd19，未回退脚注索引。

M9/RF901仍 IN_PROGRESS0/3；前台 IME 仍须完整门禁通过并协调空闲时间。cp13/cp16、Library、RF902/903 未动。该关闭修复不意味着全部关闭并发风险或跨平台体验已验收。

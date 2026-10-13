# 关闭 Save 门禁：确定性构造未保存草稿

2026-10-13，YULUSTATION。生产锁序修复 `9fe0d3c5e232700d40882fe9f3ba4141fd4c4694` / tree `177563983ebbf79dbc8a9dce5ce3d6e8d7ad4cc9` 已普通推送。其 CI38362468526 Full regression、Bundle 成功，Quality 在 workspace safety 失败。原始日志证明该次已越过窗口销毁等待，失败点改为提示断言 `[2] != [2,0]`，没有再次15秒关闭超时。合法 blur autosave 先保存文档是相符解释，缺少远端内部时间线，不能写成已证明因果。该失败完整保留 `.artifacts/m9-close-save/ci-failure-38362468526.json`，未重跑、未重新下载失败包。

## 协议修复

仅改既有 Electron safety 测试，不改生产模块。Cancel 后编辑并等待一次真实保存使磁盘／canonical 内容精确、干净；再让真实 save handler 在取 main lease 前进入屏障。屏障期间 native 输入 ` final-close`，发 native close，观察第二 REQUEST 后放行保存。关闭确认必须处理新增未保存草稿，因此仍严格要求 `[2,0]`、窗口销毁和精确最终磁盘内容。

屏障校验目标 window/webContents/tab，一次命中；release 前磁盘仍是 clean checkpoint，不得提前含 final-close。记录 hold、REQUEST、release 阶段，错误报告后释放并终止测试。handler 返回值和调用保留，只控制顺序；原15秒期限、所有原断言及已知失败豁免不改。

main canonical clean 可早于 renderer scheduler 完成保存后的 snapshot。独立审查指出此P2竞态，已改为同一个有界 until 内重发同一 Save，利用生产 scheduler 的 in-flight 合并；进入屏障即停止，没有固定 sleep 或延长关闭等待。

## 验证与边界

最终 lint、strict **3682 passed +8 exact known，0 unexpected/collection/hook/unhandled errors**、真实 workspace safety7项通过，提示[2,0]，磁盘精确为 `Smoke first-save second-save pending-close after-cancel final-close`。独立只读 review PASS，无阻断问题。生产修复的完整 build/typecheck/foundation310/gzip1434741/1500000、editing79、formal121/2541 在报告028的最终固定源码门禁中已通过，本批没有生产变更；新精确 CI 仍必须跟至终态。原始记录 `.artifacts/m9-close-save/protocol-*`，发布身份与终态在同目录 protocol-publication.json。

没有回退脚注索引、没有放宽 Save 验证求绿，也没有重新运行旧失败 CI。M9/RF901仍未完成，真实 OS IME 未重测，cp13/cp16、Library及RF902/903未动。

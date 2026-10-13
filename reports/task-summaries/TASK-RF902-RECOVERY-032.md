# RF-902：真实异常退出恢复与文件时间戳修复

2026-10-13，YULUSTATION。基线为官方main `e006460759a59e846429676305af213c9ecf568b` / tree `df33093910c361ea007cb0b627e28107d40c1d57`；[CI38374591185](https://github.com/yulu-gm/FishMark/actions/runs/38374591185) attempt1四项全绿，含Windows产品E2E。前批两个保存流程已发布，完整记录见[报告031](TASK-RF902-PERSISTENCE-031.md)。

本批先新增真实Electron产品恢复用例：隔离文件与profile，原生编辑后等待真实apply处理器完成（恢复日志写入先于响应），确认dirty、磁盘仍为原文且没有Save/失焦/idle触发；保存恢复snapshot与journal的原始字节和SHA256，再从外部强制终止所属的仍存活启动器进程树。记录实际Electron main及app metrics成员，确认全部退出且未走正常close/quit。重启同一profile时不传入Markdown路径；检查恢复的完整文档身份、内容、revision、dirty及磁盘原文，再继续原生编辑并通过真实File→Save落盘和正常退出。范围是已确认未保存编辑的进程异常退出恢复，不是断电或写入中断耐久性。

首次 `rf902-recovery-01` 真实失败：两份恢复文件在终止前后字节一致，但第二次启动报告`recovery data is corrupt at <snapshot>; starting fresh`，只出现开始页。错误由产品解析边界造成：`fs.stat`提供合法小数毫秒`1791883456206.8267`，`isDiskVersion`却要求整数。此前parser测试只使用diskVersion:null，Node写入进程恢复测试也未覆盖真实文件元数据。原始失败、截图、trace、JSONL及恢复文件保留于`.artifacts/e2e/rf902-recovery-01/`，未改超时/断言、未增加失败豁免或重跑覆盖失败。

修复限定在恢复时间戳校验：接受有限数值并保留原始精度，不取整或强制转换。现有DiskVersion与fs.stat契约允许1970年前的负时间戳；文件字节数、revision和sequence继续要求非负整数。补确定性小数/有符号时间戳与非法类型/非有限数负例，以及真实文件→repository→domain snapshot→JSON→恢复服务的往返覆盖。

旧代码新增聚焦测试为3FAIL/18PASS，修后21/21通过。重建后`rf902-recovery-02`在未改动E2E断言下PASS：首进程强制退出code1，第二次无文档路径启动准确恢复，再编辑保存并正常退出code0，全部记录成员退出、cleanupErrors0。后续完整门禁曾因新增测试finally中的直接throw、数组索引可能undefined分别失败；保留原日志后提取相同目录检查到清理helper、补可选索引，未关闭lint规则或弱化断言。

最终冻结源`rf902-recovery-final-01`三条E2E全通过。lint/typecheck/build、strict **3695 passed +8 exact known、0unexpected/skip/collection/hook/unhandled**、foundation310、editing79、safety7、formal121cases/2541targets均通过；formal仍有99known-defect targets，包体仍为原合同1,434,741/1,500,000B。全部9项实际门禁日志、strict/safety/formal JSON及独立astra-high审查记录位于`.artifacts/rf902-recovery/`。普通main发布及精确CI终态另存publication记录，未提前声称远端成功。

测试使用用户授权的无人桌面和独立临时数据，不进行OS IME输入。RF902仍IN_PROGRESS，RF901执行暂停、RF903仍PLANNED、M9仍0/3；发现恢复阻断后先暂停pending-ACK跨窗口用例，避免混入另一流程。冻结cp13/cp16、Library访问阻塞、预算和known-failure清单不变。

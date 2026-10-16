# TASK-PERMANENT-CHROME-053

结果：**Windows本地验收PASS**。基线main d4d060422185929cbf83967b578c742976d5f32b；实现检查点5f252f2c1729cfbabf8991dc60de9f39caeeaff3。最终证据独审、普通main精确发布SHA与四项官方CI/Windows制品审计终态，以本批.artifacts/permanent-chrome-053/publication.json为准。

取消阅读布局状态、按钮/F11及折叠CSS；文档Tab、状态/字数栏常驻，空workspace字数0。独立保留标题初始reading/实际输入后editing、inline/block标记规则、source/WYSIWYM、选区/undo/焦点保护和Tab阅读位置。Theme两处runtime固定readingMode0，ABI保留。Preferences/session没有持久化阅读布局字段，无虚构迁移或偏好重置。

验证：
- 205定向、typecheck/build、strict3987pass＋8精确known，0unexpected/errors/skip；bundle/foundation310。
- 最终1470文件逐hash源码镜像原npm lint通过；冻结历史诊断不改，不称原位九项全绿。Windows gzip1437457/1500000，initial103592/260000。
- 用户本次04:43UTC明确允许后，完整Windows61/61，无skip/retry/flaky；76启动=71正常exit0＋5预期恢复，318owned均退出、profile清理、cleanup0。14native助手九阶段与sidecar匹配；76原始日志监听超限warning0。
- editing79、safety7、formal121/121/2541（99known，0unexpected/not-run）通过，三probe双appData/userData隔离/4owned成员各自退出及profile删除通过。
- 四guard物理输入false。product注入28；同PowerShell静态counter使后三probe原始累计值仍28，增量0，strict last-input检查通过。04:51:25UTC桌面释放；本次前台约6分38秒。
- 宽窄、主题、空页截图和canonical/disk/count/source/outline/长文Tab锚点证据保留。

失败如实保留：target01六过一败，新增测试误假定正常Quit自动恢复干净标签，实际欢迎页Tab/字数0正常。仅将第二次启动改为同profile既有FileOpen重开，未改生产恢复语义；target02及full通过。原失败的profile按既有fixture已删除、所有owned退出，不能声称保留profile。

独审：6.1-sol代码审查PASS；修正nested首次editing前提（真实输入/undo）、删除旧helper，第二launch测试修正另审PASS。最终证据独审以publication记录为准。

人工验收：
1. 临时md宽/窄窗口确认无阅读按钮，Tab与底栏/字数可见；F11不改布局。
2. 编辑/undo、source往返、跨Tab阅读锚点、outline定位及字数更新。
3. 新建/关完文档字数0，同测试profile重启并正常重开，检查偏好与精确文件内容。

M9仍0/3，RF901性能候选暂停/未验收；本轮无新性能采样，Mac/真实OS IME未新增验收。cp13/cp16、052失败诊断和Library阻塞保持。旧reading-toggle专用诊断不是053验收协议，不以其旧断言评价当前布局。

交接：[intake](../../docs/plans/2026-10-16-permanent-chrome-intake.md)、[handoff](../../docs/plans/2026-10-16-permanent-chrome-handoff.md)。原始证据根.artifacts/permanent-chrome-053，2349份历史证据sha256保持。

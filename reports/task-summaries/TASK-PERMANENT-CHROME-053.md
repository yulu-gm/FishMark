# TASK-PERMANENT-CHROME-053

状态：实现完成，验收未完成；未推送。

目标：取消阅读布局及按钮/F11，常驻文档Tab、状态/字数栏；保留source/WYSIWYM、渐进语法标记、原生选区/undo及阅读位置。基线main d4d060422185929cbf83967b578c742976d5f32b。

已完成：最小renderer状态/props/CSS清理，heading呈现独立保留；空workspace字数0；theme两处readingMode固定0且ABI不删。Preferences/session无持久化布局字段，无迁移或偏好重置。产品E2E适配删除的按钮并新增宽窄/多Tab/字数/source/空页/重启综合例。

后台证据：新增测试RED→GREEN；定向205/205、typecheck/build通过；strict3987pass+8exactknown，0unexpected/collection-hook-unhandled错误；bundle/foundation310通过；1468文件逐hash干净源码镜像原始npm lint通过。保留旧诊断证据，未改eslint/known allowlist；不称原位九项全绿。新增resize断言后最终定向205、typecheck和strict3987＋8精确known复核通过；最终1470文件源码镜像原lint通过。

独审：产品代码暂未发现阻断；nested首次源标记导航必须先通过真实编辑进入editing，已修测试前提；清掉tab-merge旧helper。最终只读代码审查PASS；不替代运行验收。

未测/阻塞：用户正在输入，当前未协调空闲前台；053未启动任何Electron窗口或OS输入。Windows完整产品及editing/safety/formal门禁、截图/退出/清理审计待运行；无最终PASS、无push/精确新SHA/新CI。此为本地实现检查点，不能替代完整验收。

人工验收：临时文件宽/窄窗确认Tab和底栏常驻，无阅读按钮；F11不改布局；编辑/undo、source往返、长文跨Tab/outline定位、字数更新；关完文档字数0；同测试profile重启保持有效偏好和正文。真实IME另需独占前台验证。

M9仍0/3，RF901性能候选暂停；cp13/cp16、052失败诊断、原Library阻塞不变。

交接：[intake](../../docs/plans/2026-10-16-permanent-chrome-intake.md)、[handoff](../../docs/plans/2026-10-16-permanent-chrome-handoff.md)。原始日志位于本机.artifacts/permanent-chrome-053。

# TASK-UX-LAUNCH-001 intake

用户要求在 yuluStation 继续公开 main 的 Windows UX 修复，并在完成小阶段后返回。本轮隔离 clone 来源为官方 `dfcfe36b1e067d049c34d095fe828fb26c964fcd`，tree `877249ab700f80388a83ce0cb6c4f913b2ea0ad6`。不读取旧电脑补丁，不涉及 RF901 cp13/cp16，不推送。

本切片解决已运行编辑窗口隐藏/最小化后第二次启动不能显示，以及无文件参数启动不能激活。复用既有 workspace 路由，不修改 Markdown 数据、renderer DOM、列宽或系统文件关联。

整体启动任务仍要求后续覆盖多文件保序、renderer 未 ready 队列、销毁及 send failure 的端到端恢复；本切片不将这些宣称为已完成。按 AGENTS、MVP_BACKLOG 与 docs/acceptance 的文件打开及稳定交互约束验收，保持原完整回归 allowlist。

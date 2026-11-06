# 图片缩放任务

Goal: 在编辑器中直观等比例缩放图片，尺寸随 Markdown 保存、重开并支持撤销重做。
In scope: 可安全转换的独立及行内 Markdown 图片和 HTML 图片，拖拽预览、只读保护、尺寸约束和测试。
Out of scope: 修改图片文件、宣称复刻未经核实的 Typora 拖拽交互。
Landing area: CodeMirror 图片组件、尺寸转换、样式和回归测试。
Acceptance: 保持图片链接和标题，单次拖拽一次历史记录，取消无更改，窄窗口不溢出；不能安全转换的形式不能静默损坏。
Verification: lint、typecheck、build、相关测试、真实 UI 及回归。
Risks: 引用式 Markdown 到 HTML 会失去定义关系；行内 HTML 图片需支持富文本渲染与导出。保留引用式图片原文而不执行不安全转换。
Next skill: fishmark-task-execution, fishmark-task-acceptance。

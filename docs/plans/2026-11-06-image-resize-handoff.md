# 图片缩放交接

基线 2063abc；独立分支 image-resize。CodeMirror 图片组件提供等比例拖拽预览，松手写入 HTML width，隔离撤销；只读受保护，手柄支持方向键与 Escape 取消；右键菜单提供原图自然宽度的 25%、50%、75%、100%，共享同一源码事务。组件复用后读取最新文档，并在拖拽期间校验快照。尺寸编辑模块保留受支持图片的目标、标题及非尺寸 HTML 属性；单独的测试探针使用隐藏 Electron。

限制：引用式图片、带复杂转义的 Markdown 图片和复杂 HTML/CSS 无手柄；引用式转换为标准 HTML 会断开定义关系，其他情况为保守防护。普通直接链接的行内图片可转换为标准 HTML，保留相邻文本、目标和标题。真实产品测试通过 File > Save，关闭标签后以文件拖放路径重新打开，并验证磁盘内容及尺寸；未验证应用重启或文件对话框。Typora 官方确认图片右键菜单，但未核实其中缩放选项与实际拖拽交互。

建议验证：npm run lint、npm run typecheck、npm run build、npm run test:regression、node scripts/probe-image-resize.mjs（需要本地监听和 Electron）。人工：插入独立及行内图片，拖拽缩放、撤销重做，保存并重开，缩窄窗口，切换只读；检查引用式图片原文保持不变。

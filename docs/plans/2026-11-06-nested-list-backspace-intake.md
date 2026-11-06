# 嵌套列表 Backspace

目标：Enter、Tab 嵌套列表后，删除内容及空叶项 marker 时不遗留缩进。保持有内容项、子树、引用前缀、空行合并和撤销语义。落点为 editor-model 语义命令及其产品回归。验证构建、lint、typecheck、相关模型和客户端测试，以及真实 Electron 键盘流程。风险集中在子树、空行及历史事务。

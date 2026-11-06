# 嵌套列表 Backspace 交接

空嵌套叶项的 marker 删除事务一并删除自身缩进，保留引用前缀；有正文或更深后续内容时保留既有 marker 删除行为。修改语义命令、模型和客户端测试及设计说明。人工验收：列表末尾 Enter、Tab，输入并删除内容，删除 marker，确认无残留空格；检查撤销/重做、下一次退格、嵌套子树和有序列表。建议执行 build、lint、typecheck、列表/退格/引用测试及 Electron list-backspace 测试。基线为本地缓存 main，远端状态待重新核验。

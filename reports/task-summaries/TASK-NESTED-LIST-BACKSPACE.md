# 嵌套列表 Backspace

结果：FAIL（完整测试集有基线失败，Windows 未验证）。

空嵌套叶项删除 marker 时一并删除缩进；保留有正文项、后续更深内容、外层引用和空行合并规则。GitHub 接口确认 main `d16b9bc`，基于 `2063abc` 及哈希核验的 104 个远端变更文件构建快照并应用修复。快照 build、lint、typecheck 通过；完整 Vitest 4155 通过、8 项 parse-block-map 失败，原退格命令复现同样 8 项。macOS 真实 Electron 有序、无序、三级列表按键、撤销、重做、保存及正常退出，连同独立正常退出测试共 4/4 通过。Windows 产品回归未运行。工作副本仍是旧 Git 基线；最新源码验证快照已清理，合入时需将改动应用至真实最新 main。未推送。

人工验收：列表末尾按 Enter、Tab，输入再删除内容并删除 marker；确认只留空行，再按 Backspace 返回上一行。检查多级、有序列表、引用、有子项的空列表项和撤销/重做。

后续迁移到完整 Git 主仓库 `fbabfd7` 的列表 worktree：build/lint/typecheck 和 macOS Electron 5/5 通过。完整 Vitest 4177 通过、9 失败；8 项为既有解析基线，新增 1 项为 macOS `/var` 与 `/private/var` 路径断言，单独重跑仍失败。Windows 未验证。

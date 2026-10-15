# TASK-PLAIN-TEXT-PASTE-045

Goal：右键原生菜单提供“仅粘贴文本”，Windows/Linux Ctrl+Shift+V、macOS Option+Shift+Cmd+V采用锁定Electron的平台惯例。

In scope：窄纯文本请求、原窗口菜单、CodeMirror一次选区替换、history/保存及异步过期保护；普通粘贴保持。
Out of scope：排版、M9验收、图片粘贴重构、系统设置/用户文档、冻结性能候选及Library访问。
Landing area：clipboard registrar/preload窄桥、editor controller与现有React装配、原生菜单小模块、相关单测/产品E2E。
Acceptance：混合文本/HTML/图片只用文本；无文本不改选区；反向选区准确替换且单次undo/redo/save；切tab/编辑/改选区/只读/销毁后旧返回不能写入；右键菜单与快捷键均走真实产品入口。
Verification：定向单测、lint/typecheck/build/strict、Windows完整产品、foundation/editing/safety/formal与bundle；独审后普通main推送、精确SHA四CI成功。
Risks：剪贴板只在自有人工样例测试中变更，原内容只在现有受限恢复机制的进程内保留，不进入日志；并发变化不覆盖；隔离appData/userData与真实输入guard延续。
Next skill：fishmark-task-execution，完成handoff后fishmark-task-acceptance。

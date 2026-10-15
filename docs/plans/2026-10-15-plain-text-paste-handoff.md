# TASK-PLAIN-TEXT-PASTE-045 execution handoff

实现：新增唯一窄`requestPlainTextPaste`请求，source区分快捷键与原生菜单。main只读文本；菜单绑定原窗口，读取复查sender/活动tab，null取消不携带数据且可随owner关闭结束，文本回复仍二次复核。CodeMirror捕获load/doc/selection/version/request，返回时检查只读/销毁/组合输入与DOM焦点，单个隔离history的paste事务替换选区；普通粘贴分支保持。

落点：`src/shared/plain-text-paste.ts`、`src/main/plain-text-paste.ts`及clipboard registrar/preload API；现有renderer gateway/App/Shell/View/controller装配；对应单测及`tests/e2e/plain-text-paste.spec.mjs`。测试使用原受限剪贴板恢复机制，人工text/HTML/图片payload，旧内容只在main RAM，不进trace/截图/日志。

开发验证：515项定向单测、类型/构建通过。后续补充取消授权、非法source与组合开始取消旧请求的单测纳入最终全套。真实Windows5/5通过：快捷键反向选区/undo/redo/save/reopen、真正原生右键菜单UIA Invoke、延迟返回切File New、图片单独不动作且普通Ctrl+V仍导入真实PNG、菜单打开后正常退出。首轮3/5和次轮1/2失败保留：无数据取消的多余最终授权已窄修，UIA实测Name含快捷键后严格校准；未修改错误allowlist。真实输入guard均无干扰，仍有remote injected input局限。

终版522项定向测试通过；`045-final-01`九门禁全部通过：lint/typecheck/build、strict3952＋8精确known（0unexpected/errors/skip）、完整Windows54/54、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run），gzip1437744/1500000、initial103958/260000。68启动=63正常exit0+5预期恢复、全部owned退出/profile清理/cleanup0、四guard无物理输入。终版冻结及最终独审、普通main提交/tree和精确四项CI终态统一保存在本批`publication.json`；本地通过不替代发布核验。

人工验收：临时文档选择一段文字，复制人工富格式文字，分别Ctrl+Shift+V及右键“仅粘贴文本”；确认只替换所选文本，一次undo恢复、redo重做，保存重开一致。图片单独的纯文本命令应不动选区，普通Ctrl+V仍导入图片。macOS快捷键为Option+Shift+Cmd+V，平台本批未实测。

边界：未改变排版或原图片异步路径；DOM焦点不冒充全部原生窗口焦点测试；模拟组合事件不等于真实IME验收。RF901 PAUSED、RF902/RF903 IN_PROGRESS，M9仍0/3；冻结cp13/cp16与Library未触碰。

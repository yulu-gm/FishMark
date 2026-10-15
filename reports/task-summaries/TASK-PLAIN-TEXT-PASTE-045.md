# TASK-PLAIN-TEXT-PASTE-045

结果：**Windows 本地验收 PASS**。最终独审、普通main提交与精确四项官方CI终态以本批`.artifacts/plain-text-paste-045/publication.json`为准；本地通过不替代发布验收。

从官方main `6c9d7586d50303c776fa55e4e5f2d9e5ff7bb9f4`、CI38778198932四绿推进独立小批。右键原生菜单及Windows/Linux Ctrl+Shift+V、macOS Option+Shift+Cmd+V走同一窄文本请求；main不读HTML/图片，renderer只在原load、文档、选区、版本及最新请求仍匹配时，以单隔离history事务插入。空文本保留选区；普通粘贴不改。

边界、落点、开发证据及人工步骤见[intake](../../docs/plans/2026-10-15-plain-text-paste-intake.md)与[handoff](../../docs/plans/2026-10-15-plain-text-paste-handoff.md)。本地原始证据在`.artifacts/plain-text-paste-045/`和对应E2E/guard目录，初次类型mock缺新接口及jsdom缺真实键码的开发失败、菜单关闭竞态和原生UIA名称校准失败均保留。UIA只在自有进程启用可访问性并按完整实测名称匹配；未改OS设置，未读取用户文档或记录原剪贴板payload。

终版定向522/522，`045-final-01`九门禁全过：lint/typecheck/build、strict3952＋8精确known（0unexpected/errors/skip）、完整产品54/54（0失败/跳过/重试）、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）。Windows gzip1437744/1500000、initial103958/260000，预算和known合同未改。68次真实启动=63正常exit0+5预期恢复，全部owned成员退出、隔离profile清理及cleanup0；原14个原生拖拽助手九阶段及新原生菜单UIA证明保留。四guard无物理输入干扰，remote injected input局限不外推。冻结输入、构建与逐报告核验见本批`final-validation.json`；发布必须最终独审通过后普通推送并等精确CI全绿。

人工验收：在临时文档选中文字，复制人工富格式文字，分别用Ctrl+Shift+V及右键“仅粘贴文本”，确认只替换选区，undo/redo和保存重开一致。图片单独时纯文本命令不改选区，普通Ctrl+V仍导入图片。Mac使用Option+Shift+Cmd+V，平台本批未实测。

M9保持0/3；Mac与真实IME未验收，排版另批，cp13/cp16/Library未改。原普通图片粘贴异步路径未扩改；DOM焦点不等于全部原生窗口切焦已覆盖。

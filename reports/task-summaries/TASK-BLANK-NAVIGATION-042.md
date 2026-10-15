# 多空行导航最小修复

2026-10-15，yuluStation。官方main基线`28582be8c19ddb440ec90ef865ffe0c8e43aa436`，tree`b8e05b150571770ddedb47ef19ef7021aee0e1f8`；恢复前fetch一致。用户报告多空行折叠后，Up看起来新增一行。本批最终范围保留原绘制折叠、输入、退格和历史契约，只修复适配层绕开原导航规划及可见空行焦点高度差，另保留source上下键交回原生逐行导航。未实施其他产品需求。

## 原样复现与最小根因

样本为`1\n\n\n\n2\n\n\n\n3`。原main首个Up从offset11到隐藏空行9，源文和磁盘不变，但该行从0展开到32.75px，`3`从y236.625移到269.375；已可见空行active前后另有31.0625到32.75的1.6875px差异。baseline01只测外层min-height600而漏报，原弱PASS保留，不作无跳动证明；baseline02逐行y/height明确FAIL，原始报告和截图保留。

原line-block-adapter在正文块首发现上一物理行为空，就直接返回其offset9，绕开原planVerticalNavigation。原planner本来会按既有可见行政策跳过隐藏9而到可见8。最终仅删除这条普通空行直接返回分支，保留table/code/math、结构分隔行和容器专属优先级；其余resolver无目标后回到原planner，不新增解析或导航算法。

CSS新增规则仅适用于WYSIWYM、extra blank、empty/whitespace且不含cm-inactive-blank-line的行，使已可见空行inactive/active保持同高。原折叠行仍折叠，直接定位隐藏行的既有编辑例外保留，不声称任意直接选区均不改变布局。source模式ArrowUp/Down交回CodeMirror原生物理行导航，避免跳过源码已显示行。

最终backspace、navigation model、block-decorations及既有command-contract/probe与官方基线一致；未改Enter生成、source内容、Typora oracle、formal期望或校准名单。新增controller回归同时要求Up[8,6,3,1]、Down[3,5,8,10]、源文不变及四条原折叠行不被激活。

## 候选与完整验证

focused-narrow-01五个文件476/476通过，build-narrow-01通过。blank-navigation-narrow-candidate-01四组真实Windows流程通过、五次正常启动并确认退出、产品/清理错误0：

- 原样本两轮Up/Down、Home/End、Shift准确anchor/head与选中文本、指针定位、输入/删除/undo/redo、原Enter行为、source双向逐行、真实保存关闭重开；逐行几何稳定，保留四条原隐藏行。
- CRLF及空格间隔；打开仍按既有decodeUtf8归一化内存，导航不改变原磁盘CRLF，不声称改变保存格式策略。
- 末尾空行沿原paragraph Backspace契约，精确验证源码和undo/redo，未采用逐源码行删除的新语义。
- 300段长文档底部跨间隔反复导航，唯一末段相对内容坐标、高度与滚动高度稳定。

短fixture在观测DOM选区前先核对所有物理行与canonical全文一致；长文档仅测可见唯一末段，不外推虚拟化全文offset。键盘是可信Chromium输入，不等同物理OS IME。双路径隔离、临时文件、目标归属与用户输入监测沿既有fixture；主对话11:26 UTC用户新许可后恢复前台，历史误输入不再视为新操作，也不把未捕获事件当桌面空闲证明。

最终完整九门禁以唯一runId blank-navigation-narrow-gates-03全部通过：lint/typecheck/build、strict3865 passed＋8 unchanged exact known（0unexpected/errors/skip）、完整Windows产品36/36、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）。产品49次启动＝44正常退出＋5恢复用例预期强退，全部确认退出，产品/清理错误0；三个正式probe双路径配置/身份/正常退出/清理通过。JS gzip1435815/1500000，initial102843/260000，未改预算。

当前源码/测试/构建九项冻结哈希全部匹配，原Typora oracle、formal期望/校准及输入删除实现与基线一致。最终独审、精确提交与官方CI以本机`.artifacts/blank-navigation-042/`下final-summary、independent-review-final、checkpoint、publication、handoff为准；未取得新CI前不声称CI通过。旧宽候选不进入发布历史，保留本地checkpoint后将最终tree整理为官方main之上的单个提交。

## 已撤回较宽候选与失败记录

较宽候选曾把绘制与导航改成canonical所有extra均显示，并附带把内部/末尾退格改成逐源码行删除。这超出用户导航问题的必要范围，已全部撤回。原be0b698及补充2dab205本地checkpoint和失败证据保留，最终方案不沿用其产品实现或宽候选通过计数。

candidate01–06、gates01旧contract五项失败、受限环境perf01解析terser失败及重跑、前台暂停期间的partial记录均原样保留。恢复后的resume01 editing78/79失败，resume02补强两次退格的probe使editing79/safety7通过，但formal121/2541出现26unexpected（geometry21/source2/selection2/roles1）而FAIL。其中八个旧known因visibility变化失去精确匹配，99到91不能算修好；depth/prefix残余仍存在。标题退格source/selection又明确偏离历史Typora captured-exact，未覆盖原oracle或校准。

协调方随后明确保留现有Typora契约、缩小范围。因此恢复原输入/删除/绘制/model及相关旧断言，改为上述最小adapter回退和CSS修正。所有旧FAIL仍为FAIL；新候选与完整门禁独立记录。失败probe按协议保留profile，所属进程已确认退出，不冒称失败清理零错误。

## 五项需求及执行顺序

1. 当前空行最小修复：四组候选、476相关单元及完整九门禁通过，等待独立最终审查与精确发布/CI。
2. 文档tab切换位置漂移：下一优先批。后台只读分析及163现有单元已完成，未新增产品修改；长文档/异步布局/离屏caret/A→B→A待真实验证。
3. 跨已有窗口移动标签：已只读审计，尚未实现；接收确认先于源移除，覆盖取消、失败、往返与资源归属。
4. 仅粘贴文本菜单及Ctrl+Shift+V：已初步定位入口，尚未实现；纯文本、异步目标身份和undo独立验证。
5. 极简排版间距：独立批，尚未实现；标题/段落/列表/表格/代码块节奏及宽度、空行、滚动稳定，不与拖窗混合。

原shipping入口/旧图检查独立保存在86ec306未发布。RF901 PAUSED、RF902/RF903 IN_PROGRESS、M9仍0/3；本批不关闭Mac/IME或性能预算，cp13/cp16、Library、Crashmon与系统设置未操作。

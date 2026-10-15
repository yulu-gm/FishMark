# 标签切换保留阅读位置与选区

2026-10-15，YULUSTATION Windows11 / i7-13700K / 32GB / Electron41.2 / DPR1。官方main基线`66f8fc3e0e39d92f5846aaf2c6e393989df8be7e`，tree`603b327d19be27b403bf1e3d520d7e8c3e136bfa`；本批再次核验远端一致。仅处理文档tab切换位置漂移，另外三项需求保持独立排队。

## 原失败与最小修复

公开基线600段长A的caret留在源码0，真实滚轮读到A-row-0127、scrollTop8055。原File New打开干净空白B，再真实点击A，六次几何采样后变为A-row-0000、scrollTop0；源文、原磁盘与dirty未变。baseline01准确FAIL，截图、trace、原断言和正常exit0均保留，产品报告errors保留那一条断言，不重标零错误通过。

原单一CodeMirror view在replaceDocument时建立新state，普通tab切换没有独立selection/阅读位置。修复在旧tab替换前捕获不可变Text、完整EditorSelection及公开scrollSnapshot，在目标内容严格相等时一次性恢复selection与阅读锚点；没有调用追踪caret的居中导航。快照只属于当前renderer的打开tab，关闭/分离按owned集合清理，controller销毁清空，不跨main IPC、持久化、缓存完整EditorState/history或DOM。内容失配拒绝，原handoff/失败恢复的显式selection优先，同tab内容reload不套旧快照。

捕获先调用公开lineBlockAtHeight完成待处理测量，避免restore后未等下一帧便再次切走时覆盖快照。安装版本的lineBlockAt不触发readMeasured，不能替代height查询。单测以真实requestMeasure回调、无frame/timer的立即capture验证排序；jsdom Range几何采用现有空测量约定，不作为像素证据。restore没有延时重写滚动任务，因此返回后的主动滚轮/输入不被迟到恢复覆盖。恢复不创建正文编辑撤销步骤，选区历史仍遵守CodeMirror规则，不声称history完全为空。

首个较小候选只通过A→空白B→A。extended01发现B首次返回从row62漂到151；逐次诊断显示后续稳定停在151，并非逐次累积。临时诊断进一步确认新打开B未被捕获/恢复，useEffectEvent读取owned条件漏过B；改为每次切走先捕获，再由后续effect按当前owned集合清理。active关闭不会在清理后重新插入旧key。路径刷新顺序曾是调查假设，没有作为本次根因或新增修改。临时诊断已移除，原失败日志全部保留。

## 真实产品验证

extended03四组全过，四次正常启动全部确认退出，页面/产品/清理错误0，guard没有新物理输入或注入事件。最小窗用例的原760px标注已由后续native04实际尺寸证据更正；最终全套与当前fixture身份另按final04汇总：

- 原600段A→干净空白B→A保留row127及相对y；离屏caret仍为源码0，实际插入canary后精确核验并undo，纯导航源码与dirty不变。
- 两长文档分别保留A-row127和B-row62；八轮往返、source模式各自阅读位置、WYSIWYM返回、准确A0/B5插入canary、关闭及新tabId重开通过。controller同key清理另有active/inactive单测，真实新id重开本身不作为旧key已清理的唯一证据。
- 待加载HTTP图片与表格明确在A-row20阅读锚点上方。切回先保留原锚点，新的80px滚轮建立最新阅读意图后，视口上方图片真实由0增高到900px，段落y保持-46.765625；再次切回误差0.375px。该结论不外推图片在视口内部时解码的正文重排。表格真实测量高度与返回后相同。
- 原760px宽度请求被产品最小宽度钳制；native04明确记录minimum900×600、外窗900×800、客户区884×735。中文长cell表格真实约557.72×398.63px；重挂载后宽高与A-row20相对位置保持，源码/磁盘/dirty不变。不覆盖最小宽度限制，不修改列宽算法或cell DOM/原生undo。

所有长文仅以可见唯一源码段落与其相对scroller的y判断阅读位置，不拿scrollTop或局部DOM串联冒充全篇offset。two-rAF仅为几何采样时序，不声称compositor、物理OS键盘/IME或Mac验收。保留已有原生输入/历史和Typora契约。

## 完整门禁与发布

最终九门禁组合通过：lint、typecheck、build、strict3871＋8unchanged exactknown（0unexpected/errors/skip）、完整Windows产品40/40、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）。产品53次启动＝48正常＋5预期恢复强退，全部所属进程确认退出，产品/清理错误0。三个正式probe各4个真实成员、多阶段实际appData/userData匹配、正常退出并清理成功。JS gzip1436023/1500000、initial102853/260000，预算未动。

六项最终源码/测试与四项构建/lock冻结哈希全符，原Typora oracle、formal校准、known名单及架构守卫未变。组合门禁的沿用关系见下文和reuse-provenance；最终独审、checkpoint、普通main发布及精确CI，由本机`.artifacts/tab-viewport-analysis-043/`的final-summary、identity-manifest、independent-review-final、checkpoint及publication记录。未取得对应CI结果前不声称CI通过。

原focused03动态handoff callback测试失败、pending-measure01缺jsdom Range几何、图片未挂载/切回后已卸载的前置条件失败、gates01新增测试漏必需onChange导致的typecheck失败均保留。gates02的strict为3870通过＋8精确known＋1unexpected：新增纯导航事务上的addToHistory(false)触发原架构守卫计数；该事务没有正文变更，移除不必要注解后原守卫及相关252项定向测试通过，没有修改守卫、别名绕过或扩大known名单。前瞻用例明确资源实际挂载及上游增高，不放宽sameAnchor以求通过；修正后重新冻结并跑完整gates03。

gates03的lint/typecheck/build/strict3871＋8全过，但产品为39/40：最小窗用例在切tab之前未找到表格，不能记作通过。fixture改为核验原生实际客户区宽度、分段真实滚轮到widget挂载后再定位，原位置/尺寸断言未放宽，native04单case通过。途中带空格grep经Windows参数拆分误选额外窗口用例，guard在该用例自身SendInput后中止；physicalInput=false，原运行不计完成。10个自有PID逐个确认退出，遗留合成左键按下仅用LEFTUP释放并核验false，未移动、再次按下或改焦点；原中止、输入状态与清理记录保留。final04重新全lint、完整40产品及剩余四项probe/性能门禁；核对五项未变源码/单元与四项构建身份，重新冻结含更新mjs在内的六项后，沿用不受fixture改动影响的typecheck/build/strict03。早期frozen-inputs-final.json不是最终身份，最终以frozen-inputs-final04及frozen-build-gates03为准。

后续跨已有窗口移动tab、纯文本粘贴菜单/Ctrl+Shift+V、极简排版间距继续按独立批执行。本批没有性能实验或Mac/IME验收，RF901 PAUSED、RF902/RF903 IN_PROGRESS、M9仍0/3；冻结cp13/cp16、Library和系统设置不变。

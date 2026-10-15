# TASK-READING-RHYTHM-046 execution handoff

实现：仅markdown-render.css运行样式，顶层wysiwym active/inactive标题同padding，按H1–H6 top .15/1/.85/.7/.55/.55rem、bottom .25；paragraph-leading1.95→1.86、顶层top .45rem且无bottom。排除所有list/continuation/quote容器，不用:first-child或margin；source、既有字号/正文1.85、列表/table/code内部与宽度自适应保持。规范同步真实值，不改解析/命令/显隐/source空行。

开发自检：build与331 layout/editor测试通过；真实baseline2/2、after2/2，target03=7/7（新增3＋既有Tab阅读位置4）。target02的CLI逗号参数未匹配用例而失败，原记录保留；改用runner支持的单regex后正常执行，没有放宽断言。所有实际guard无物理干扰，仍保留注入输入局限。

证据：`.artifacts/reading-rhythm-046/`与对应E2E/guard目录。before/after相同人工长文、native1280/900（客户区1264/884）/DPR1/lightdark/editreading，共各8原始视图。对比图是原尺寸8图拼版+标签，无像素改写；已成功保存新的Library image，`library-deliverable.json`保留准确ID。Windows当前官方helper不支持os.setxattr，本机元数据持久化失败已记录，不影响已成功云保存；未尝试旧候选下载或绕阻塞。

新鲜验收：`046-final-01`九门禁全部通过，lint/typecheck/build、strict3952＋8精确known（0unexpected/errors/skip）、完整Windows57/57（0skip/retry）、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）；Windows gzip1437744/1500000、initial103958/260000。71启动=66正常exit0+5预期恢复，全部owned退出/profile清理/cleanup0；四guard无物理输入，三隔离probe通过。当前Windows本地验收PASS；最终冻结输入/524构建、独审、普通main提交/tree及精确四项CI终态以本批publication及final-validation为准。

人工验收：临时长文在宽窄/明暗/F11与编辑下查看标题/段落层级；切换两个长标签、outline远端跳转、点击已可见表格和显隐行内语法，确认无新增跳屏；源码/保存字节保持。Mac、真实IME和M9验收不在本批完成范围。

# TASK-READING-RHYTHM-046

状态：**Windows 本地验收 PASS**。基线df16c2f5dbfae40159bb99917a285c03eb3c1645、CI38785088778四绿；最终独审及普通main发布/精确SHA四CI动态记录在`.artifacts/reading-rhythm-046/publication.json`。

用测量行盒内的小幅padding区分顶层标题与正文，保留H1–H6字号字重/普通正文1.85/列表tablecode内部和自适应宽度。段落leading收敛为标准1.86、仅其第一物理行top .45rem，无bottom；新padding严格限制wysiwym顶层、active/inactive相同，不改源码空行/显隐或nested容器。落点/风险见[intake](../../docs/plans/2026-10-15-reading-rhythm-intake.md)和[handoff](../../docs/plans/2026-10-15-reading-rhythm-handoff.md)。

修前/修后各8视图（宽窄明暗编辑/F11）、331定向测试及7真实产品流程通过。对比截图已实际上传Library，准确文件名/ID及本地xattrhelper平台失败记录于本批`library-deliverable.json`，不将本地路径冒充交付；原图与拼版SHA/provenance保留。`046-final-01`九门禁通过：lint/typecheck/build、strict3952＋8精确known（0unexpected/errors/skip）、完整Windows57/57（0skip/retry）、foundation310、editing79、safety7、formal121/121/2541（99known、0unexpected/not-run）；Windows gzip1437744/1500000、initial103958/260000。71启动=66正常exit0+5预期恢复、owned退出/profile清理/cleanup0；四guard无物理输入，三隔离probe通过，14原native helpers阶段完整。最终冻结/逐报告核验与独审记录保留；本地门禁不替代发布CI。

人工验收：自有长文宽窄/浅深/F11与编辑对照标题和正文；两标签往返、outline跳转、表格点击及行内显隐后位置应稳定，source和保存内容不变。

Mac与真实IME未测，M9仍0/3，RF901 PAUSED、RF902/RF903 IN_PROGRESS；冻结cp13/cp16与旧Library下载候选未触碰。

# 表格 caret／搜索揭示：续接验证 checkpoint 016

本阶段已验证有限范围内的候选行为，保存本地 checkpoint；**全量门禁仍 FAIL，未推送，不代表发布通过或 M9 完成**。起点为中断现场 d75fb87cc44843032c50b15a11ee018787df7265，旧失败014和中断015的源码及原始证据未覆盖。本总结与四文件差异、原始证据归档位于同一续接提交，提交身份由 Git 记录及交接最终回复给出。

## 当前修改

隐藏 Markdown 搜索标记在已证明 canonical source↔DOM text 投影时，揭示相邻真实文字行；标记自身无可见字形，不能称标记可见。未证明文本投影时恢复原 canonical-cell reveal fallback，注释明确这仅证明所属 cell 被揭示，不能证明精确命中字形定位。未修改源码、原生 Selection、文本节点或 history。

旧键盘表格测试由短整 cell mock 改为 5000px 高 cell 与实际 21px caret Range，最近揭示期望为75px，保留键盘目标焦点、preventScroll和无原生元素scrollIntoView断言。候选核心保留 CM scrollIntoView/public scrollHandler 生命周期，无私有 anchor 写入、定时回滚或 Selection 改写。

## 通过的有限范围

- 5k/20k ×900/1200 四矩阵各21步，共24次可见首/重复点击零位移、48次键盘操作，真实 caret 可见；消费后未见额外跳动。5k 是中断前最终caret核验，20k 是续接后；markdown.ts、table-caret-reveal.ts及caret geometry核心前缀精确字节hash相同，不能误称全源码版本相同。
- 04真实Search 5k/900、10真实Search 20k/1200各13步，包含header原生点击、Ctrl+F、隐藏 **、nested上下项与wrap、escaped pipe源码投影和Esc。十次查询/导航的Search handler均消费，写入发生于该handler；实际命中字形在视口，焦点保持Find input，canonical range和fixture字节未改。隐藏 ** 仅相邻真实行可见（10的y≈382–406）。Esc单独列为未验收。
- 原02取得真实Find输入框但旧observer漏掉lazy Search facet，不能计handler消费证据；04/10修正采集，原02保留。
- native-cell 99/99 ×2、document-history 57/57 ×2，四个独立userData；四轮19个产品文件hash均与当前源码相同，sameSourceFrames=0，独立审查复核通过。native undo与document undo保持既有不同canonical格式契约，不宣称OS物理键盘/IME。
- 本轮focused 34 PASS、304个有意过滤skip；新源码renderer build、typecheck、lint通过；中断前完整build通过，本轮未重复未改动的main/CLI/workspace构建。
- 仓库正式 `npm run perf:bundle` exit0，总JS gzip **1431999/1500000**，initial **101852/260000**；相对同协议最后公开main1430476增加1523。此处仅按当前仓库contract核验，不能替代冻结cp16的1431000获批上限。
- 独立只读复核未发现新增P0/P1/P2，原隐藏搜索回退P2关闭；只支持保存有限范围的本地候选checkpoint。

## 失败、部分采集与未测

严格全量门禁 **3341 PASS＋10 exact known failures＋1 unexpected symlink权限skip ⇒ FAIL**。唯一unexpected为 `src/main/file-identity-resolver.test.ts` 的symlink物理身份测试被环境权限跳过。未改allowlist或Windows开发者模式/安全设置。

Esc关闭Find造成正文宽度约502→750、总高度重新测量。09在已接受a4fb6020952da0ae887db9a4127088023f0d5c01基线，对照04同fixture（SHA256 f42058ad8875ea0cce38cacd7dc7a4cc0efcabcfb7372d640a2b3303b22fb5a5）、canonical range和起始命中字形中心（差0），两者scrollTop均491487→423190、delta **−68297**、最终部分命中位于视口外。因此已证明既有定位缺口，但未修复，不能称Esc定位稳定。10的20k/1200关闭亦未通过定位验收。

额外pointer edges：11在输入前因测试返回function不可clone而退出，0步；修正采集返回值后12仅完成一次高cell中部原生点击，位移0、21px native caret可见。下一轮fixture准备脚本异常退出，底部/empty/emoji三项未测。12的3990.9ms handler false和3991.2ms写入晚于有效步结束3943.1ms，属于下一fixture public navigation，不能归为已消费点击后的额外大跳。两次失败原始证据保留，没有把部分采集算作新增边界通过，停止扩展仪表。

最终全矩阵OS前景截图像素、OS IME、合法Typora UI对照、混合bidi、完整横向overflow、未知投影精确字形定位和剩余pointer edges尚未测。旧04-pixels只证明中间版本12帧实际21px caret，不能混入最终像素通过。此前列表/标题已完成成绩未重跑，本阶段无新的列表/标题验收声明。

## 身份与证据

YULUSTATION：Windows11Enterprise26200，i7-13700K16C24T，RAM34088263680，RTX4070 driver32.0.15.9186，balanced，2560×1440@165Hz/DPR1；Node24.13/npm11.6/Electron41.2/Chrome146，Georgia/MSYaHei18。沿用已固定本机基线，不混用旧9900X或Mac数据。实际exec读取与测试成功确认执行层恢复；本续接未重新fetch，最后已核验公开main为1654e82cd28008cc4f6ae9adec04c5a4d56389ec。

新原始目录 `.artifacts/table-caret-recovery-resumed-20261010/`；持久归档 `reports/experiments/table-caret-recovery-resumed-20261010/evidence.zip` 与manifest，395逻辑文件/191唯一blob/61607961原始bytes，排除userData，逐blob验证SHA256。归档SHA256 **e31f41f42dee3fd3e099b462226621fa0600c05f1e53c9a2512c286d7c7b2024**。manifest保留精确driver、报告、日志、截图、19文件source snapshots、原始history协议、baseline对照、stage/history/final-validation摘要及独立审查。

旧中断归档SHA256 9c5ad86ef8654a18fe3ae3a3c110db24fe5718a9b051b22c6b1a33a1183353f9 保持不变。用户标题边界选择已记录：固定留白＋超长空格/tab前缀显示源码；本阶段不混入标题实现。cp13/cp16、Library403/缺materialization阻塞、RF902/903均未触及。

# 表格体验本批范围精简与最终核验 018

用户已明确本批不处理关闭侧栏跳屏，不改收起动画；原交互布局选择取消等待。此结论更新017的待答复状态，不改写017历史证据，也不表示关闭跳屏已修复。产品检查点为 **46998f541c9c551c564ef13825e7cc3b510dd522**，tree **791b2df9cd6fdc3846fc4122927a6c97eea20019**。本阶段无产品代码修改，只清理未接入的工作副本并记录新范围，最终文档提交身份由Git和交接回复给出；不push。

## 清理与保留

Esc语义候选已在017之前撤出产品。本次检查src/packages，`FindReplaceCloseAnchor`、`cancelTableSearchClose`、`validateTableSearchClose`、`captureTableSearchClose`、`revealClosingTableSearchMatch`和relativeAnchorY无产品残留，且src/packages/scripts/fixtures相对46998f无差异。

已移除 ignored `.artifacts/table-search-close-20261010/semantic-candidate/` 的9个未接入原型文件。删除前验证绝对路径位于指定工作区、无reparse point、文件集合及各SHA与017归档一致。017归档保留，独立审查逐个解压内存验证276个blob，9份历史候选均可恢复。该历史记录不能视作待接入的产品候选。

公共 `revealTableRect` 必须保留：`src/renderer/search-runtime.ts` 两条已验收的Search路径分别用于canonical cell fallback和实际命中文字fragment定位；表格原生caret路径经 `revealTableCaret` 调用它。没有盲删公共API或改变已验证入格最小滚动、搜索定位、横向可达、caret、undo。未改sidebar关闭动画或运行时代码。

## 精简范围的验收依据

复核017同版本原始证据并重算摘要：四组5k/20k×900/1200各21步，24次可见点击零位移、48次键盘操作的caret可见且消费后无额外滚动；bottom/empty/emoji三场景通过；实际overflow13步通过；native-cell99/99×2、document-history57/57×2，四个独立userData和19文件源码pin与当前字节一致、sameSourceFrames=0。未重新运行未改代码的整套窗口矩阵，不能称018新增一轮完整交互测试。

完整build/typecheck/lint及正式bundle的017日志均exit0；本次产品与协议没有差异，沿用这些检查并验证源码pin、caret测试源码snapshot、预算contract的字节身份。正式总JS gzip **1431997/1500000**，initial **101850/260000**，当前仓库contract PASS；不能替代冻结cp16的1431000获批阈值，不能称cp16通过或M9完成。

严格全量按原observed重新应用当前known-failure baseline，结果与017完全一致：**3344 PASS＋10 exact known failures＋1 unexpected symlink权限skip ⇒ FAIL**，0 collection/hook/unhandled errors。唯一unexpected是 `src/main/file-identity-resolver.test.ts` 的物理symlink身份测试。本阶段新鲜复测该文件：**7通过、1个相同symlink skip、0失败**；该targeted进程exit0仅复现环境限制，不能替代严格全量PASS。未更改allowlist、系统开发者模式、安全设置或豁免。

独立只读审查未发现新增P0/P1/P2，确认无Esc候选残留、公共API实用调用、旧归档全部blob正确、四history源码pin一致、full唯一skip及预算区分。支持保存本地范围清理结论，不能宣布严格发布验收通过。

## 候选范围与剩余阻碍

可供父任务处理的产品候选范围是46998f及其既有已验证的表格入格最小滚动、Search定位、横向可达、caret与undo；关闭侧栏跳屏明确排除本批，不再作为本批待答复或实现项。**严格发布门禁仍被唯一未获豁免的symlink权限skip阻碍，当前不能声明可发布。** 完整横向组合矩阵、混合bidi、OS物理IME、Typora许可/UI对照仍未验收，不从当前通过推导这些成绩。

官方main沿用017本轮已fetch身份1654e82cd28008cc4f6ae9adec04c5a4d56389ec，tree3ea42b35ece431db21c6eb44e28fd8c7e0404214；018未再次fetch。cp13/cp16、Library访问阻塞、RF902/903、旧电脑文件均未触及。

新原始记录 `.artifacts/table-scope-final-20261010/` 包含cleanup路径/文件SHA记录、prototype引用审计、严格gate重算、fresh resolver日志/JSON和独立review。持久归档位于 `reports/experiments/table-scope-final-20261010/`，9逻辑文件/9唯一blob/17160原始bytes，逐blobSHA256验证，归档SHA256为 **bff6f5df54716282f5cfc696e82b9cd5bc8901427e0a964e3ff3f5c989198366**。017原归档SHA256仍为39279908d81a98396038f0bd53b440e9f296c83cfe7b50c26274a5a3868b5487，未改写。

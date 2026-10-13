# RF-901：混合夹具实测与结构行模型复用候选

2026-10-13，YULUSTATION。基于已发布 `34ced08c99d3c45b2f0d7873b024d09133b65363` / tree `c01fc9d118223a42ba13f9ff5ada18591a322aad`；[精确 CI 38344986718](https://github.com/yulu-gm/FishMark/actions/runs/38344986718) 的 Full regression、Quality、Bundle budget 均 success。此前报告验证和编辑体验修复已发布。

本批为独立性能候选；完整本地门禁与独立审查 PASS，保留本地 checkpoint，未推送此候选。不把已发布 UX 验收或本批局部收益视作 RF-901/M9 完成。

## 输入、边界与实测

实际 Electron 41.2.0，Windows 11/i7-13700K/32GB，同机平衡电源、DPR 1、固定 1000×720 编辑根、monospace 16px/22.4px、隔离 userData。使用同一 controller、30 次 `insertText("x")` 与 30 次 selection，插入位置为首段 `Paragraph` 的第 4 个字符后；校验每夹具最终源码保真、逐次命令结果和 30 个变更回调。所有样本包含首次 selection；无采样剔除。

- 20k 为提交中的 canonical mixed fixture，531783 B，SHA-256 `545601ad9d770898e23e5551e938bcaa4ebaecd8446941a4145a4db8777f6d37`。
- 5k 为该文件按 LF 分割取前 5000 行、重新以 LF 连接且无尾 LF：125 个完整 40 行段落组，132783 B，SHA-256 `01f2df9e46755985544a75ba1977a0460df3b6ff5f975078e1fea882751208ba`。明确为派生夹具，不伪称既有提交中的独立 canonical 5k。
- OFF 前后对比为主要耗时证据；ON 只定位热点并计数。ON 对每次 inline parse 保存 span，会带来额外内存、GC 和日志扰动，两种模式不混比。
- `SemanticCommandBindings.run` 的单一 owner span 从准备命令前到同步 dispatch 返回后结束，含同步派生/装饰/DOM/observer 及诊断结果记录；不是纯 semantic CPU、真实系统输入、editor-ready 或实际呈现时间。两次 rAF 也不是 compositor 呈现证明。

| OFF，30 样本 | 基线 p95 | 候选 p95 | 基线首样本/最大 | 候选首样本/最大 |
| --- | ---: | ---: | ---: | ---: |
| 5k selection dispatch | 8.1ms | 5.5ms | 11.0/11.0ms | 10.5/10.5ms |
| 20k selection dispatch | 36.0ms | 17.4ms | 32.4/36.8ms | 33.3/33.3ms |
| 20k typing dispatch | 2428.5ms | 2385.2ms | 2323.4/2439.8ms | 2385.2/2409.5ms |

这是单组配对实测，不声称统计显著性。typing 没有实质改善；源码、60 个 applied 命令结果和各夹具 30 个 document-change 回调均保持正确。OFF 无 span，解析次数为未测，不能填零。

基线 ON 显示每次普通输入一次完整夹具解析，selection 零解析；20k full parser inclusive p95 1861.9ms，是输入主热点。开文档的三个 parse 调用是两次空字符串 bootstrap 加一次真实夹具解析，不能称三次完整夹具解析。后续仍需解决安全增量解析、structural edits、cold/warm editor-ready、完整平台和呈现预算。

ON 前后归因：每份夹具 30 次 selection 中，语义行模型构建均由 30 次变为 1 次；selection full parse 仍为 0。20k 该构建的基线 p95 22.9ms，候选仅首样本构建 22.1ms，后续为零。完整语义命令区间 typing p95 为基线 2035.5ms、候选 2528.8ms；这也说明不能把本批描述成输入性能改善。span 闭合/父子区间/直接子项账目校验均无错误，仍只作诊断用途。

## 最小候选

`normalizeStructuralBlankSelectionAnchor` 每次查询都会构建 `StructuralLineModel`，间接重建全部语义行和索引。该模型只依赖不可变 snapshot，现由模型 owner 内的 WeakMap 按 snapshot 对象身份复用。新编辑生成新 snapshot；同 revision 数字的不同文档互不串用，旧 snapshot 查询保留旧结果。模型和暴露的行对象均冻结，对外类型只读；selection、方向、focus 不进入缓存。

controller 集成测试覆盖 source/wysiwym、reading/editing、只读开关、documentPath 和主题扩展配置：这些变化不改变规范结构，复用同 snapshot 的模型且语义查询保持一致；`replaceDocument` 得到新模型。缓存 owner 不读取模式、字体、路径或配置，因此无需为显示变化添加失效状态。WeakMap 不强持有 snapshot；value 闭包回引 key 不会单独阻止回收。活跃文档或历史仍持有的 snapshot 可以保留其模型，没有全局强引用列表或额外生命周期 registry。真实 heap 释放量与长会话内存预算尚未测，不把此设计说明冒充内存验收。

没有解析算法、编辑语义、系统设置、阈值或正式计时协议改动，没有接入冻结 cp13/cp16。首次模型构建仍存在，不能将首样本排除后声称每次 selection 均达标。

## 证据位置与验证

原始报告、完整日志、transform manifest、固定输入身份、派生摘要位于本工作区 `.artifacts/m9-mixed/`。`run.mjs` / `main.cjs` 是本地隔离诊断脚本，仅通过 probe Vite transform 注入夹具和计时边界，生产文件无计时逻辑；每次运行使用新的输出目录。`compare.cjs` 校验 span 闭合/父子包含/直接子项账目并保留分组计数。命令：

```powershell
node .artifacts/m9-mixed/run.mjs .artifacts/m9-mixed/<fresh-name> off
node .artifacts/m9-mixed/run.mjs .artifacts/m9-mixed/<fresh-name-on> on
node .artifacts/m9-mixed/compare.cjs baseline-off candidate-off baseline-on candidate-on
```

局部语义测试 11/11，覆盖复用、共享数据不可修改、同 revision 文档隔离、编辑前后 snapshot、CRLF、separator、方向导航及文档首尾；新增 controller 模式/配置集成测试 1/1。独立代码审查与独立语义复测 PASS。

完整 lint/typecheck/build、strict、foundation 310/310、bundle 1,434,139/1,500,000 B、实际 Electron 编辑体验 79/79、安全 7/7、正式 behavior 121/121 /2541 targets 均已通过。原八条失败指纹、99 个 formal known-defect 保留，未扩大清单。新增模式测试后补跑 lint/typecheck/完整 strict 均通过，最终 3555 passed +8 exact known、0 skip/unexpected/errors，symlink 实际 passed；独立模式测试复跑 1/1，最终 review PASS。证据索引 `.artifacts/m9-mixed/checkpoint.json` 在本地提交后记录精确 commit/tree 与原始文件哈希。当前不宣称 RF-901、M9 或系统 IME 通过。

# RF-901：混合文档词内输入局部解析

2026-10-13，YULUSTATION，基于已发布 `6301d0b2b92bc0e7926830d81fe3295e58b98b4d` / tree `2df79b9f74a8fa4d671658b48637f51b97b86f13`。本批完整本地门禁通过，独立静态审查通过；提交及发布后精确 CI 另记。RF-901/M9 仍进行中，不能以本批通过代替预算验收。

## 修复及边界

旧增量路径要求整个目标段落是无格式纯文本，并排除全局引用/脚注依赖。canonical mixed 文档的 `Paragraph` 内普通输入因此每次完整解析，20k 约两秒。

保留旧纯段落路径，新增严格受限路径：顶层单行 paragraph、首字符为 ASCII 字母、编辑完全位于直接 text 子节点内部、插入/删除及两侧字符均为 ASCII 字母，且 text 值等于原始源码。整段 inline 重新解析；其他节点仅更新坐标。引用/脚注 Map 与编辑前后节点共用按绝对源码位置映射的 WeakMap，保留脚注 lines 共享身份；链接 destination/title 即使位于编辑另一侧也正确更新。编辑前 cache 不变。

新增 mixed 路径不接纳换行、结构符号、空格、容器内部、已解析链接内部、代码/math、非 ASCII 或无法证明的边界，这些输入若不满足原有纯段落路径则完整解析；旧纯段落对空格/Unicode 的支持保留。尚未覆盖一般中文混合输入、IME 或结构编辑的性能优化，不声称普通输入全场景达标。未解析引用经词内编辑成为有效引用时，正向局部解析；逆向已处于 link 内，正确退回完整解析。

## 同机实测

沿用报告 022 的隔离 Electron 41.2 / Windows 11 / i7-13700K / 平衡电源 / DPR1、1000×720、monospace 16px/22.4px、固定输入位置、30 次 controller 输入及 30 次 selection 协议。20k SHA-256 `545601ad9d770898e23e5551e938bcaa4ebaecd8446941a4145a4db8777f6d37`，531783 B；派生 5k SHA-256 `01f2df9e46755985544a75ba1977a0460df3b6ff5f975078e1fea882751208ba`，132783 B。夹具与探针协议不变。

| OFF，30 样本，ms | 6301 基线 p95 | 本批 p95 | 本批首样本 / 最大 |
| --- | ---: | ---: | ---: |
| 5k typing dispatch | 457.0 | 64.4 | 59.6 / 67.3 |
| 20k typing dispatch | 2385.2 | 278.8 | 278.8 / 280.1 |
| 5k selection dispatch | 5.5 | 3.9 | 7.5 / 7.5 |
| 20k selection dispatch | 17.4 | 13.0 | 35.2 / 35.2 |

同协议单组对照，不声称统计显著性。首次样本保留；仍有明显 dispatch 开销，不能据此证明 16ms semantic 预算达标，完整预算未验收。构造耗时 OFF 2260.3→2475.1ms，未优化开文档，不等于 editor-ready 或真实呈现。第一次候选 OFF 与类型检查重叠，留为 `incremental-off` 探索记录，正式比较使用单独独占运行 `incremental-off-isolated`。

独立 ON 用于阶段归因，不与 OFF 混比：两份夹具的 30 次输入完整解析均从 30→0，每次仅目标段落 inline 解析；所有 span 闭合、父子包含与直接子项账目通过。20k 剩余热点 p95 为 block decorations 110.1ms、incremental edit inclusive 64.4ms、semantic document 27.5ms、physical document 22.3ms。各项 p95 不相加为总预算。当前仍遍历/重映射全树并重建装饰，后续需继续局部更新。

两种模式均保留源码、每夹具 60 个 applied 命令结果、30 次变更回调。controller 同步 dispatch 与两次 rAF 不是系统键盘/IME、compositor 或整机交互验收。原始报告、transform manifest、全部样本、派生比较与检查日志保留 `.artifacts/m9-mixed/`：`candidate-off/on` 是 6301 基线，`incremental-off-isolated/on` 是本批，`comparison.json` / `incremental-phases.log` 为摘要。

## 验证

54 项新增 parser 差分测试：全 root/nodesById/reference/footnote/source 与 fresh parse 比较，覆盖 LF/CRLF/EOF、跨前后定义、链接/图片/表格/脚注共享、重复及无效定义、插入/删除/等长替换与逆操作、旧快照不变、拒绝边界和 canonical mixed20k。新增 controller 测试覆盖 source/wysiwym、reading/editing、真实 history undo/redo 及结构回退后的完整树一致性。

完整串行门禁均 exit 0：lint/typecheck/build；strict **3610 passed +8 exact known、0 skip/unexpected/collection/hook/unhandled errors**，Windows symlink 实际通过；foundation 310/310；gzip **1,434,552/1,500,000 B**；Electron editing 79/79、workspace safety 7/7、formal 121/121 /2541 targets，99 known-defect、0 unexpected/not-run。未修改阈值、allowlist 或正式 case。独立 review 的解析候选 PASS；trace 的通道漏记已修正后复核。

## 前批发布与尚未解决问题

6301 已普通快进推送 main。[CI 38347148385](https://github.com/yulu-gm/FishMark/actions/runs/38347148385) attempt 1 的全量回归/包体通过，但 Linux safety 第二次关闭 15 秒超时，仅有 Cancel 响应 `[2]`、runtimeErrors `[]`，formal 因此未运行；原产物保存 `.artifacts/m9-memory/ci-safety-attempt1/`。同一失败作业重跑后 attempt 2 全绿。本机原构建复核也 7/7。**重跑通过不是竞态已修复。**

静态发现取消恢复可编辑早于 COMPLETE，快速第二次 close 可能被 pending guard 吞掉；另有 blur autosave 与 main close lease 相互等待的可能。现有产物不能区分二者。本批仅给 safety smoke 增加真实 save/apply/flush/confirm/complete 与 window/requestId 时序，不改超时或断言、不替换产品 bridge。所选 handler 的 await/logging 有诊断开销，其余 handler 原样注册；不声称完全无时序扰动。后续应做确定性复现并单独修复生产 owner。

6301 发布前已补最小内存生命周期实证：隔离 Electron 显式 GC，连续替换 12 个 5k 文档后旧 snapshot/model WeakRef 均零，当前均一，destroy 后均零，见 `.artifacts/m9-memory/result3/result.json`。仅覆盖该释放路径，不代表自然 GC 时机、历史所有路径或长会话内存预算。

cp13/cp16 保持冻结，Library 访问阻塞未绕过；RF-902/903 尚未启动。后续优先关闭握手确定性问题和剩余整篇装饰/派生开销，再补 RF-901 全场景与平台预算。

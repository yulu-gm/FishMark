# RF-901：打开阶段的脚注行号扫描

2026-10-13，YULUSTATION。基线 `6d91f50b9c5053b6314def168c5a74104d86c740` / tree `59f6770ea4658f7d50062e996800f518f5976c9c`，CI38356533360全绿。沿用报告026的Windows11/i7-13700K/32GB/Electron41.2/DPR1、canonical mixed5k/20k、真实磁盘路径、独立profile与后台窗口协议。

## 热点与修复

私有 `.artifacts/m9-open-phases/` 诊断在同生产App的ON构建中细分打开：20k暖打开full parse为1528.1/1548.5ms，其中 `resolveLineNumberAtOffset` 每次调用2000次、反复从全文开头计数LF，独占时间621.2/619.8ms。它用于脚注前后段落片段的行号，计算结果不依赖全篇重新扫描。

将 `document-projection.ts` 原有二分行号查询原样移到内部 `line-lookup.ts`，projection与full parser复用。每次full parse通过同一个局部回调按需创建索引；没有需要行号的脚注段落则不创建。返回树不持有回调或索引，无全局缓存、跨文档失效或新增公开API。删除原重复前缀扫描，保留原LF计数、CRLF/孤立CR/UTF-16/EOF语义。

候选ON暖full parse为914.5/912.6ms，每次只建一个索引（0.7/2.1ms），500次脚注attach的独占耗时1.1/1.0ms。定义收集、micromark和inline解析仍有成本，未减少或隐瞒其调用。ON首启动带开发态React StrictMode与Vite转换，记录到多次构建，不把该次数或时间冒称生产构建结果；最终性能对照使用OFF真实构建。

## 验证与测量

新测试使用已删除扫描方式作为独立oracle，覆盖每个UTF-16偏移、LF/CRLF/孤立CR/空文档/EOF、非BMP、脚注多组完整树与projection、canonical20k全树、0/1次lazy构建、连续不同文档各自索引。canonical projection逐节点旧扫描初次验证通过但本身引入约25秒二次复杂度，最终保留小型完整projection对照和canonical全树对照，不把无价值二次扫描留给长期回归。

最终同协议OFF生产构建复用已记录的6d91f50基线，不重复其测量；每组三个不同磁盘文件，首次独立进程/profile、后两次暖进程。ready时间（ms）：

| 大小 / 场景 | 基线 | 候选 |
| --- | ---: | ---: |
| 5k 首次 | 1641.3 | 1564.2 |
| 5k 暖1 / 暖2 | 313.0 / 296.5 | 271.8 / 250.5 |
| 20k 首次 | 4179.6 | 2923.9 |
| 20k 暖1 / 暖2 | 1606.3 / 1601.9 | 960.1 / 931.1 |

候选6/6真实打开、指定位置单字符输入、精确源文与原生撤销恢复通过，字体/DPR/字号/行高/内容宽度与基线一致。首输入区间仍约5k40–49ms、20k142–174ms，本批不宣称优化它。`comparison.json`记录逐样本数据、fixture与脚本/raw SHA256，ON/OFF分开；首启动与暖进程不混算。首次5k/20k仍超过正式500/1500ms预算，暖打开改善不替代初始门禁。

最终相关7文件151项通过；完整lint/typecheck/build、strict **3677 passed +8 exact known、0unexpected/skip/collection/hook/unhandled**、foundation310、gzip **1434741/1500000B**、editing79、safety7、formal121/121与2541targets通过，formal99known、0unexpected/not-run。初次宽泛Vitest `parse`过滤额外匹配到parse-block-map的既有8项失败，日志保留；精确相关测试与未改动strict wrapper随后全部完成，没有新增allowlist或删除失败。独立review在发布前核验，证据存 `.artifacts/m9-open-phases/independent-review.md`。

原始文件、baseline-run脚本、严格JSON与全部日志保留，禁止覆盖历史测量。yuluStation短暂离线后核验相同HEAD/局部源码和活动会话恢复；没有重跑已完成的标题批或它的OFF基线。没有系统设置、用户文档、前台、冻结cp13/cp16或Library访问变更。

RF-901/M9未完成，RF-902/903仍PLANNED。ready仍按活动路径/DOM/fonts/two rAF记录，未变成compositor证据。三样本报告首次与两次暖打开，不估算p95/p99、不宣称OS磁盘冷缓存；自然GC十分钟与终末forcedGC旧结论不外推。本批减少同步CPU扫描，不宣称完成初始editor-ready、输入16/24ms、完整平台IME/软换行、掉帧及长期内存预算。

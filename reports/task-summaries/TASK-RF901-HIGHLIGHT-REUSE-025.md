# RF-901：有界复用代码高亮的相对 token

2026-10-13，YULUSTATION，基线 `c0c8ae37135200c99bc5d958aa4b50a411436409` / tree `bbd90e149738fa246c577b68934e715291246763`。同机 Windows 11 26200 / i7-13700K / 32GB / Electron 41.2.0 / DPR 1，独立 userData 与 offscreen 真实 Electron 窗口。未改 cp13/cp16、系统设置、用户文档或其他工作区。

## 选择依据与实现

细分诊断确认 mixed20k 每次词内输入调用 1000 次代码高亮。原 128 项 LRU 在顺序全量遍历中抖动：30 次输入每次 parserRuns/misses/evictions 都增加 1000，hits 为零。带同一组计数与 phase instrumentation 的 ON 对照，高亮阶段 p95 **53.3→6.2ms**，完整装饰阶段 **109.0→58.7ms**。初次细分（尚无计数）观测高亮 56.7ms；这两个诊断协议不混算。

本批只修改已有代码高亮缓存。精确匹配规范化语言和代码内容，替换有碰撞风险的 FNV key；缓存冻结的相对 token，命中后仍按当前 codeStartOffset 新建 Decoration。保留完整装饰与派生重建路径；表格、图片 widget、源码范围、回调和文档路径上下文均重新构建。没有跨 revision 映射旧 widget，也没有增加事务证明框架。

容量同时限制 **2048 项、1,048,576 个逻辑字符串 UTF-16 code units（含 key 前缀/className）、65,536 个 range**；命中/覆盖提升 LRU，按需淘汰多项，单项超容量正常渲染但不缓存。原单代码块 20,000 字符同步限制不变。该逻辑容量不是实际 JS 堆字节保证；V8 字符串 backing retention 与长会话内存需另测。实测 mixed20k 使用 1000 项、335392 code units、16000 ranges，30 次输入 parserRuns 增量全部为 0。

## 同协议 OFF 结果

沿用报告 023 的固定 mixed5k/20k 文件、30 次相同 controller 词内输入/selection、保留首样本；OFF 不装 phase instrumentation，测试进程不与其他测试并跑。以下为本轮 c0 基线与最终候选，不能拿历史约 279ms 直接混算：

| 项目 | c0 基线 | 候选 |
| --- | ---: | ---: |
| 5k 输入 p50 / p95 / max ms | 43.0 / 51.9 / 63.4 | 31.4 / 51.6 / 63.6 |
| 20k 输入 p50 / p95 / max ms | 190.2 / 247.1 / 255.8 | 143.3 / 185.1 / 200.7 |
| 20k 首输入 ms | 199.7 | 161.8 |
| 20k selection p95 ms | 10.1 | 9.7 |
| 20k constructor open ms | 1874.3 | 1898.2 |

60/60 commands applied、每个 fixture 30 个文档回调、源文件 hash/最终 source/样本数量均通过。5k p95 基本不变，不能宣称尾延迟全面改善。constructor open 不是磁盘打开/editor-ready；dispatch 与两帧探针也不能证明纯语义 16ms 或 compositor 预算。

## 测试与审查

新增 13 项：缓存三容量边界、覆盖/clear、LRU 与多项淘汰、超容量拒存、不可变结果、重复工作集；1000 个不同代码块移动位置后零重复解析，单内容修改仅重解析一项；预载 TS/JS 后实际 token 差异与别名命中；混合容器/引用/脚注/表格/图片/模式的暖 token 与冷缓存完整装饰等价；真实 controller 输入/undo/redo/模式与引用、代码、图片、脚注修改后完整重建等价。widget 仍为新实例。

独立只读 review 无 P0/P1/P2。其建议的加载两种语言后再比较、多项淘汰测试均已补齐。首次完整回归拦住 renderer 测试导入包内部模块，已改用现有公开入口；保留原始失败报告，没有修改架构规则或 allowlist。

最终串行门禁：lint/typecheck/build exit 0；strict **3631 passed +8 exact known，0 skip/unexpected/collection/hook/unhandled errors**；foundation310；gzip **1,434,652 / 1,500,000 B**，门槛未变；真实 editing79、safety7、formal121/121 /2541 targets，99known-defect、0unexpected/not-run。既有 MaxListenersExceededWarning 原样保留。

原始证据位于 `.artifacts/m9-decor/`：baseline-off、candidate-off-final、baseline-counts、candidate-counts 的 raw/integrity/transform manifest，comparison.json，decor-check-final.json、最终门禁日志与 initial-regression-failed.json。早期 candidate-off 仅作探索保留，最终性能结论使用 candidate-off-final。公开 main 和 CI 精确身份另记 checkpoint/published.json。

M9/RF-901 仍未完成。剩余全量 offset/派生/装饰成本、真实 OS IME、磁盘打开到可交互、长会话自然 GC、完整平台和呈现预算继续单独验收；不把本批局部收益当最终预算达标。

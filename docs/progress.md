# FishMark 进展记录

工作流状态：

`TODO` -> `DEV_IN_PROGRESS` -> `DEV_DONE` -> `REVIEW_IN_PROGRESS` -> `CHANGES_REQUESTED` / `ACCEPTED` -> `CLOSED`

## 当前项目判断

### 2026-09-22 M5 / RF-506 slice I：entry-aware Mermaid tiny-module coalescing

上一版 `cc4a78c` 证明 tiny-module 合并可以把 `totalJsGzipBytes` 从 1,438,511 降到 **1,417,892（PASS）**，但旧 `manualChunks` 会把不同 entry 的 Mermaid 模块强行合为一个 1.76MB shared chunk，并被 initial closure 静态引用，导致 initial 三项与 forbidden-initial 全面回归，因此该规则被判定为不可接受。

本切片把现有 package chunk policy 从 Rolldown 兼容层 `manualChunks` 迁到原生 `output.codeSplitting.groups`。KaTeX、CodeMirror view/state 与 FishMark package-owned chunk 维持原 owner；Mermaid 小模块使用 `maxModuleSize: 12_000 + entriesAware: true`，只在**相同 entry 使用集合**内聚合 tiny modules，避免动态 diagram entry 与 initial entry 被无条件共包。大 diagram 模块仍自动切分；既有 Mermaid forbidden-initial / required-lazy gate 保持不变。该方案的验收仍完全交给正式 CI bundle provenance，不修改预算或 analyzer 口径。

### 2026-09-22 M5 / RF-506 slice H：合并 Mermaid tiny lazy modules

`4761664` 的 CI Quality 已全绿；bundle 三项 initial 指标也全部 PASS，唯一剩余为 `totalJsGzipBytes 1438511/1430000`（差 8511 B）。bundle 日志显示 Mermaid 动态图中存在大量数百字节到数 KB 的独立 lazy chunk；aggregate budget 对每个 chunk 分别 gzip 后求和，因此这些 tiny registration/facade 模块重复承担 header/import/export 与压缩字典开销。

本切片不把 Mermaid 全量合成一个 chunk，也不改变 diagram 能力：仅在 `node_modules/mermaid/dist/**` 中，将 Rolldown 已加载后源码长度不超过 12,000 字符的小模块归并到 `mermaid-small` lazy chunk；较大的 flow/sequence/architecture 等 diagram 实现继续保留各自动态边界。现有 `forbiddenInitialSourceGroup:mermaid` 仍 fail-closed 约束任何 Mermaid 模块不得进入 initial。目标是降低 total-JS aggregate gzip，而不把大型 Mermaid payload 前移到首屏或删除支持类型。

### 2026-09-22 M5 / RF-506 slice G：只剩 total JS，改做真实 minification

CI 对 `e591dc5` 的正式 bundle 结果为：`maxInitialChunkBytes 182006/300000 PASS`、`maxInitialChunkGzipBytes 57287/90000 PASS`、`totalInitialGzipBytes 94585/260000 PASS`，说明壳层 shortcut metadata / CodeEditor lazy 边界已把 initial 债彻底清零；唯一剩余为 `totalJsGzipBytes 1439079/1430000 FAIL`（差 9079 B）。上一刀的 `lodash-es` manual chunk 未改善 aggregate gzip，故撤回，避免为 budget 保留无收益 chunk 策略。

本切片只做 release minifier 收口：Terser compression passes 2→3，并把 `console.log/debug/info/trace` 声明为 pure calls 以便在 production 压缩时移除；`console.warn/error` 保留，产品错误诊断仍存在。另修复 shortcut overlay groupId 拆分后暴露的 TypeScript props 适配错误。预算与功能集合均不变化；等待 CI 实测 total JS 是否进入 1,430,000 B 原上限。

### 2026-09-22 M5 / RF-506 slice F：壳层 shortcut metadata 延迟加载 + lodash 聚合

GitHub CI 在 `272c094` 给出正式剩余预算：`maxInitialChunkBytes 198742/300000 PASS`、`maxInitialChunkGzipBytes 57367/90000 PASS`、`totalInitialGzipBytes 265046/260000 FAIL`、`totalJsGzipBytes 1438872/1430000 FAIL`；15 个 forbidden-initial 与 4 个 required-lazy 均 PASS。Quality 同时暴露 `markdown-shortcuts.ts` 四个 shortcut metadata import 在最近拆分后已未使用，本切片直接删除。

初始 closure 仍把 editor-model / CodeMirror 拉入，根因之一是 App/WorkspaceShell 为 rail 与快捷键提示静态读取 `@fishmark/codemirror-adapter` runtime shortcut group。现壳层只持有轻量 `ShortcutGroupId`（type-only），`ShortcutHintOverlay` 本身改为 lazy module，并在真正显示时再由 adapter 的 canonical descriptor 解析 group；编辑器 keymap 与 shortcut 定义仍只有 adapter 一份。欢迎页不再为了随机 shortcut tip 加载 editor runtime，改为平台化通用提示 `Tip: Hold Ctrl/Cmd for shortcuts`。为处理剩余 total-JS gzip，`lodash-es` 统一进入一个仍为 lazy 的 vendor chunk，减少 Mermaid 多 chunk 各自 gzip 的重复字典成本；不删除 Mermaid 能力、不调整任何预算。等待本提交 CI 实测决定是否还需后续 slice。

### 2026-09-22 M5 / RF-506 slice G：CodeEditor 按文档懒加载 + KaTeX 去重

最新正式 CI bundle 已恢复完整 provenance：15 个 forbidden-initial 与 4 个 required-lazy 全部 PASS，单 chunk 两项也 PASS；仅剩 `totalInitialGzipBytes=267470/260000` 与 `totalJsGzipBytes=1436749/1430000`。产物同时暴露两个完整 KaTeX lazy chunk（各约 76KB gzip），因此 Vite 对 `node_modules/katex/**` 增加单一共享 `katex` chunk，消除重复打包而不改变其 lazy 属性。Initial 侧不再继续微调首屏 UI，而把 `CodeEditorView` 改为有文档时才通过 React lazy mount：空 workspace 壳层无需提前加载 CodeMirror editor，打开文档时再加载本地 editor runtime；M9 仍独立负责 document-open 延迟预算。新增源码合同钉住 editor lazy 与 KaTeX shared-lazy 边界，所有 bundle limit 继续保持原值。

### 2026-09-22 M5 / RF-506 slice F：撤销过宽 adapter manual chunk

Provenance v2 后 CI 已能完整执行正式 bundle analyzer。实测确认 `totalJsGzipBytes=1427440/1430000` 已 PASS，但此前把整个 `packages/codemirror-adapter/src/**` 固定到一个 manual chunk 会跨越 adapter 内部的动态 import 边界，把 KaTeX/Mermaid/语言相关代码吸入 1.24MB initial chunk，导致 initial 三项和 forbidden-initial 证据同时回归。现删除该过宽 manual chunk，仅保留不会跨 lazy boundary 的 editor-model / markdown-engine / workspace package ownership chunk；Search lazy、Terser、Chromium target 均保留。新增构建配置合同禁止未来再次把整个 codemirror-adapter 强制合并。另补 Search document-identity reset 的精确 React lint 说明，保持原行为不变。

### 2026-09-22 M5 / bundle provenance v2：显式记录 Rolldown facade chunk

CI clean install 修复后，Linux sourcemap build 仍稳定产出同一 `moduleIds=[]` 的 `dist-BFdHydeb.js`，证明该 chunk 不是 workspace dist alias 遗留，而是 Rolldown 的真实 facade 输出。Provenance contract 升级到 v2：每个 chunk 新增 `facade: boolean` 与 `facadeModuleId: string|null`；普通 chunk 仍必须至少包含一个 moduleId，**只有 Rolldown 明确提供非空 facadeModuleId 的 facade 才允许 moduleIds 为空**。这种 facade 的空 sources/mappings map 不再伪装成普通 COMPLETE map，而报告为显式 `sourceMapEvidence.status=FACADE`；任何其它 map 问题仍 INCOMPLETE。Forbidden-source 归属同时把 `facadeModuleId` 纳入 provenance source groups，并继续校验 facade 的 static/dynamic import closure，因此零-module facade 不能成为隐藏依赖的绕过点。新增 producer + analyzer 两层回归，未降低 bundle budget 或 provenance fail-closed 约束。

### 2026-09-22 CI clean-install lock portability 修复

首个 GitHub Actions CI 在 Ubuntu / Node 22 / npm 10.9.8 的 `npm ci` 阶段 fail-closed，错误为 `Missing: @emnapi/runtime@1.11.3 from lock file`。当前 lock 已包含 `@emnapi/core@1.11.3`，但 Windows npm 生成的 lock 漏掉了 `@napi-rs/wasm-runtime` optional peer 所需的顶层 `@emnapi/runtime`。按 npm registry 元数据补录精确 `1.11.3` 条目（dev + optional + peer，依赖 `tslib ^2.4.0`），不增加产品运行时依赖。该问题由 clean Linux `npm ci` 首次暴露，后续 CI 将持续防止跨平台 lock 漂移。

### 2026-09-22 常备 CI 上线：quality + bundle budget

新增 `.github/workflows/ci.yml`，对 main push、PR 与手动 dispatch 生效。CI 使用 Node 22 + `npm ci`，分成两个 blocking job：`quality` 执行 typecheck、lint、architecture/provenance/release-isolation/RF-703 focused contracts 与完整 build；`bundle` 独立执行正式 `npm run perf:bundle` 并上传 14 天 bundle 日志 artifact。两个 job 末尾都检查 tracked working tree 必须保持干净，测试或构建若修改 package/release metadata 会直接 fail。当前全量 Vitest 仍含已登记 known-failure 集合，因此暂不把原始 `npm test` 作为 blocking job；后续若建立 exact known-failure runner 再接入，避免 CI 永久红而失去信号。

### 2026-09-22 M5 / RF-506 slice E：修复 sourcemap provenance 阻塞 + release test 仓库隔离

owner 在 `18d1b85` 上复测发现 `perf:bundle` 的 sourcemap build 被 provenance 插件提前阻塞：workspace-application / workspace-infrastructure 未配置 Vite source alias，renderer 通过 package exports 打包其 `dist/**` 构建产物，Rollup 生成多个匿名 `dist-*.js`，其中一个纯 re-export facade 的 `moduleIds=[]` 触发 provenance 的 fail-closed 不变量。修复选择**对齐 Vitest/tsconfig 的既有做法**：Vite 直接 alias 两个 workspace package 到各自 `src/index.ts`，并按 package owner 命名 chunk；不修改 provenance schema，也不允许零-module chunk 静默通过。这样 renderer 不再“二次打包 workspace dist”。

同批处理仓库卫生：Windows/macOS release 单测中的 builder `projectDir` 不再指向真实 `process.cwd()`，每个测试使用 OS temp project directory 并纳入现有 cleanup。即使 mock/timeout 行为未来变化，release helper 也没有权限写真实仓库的 package/release metadata。后续 CI 还会增加 `git diff --exit-code` 作为 fail-closed 脏树门禁。

### 2026-09-22 M5 / RF-506 最终收口 slice D：固定 Terser + package-owned initial chunks

基于 owner 对 `257cc90` 的实测，剩余三项 FAIL 已明确为：`maxInitialChunkBytes 325153/300000`、`totalInitialGzipBytes 267050/260000`、`totalJsGzipBytes 1439520/1430000`；其余 20 项 bundle 检查全 PASS，KaTeX/Mermaid forbidden-initial 与 4 个 required lazy chunks 均保持绿色。下一刀不再继续移动用户功能：release JS minifier 从 Vite 8 默认 Oxc 改为**精确锁定 Terser 5.51.2**，`module=true + compress passes=2`，用于真实压缩 total JS / initial gzip；Terser 及其 lock entry 固定，避免 minifier 漂移改变冻结预算。与此同时仅为解决单块 raw gate，把 `codemirror-adapter / editor-model / markdown-engine` 按 package owner 拆为稳定 initial chunks；总 initial gzip 仍统计完整 static closure，因此这项 chunking 不能掩盖总量。预算上限没有修改。等待本提交真实 `perf:bundle` 后决定是否可直接进入 RF-506/M5 最终验收。

### 2026-09-22 M5 / RF-506 最终收口 slice C：Search lazy + CodeMirror vendor chunk

继续按原预算减首屏：`@codemirror/search` 不再由 `code-editor.ts` 静态导入；新增 `search-runtime.ts`，第一次文档 mount 后低优先预热，并在显式打开 Search 前由 `prepareFindReplace()` 保证 runtime 已装入 CodeMirror Compartment。查找/替换仍完全使用 CodeMirror `SearchQuery/search state/find/replace`，没有第二套搜索语义。Vite 同时把 `@codemirror/view` 与 `@codemirror/state` 分成独立 initial vendor chunk，用单-chunk gate 约束各自大小；`totalInitialGzipBytes` 仍会统计整个静态 closure，因此该拆分不能掩盖总量。Chromium 146 原生 modulepreload，production build 关闭 Vite polyfill。新增源码合同钉住 Search lazy、CodeMirror chunk 与 polyfill 边界。等待真实 bundle 产物复测后再判断是否需要继续削减 total JS。

### 2026-09-22 M5 / RF-506 最终收口 slice B：renderer target 对齐 Electron Chromium

为压缩 `totalJsGzipBytes` 而不删除功能或放宽预算，Vite renderer build 明确从默认广泛浏览器 target 收敛到 `chrome146`。仓库锁定 Electron 41.2.0，其 Chromium 为 146；因此这是运行时事实的显式化，而不是降低兼容承诺。新增 bundle source contract 防止未来无意退回广泛浏览器转译。此改动与 slice A 一起等待真实 `perf:bundle` 复测，四个 maximum 未全绿前 M5 仍保持 IN_PROGRESS。

### 2026-09-22 M5 / RF-506 最终收口 slice A：真实生产 bundle 减重

owner 要求在进入 M8 前收掉 M5。本轮重新激活 RF-506，但不重开已通过的语义/行为切换：唯一目标是让原始 bundle maximum gate 真正转绿，不调预算、不删用户 Markdown 能力。第一刀处理两类明确不属于默认首屏的负担：① `EditorTestBridgeHost` 改为与 test-workbench 相同的编译期 DEV/test 边界，production build 不再发出 `editor-test-driver` 自动化 chunk；正式 behavior/performance/geometry 探针均有独立 probe page，不依赖该 production host。② `WorkspaceShell` 不再静态导入 macOS custom `TitlebarHost` 与 `ThemeSurfaceHost`；两者仅在对应平台/titlebar 或动态主题 surface 实际存在时通过 React lazy 加载，默认编辑器 initial closure 不承担 shader scene host。新增源码合同防止测试 bridge 或两个 optional host 被重新静态接回。此 slice 只改变加载边界，不改任何 bundle limit；等待真实 `perf:bundle` 后决定是否需要 slice B。

### 2026-09-22 RF-703 / M7 正式验收 COMPLETE

owner 已确认 `b6a2c8e` 后的复验通过。RF-703 因此正式收口：renderer Outline/Metrics 仅消费 `EditorDerivedSnapshot`，生产 legacy document/inline/reference parser 调用已清零；Outline 与 editor active heading 共用 canonical node id，Metrics 直接消费 canonical tree / inline AST / physical-line geometry；React 按 snapshot identity/revision 更新，不再从 resultingText 启动第二套结构派生。性能证据也已从“硬编码期望”修正为同一 `MarkdownParseInstrumentation` tracker 的实际区间 delta：shared snapshot build 与 consumer interval 分开计量，Outline/Metrics consumer 的 full/inline parse delta 为 0，且不把上游 snapshot reuse 冒充为自身 cacheHit。Frozen performance baseline 仅重录实测发生语义变化的 outline/metrics 两个 operation，RF-602 canonical outline-id 守卫已恢复。基于最终复验，**RF-703 = COMPLETE，M7 = COMPLETE（3/3）**。下一依赖阶段为 M8 / RF-801；M5/RF-506 的既有最终性能与 bundle budget 债仍独立保持开放。

### 2026-09-22 RF-703 证据可信度修正 + frozen baseline 合法重录

owner 对 `84d0b4c` 的独立复核确认结构目标已达成：renderer 的 Outline/Metrics 已退化为 snapshot 投影，`EditorDerivedSnapshot` 为唯一文档级派生 owner，生产 legacy parser 调用清零；同时指出两项 acceptance 证据问题。第一，`document-derived-ui.ts` 原先把 consumer 的 `fullParse=0/cacheHit=1/parserEntries=0` 写成常量，测试再断言同一常量，形成自证循环，且 `cacheHit=1` 错把上游 snapshot reuse 记在 consumer 名下。现改为一份 `MarkdownParseInstrumentation` tracker：shared snapshot build 记录 `snapshotBuildCount` 与真实 full/inline parse event；Outline/Metrics 分别记录执行前后 delta，`counters.fullParse` 直接取实测 delta，consumer `cacheHit=0`。focused perf contract 明确断言一次 snapshot build、当前 canonical build 的两个 full-source scan event（reference-definitions + full-document-tree），以及两个 consumer 的 full/inline parse delta 均为 0。保留的 `parserEntries` 仅为历史报告 schema 字段，其 parser ownership 由 architecture guard 静态约束，不再作为“consumer 无解析”的运行时证据。第二，按 owner 实测，frozen baseline 的 outline/metrics 观测值已合法变化，因此仅重录这两个 operation：outline `fullParse 2→0` / reason→null；metrics `fullParse 3→0` / `parseMarkdownDocument 1→0` / reason→null；两者 `cacheHit` 保持真实的 0，不采用先前错误的 1。baseline test 不再通过 filter 绕开 Outline/Metrics，而是在遍历全部 operation 时对 snapshot consumer 做显式合同断言。另补回 RF-602 的“非标题根 sibling 之后 heading id 仍直接取 canonical node.id”回归守卫。RF-703 继续保持 IN_PROGRESS，等待本提交后的 focused/full/baseline 复验。

### 2026-09-21 M7 / RF-703 实现：Outline / Metrics 收敛到 EditorDerivedSnapshot（验证待执行）

性能合同同步：foundation baseline 测试不再要求 Outline/Metrics 像独立 parser consumer 一样产生 full parse；两者的新硬契约是 `fullParse=0 / parserEntries=0 / cacheHit=1 / unavailableCapabilityReason=null`。真正的 parser 成本只记录在 shared snapshot build / editor production path。冻结 `editor-foundation-current-baseline.json` 仍保持未改，等待实测 diff。

静态复核补强：React passive effect 顺序可能让 `CodeEditorView` 先发布新 snapshot、父 `App` 的 load effect 后执行；若父层无条件清空 derived UI，会把刚收到的新 revision 数据抹掉。load boundary 已改为**仅在 activeDocument=null 时清空**，正常 tab / loadRevision 切换完全由新 editor snapshot 替换旧 snapshot，避免依赖父子 effect 的执行先后。

RF-703 代码层已切换到 revision-owned derived snapshot：`EditorDerivedSnapshot` 新增 root-level `outlineHeadings` 与 lazy `documentMetrics`；Outline 直接投影 `snapshot.outlineHeadings`，Metrics 从 canonical tree / inline AST / table cell inline / physical line prefix geometry 派生，不再调用 `parseMarkdownDocument` / `parseInlineAst`。task/list/blockquote 等结构 marker 通过 physical-line content boundary 排除，code fence 仅统计 fence-content。React 的 derived-data controller 改为接收 snapshot；App 只在 snapshot identity 变化时更新，首次文档 snapshot 立即应用，后续 revision 仍保留 120ms UI debounce，selection-only 变化不重复刷新；`useEditorWorkflowController` 不再把 `resultingText` 送入第二套解析。性能探针改为先构建一次 shared snapshot，再测 Outline / Metrics consumer，consumer parser entries/fullParse 均应为 0、cacheHit=1，并单独记录 shared snapshot build 的真实 full-document parse 次数。**冻结 baseline 本提交刻意不修改**，等待实际 `perf:baseline` 输出后按测量证据更新，RF-703 暂保持 IN_PROGRESS。

### 2026-09-21 RF-702 正式验收 COMPLETE

owner 在干净 HEAD `1b08a2c` 上完成修复后复验：focused **5 文件 / 42 测试**全绿，typecheck/build exit 0；全量 Vitest **2799 passed / 1 skipped / 11 failed**，失败集合精确回到 M6 已知的 `parse-block-map 8 + document-metrics 1 + code-editor 2`，新增 viewport-reveal 表格回归已消失；architecture guard **234/234**。bundle 侧 `forbiddenInitialSourceGroup:katex` / Mermaid 与 4 个 required lazy-chunk 检查全部 PASS，KaTeX 泄漏的约 82KB 已回收；`perf:bundle` 仍仅因既有四个 maximum budget 超限而 exit 1（当前 totalInitialGzip 273083 / 260000 等），继续归 RF-506/M5 与 M9 最终性能债。基于上述证据，RF-702 标记 **COMPLETE**；M7 进度变为 2/3，下一任务 RF-703。

### 2026-09-21 RF-702 验证反馈与 gate 回归修复

owner 在 `df3b562` 拉取后的干净树上补跑 RF-702 要求的三项验证：presentation + export focused tests **3 文件 / 33 测试通过**、typecheck exit 0、build exit 0；同时额外发现两处不能忽略的新红点。① `perf:bundle` 的 `forbiddenInitialSourceGroup:katex` 从 PASS 变 FAIL，`totalInitialGzipBytes` 267192 → 349610，根因是 presentation 主 barrel 静态 re-export 了带 `import katex` 的 HTML renderer。现修正为：KaTeX 重新只由本来就 lazy 的 `src/renderer/export-html.ts` 引入，presentation 通过纯 `renderMath` callback 接收 MathML renderer，package root 不再静态依赖 KaTeX，并新增资产合同防回归。② 全量 Vitest 比 M6 基线新增 1 条 viewport reveal 表格失败；定位为同帧共享 measure key 的 intent 覆盖：键盘 `nearest` 会被 programmatic focus 触发的 `preserve` 弱化。现改为“最新 target + intent 提升（navigate > nearest > preserve）”合并，并补纯策略断言。RF-702 仍保持 IN_PROGRESS，等待这些修复后的 focused/full/perf 复跑；未通过前不进入 RF-703。

### 2026-09-21 M7 / RF-702 实现推进：HTML Export canonical cutover（验证待执行）

RF-702 已完成代码层切换：`src/renderer/export-html.ts` 不再拥有 `parseMarkdownDocument / parseInlineAst / collectReferenceDefinitions` 等 export 语义解析，只做 `parseFullDocumentTree → buildRenderPlan → renderFishmarkMarkdownContent`、主题 CSS 收集和外层 HTML 文档拼装。纯 Markdown 内容 HTML 渲染迁入 `packages/markdown-presentation/src/html/render-export-content.ts`，输入为同一 canonical render plan；为了保持既有 CSS/DOM 合同，内部可使用 `projectMarkdownDocument(tree)` 的兼容序列化，但该函数不做 scope inference、source scan 或 inline parse，inline/table/reference/footnote 数据均直接来自 canonical tree。新增 presentation 级测试覆盖嵌套容器、table cell inline、reference image 与 footnote。当前 GitHub connector 无执行环境，因此尚未产生 roadmap 要求的 `packages/markdown-presentation + export-html.test + build` 新鲜运行证据；RF-702 暂保持 IN_PROGRESS，不提前标 COMPLETE，也不越 gate 宣告 RF-703 已开始。

### 2026-09-21 设计与重构进度文档同步到当前 main

按 owner 要求统一项目内设计与 progress 真相：`docs/design.md` 更新到 M6/M6.5 后架构，明确 `editor-core` 已删除、canonical snapshot/render plan + `codemirror-adapter` 为生产主路径；壳层改写为常驻 rail + 平面 docked sidebar + 固定正文 measure，并记录“外层 track 平滑移动 / 内层最终宽度避免 reflow”的当前动画契约；新增 viewport reveal 的 `preserve / nearest / navigate` 设计和异步高度 anchoring 的职责边界。同步修正 `docs/refactor/editor-foundation/progress.md` 与 `MVP_BACKLOG.md`：M6 改为 COMPLETE 4/4，RF-701/602/603/604 均 COMPLETE，M7 改为 IN_PROGRESS 1/3，下一正式任务为 RF-702 → RF-703；M5/RF-506 仍因最终性能与 bundle 预算未通过而不标 COMPLETE。历史中间态记录保留，但不再作为当前状态源。

### 2026-09-21 特殊编辑区域统一 viewport reveal 策略（第一版）

针对点击表格单元格、图片预览时视口被突然拉动的问题，新增 `packages/codemirror-adapter/src/viewport-reveal.ts` 作为统一滚动策略入口。第一版定义三种 intent：`preserve`（鼠标点击，已可见则零滚动）、`nearest`（连续键盘导航，24px 垂直 / 16px 水平安全边距，仅做最小修正）、`navigate`（显式跳转，可居中）。图片 preview 点击从无条件 `y:center` 改为 `preserve`；表格 cell 的 pointer select 同样使用 `preserve`，键盘/结构导航默认 `nearest`。原表格滚动的“立即一次 + RAF 一次 + requestMeasure 再一次”三段路径删除，统一为单个 `requestMeasure` read/write，并用共享 measure key 合并同帧 focus/mousedown/click 请求。`focus({preventScroll:true})` 继续阻止浏览器原生抢滚动。新增纯策略测试并更新真实 controller 表格滚动回归：可见点击不滚，ArrowDown 只滚 CodeMirror scroller 并留下安全边距。异步图片解码导致的高度锚点漂移仍是后续独立问题，本切片不混入。

### 2026-09-21 Sidebar 正文位移动画恢复且保持内容无 reflow

上一刀为消除 sidebar 文字 reflow 取消了 `grid-template-columns` 过渡，副作用是 Markdown document stage 在开关 sidebar 时改为瞬移。现将模型细化为**外层 track 动画、内层内容固定宽度**：`workspace-shell` 恢复 220ms grid track 过渡，正文因此继续平滑右移/左移；同时新增 `--fishmark-side-panel-content-width`，Search/Outline 的 header/body 始终按最终宽度排版，外层 `.side-panel{overflow:hidden}` 只负责在 track 展开/收起时裁剪显示区域。因此长 Outline 标题不会经历中间宽度换行，正文位移动画也恢复。窄窗口的 44vw clamp 同样作用在 final content width 上；用户主动 resize 仍允许实时 reflow。

### 2026-09-21 Sidebar 开合动效去 reflow（中间方案，已被“正文位移动画恢复”方案替代）

针对 owner 观察到的 Outline 长标题在 sidebar 展开过程中反复换行：根因是 workspace-shell 对 side-panel grid track 做 0 → stored width 的 220ms 宽度过渡，导致内部 Search/Outline 每帧都按新宽度重新排版。现改为**布局宽度原子切换 + 内容淡入/淡出**：打开时 sidebar track 立即进入最终宽度，header/body 只做 opacity + 4px translateX；关闭时利用现有 closingViewContainer 加 :has() 在 180ms 淡出期间继续保留最终 track 宽度，动画结束卸载后才收回列。这样 sidebar 文本从第一帧起就以最终宽度排版，不再因开合动画产生 reflow；用户主动拖拽 resize 时仍按实时宽度重排，这是明确的交互反馈。同步更新 renderer CSS 契约测试，移除旧玻璃样式和 grid 宽度动画断言。

### 2026-09-21 Sidebar 平面化视觉调整

按 owner 反馈将 M6.5 左侧共享 sidebar 从“悬浮玻璃卡片”收敛为更克制的 docked panel：保留现有 rail、共享宽度、Search/Outline 容器、resize 与持久化逻辑不变；仅移除 sidebar 外层圆角、阴影、backdrop blur 与渐变高光，取消 sidebar/document 间额外 gap，改用单一右侧 1px 分隔线，并把开合动画从 translate+scale 收敛为 4px 的轻量位移。搜索框、按钮、outline hover/active 等内部交互控件仍保留轻微圆角，以维持可操作层级。此修改为 CSS 视觉层调整，未改变编辑器或 workspace 状态语义。

### 2026-09-20 M6 + M6.5 验收完成并收口（owner 已认可）

M6（RF-701 嵌套渲染 / RF-602 遗留解析路径与物理行几何归一 / RF-603 异步 widget 生命周期与测量 / RF-604 包边界硬切换）与 M6.5（外壳布局不变性 + VS Code 式侧栏）在本会话声明的范围内**全部落地并通过父级独立验收**：`packages/editor-core/` 已删除、architecture guard 为 7 包 / 13 规则 / `exceptions: []`（234/234）、全量 vitest 2788 passed / 1 skipped / 11 failed（失败集合与开工前逐条相同，无新增无删覆盖）、独占 oracle `unexpected=0 / known-defect=99 / not-run=0`、6 个 Electron 探针除 `editing-experience` 的已知 5 条 bare-marker 族外全部 exit 0。**M6 / M6.5 已由 owner 明确认可全部验收并在本日标记为 `ACCEPTED`（收口）**，随后按 owner 指示**提交并推送 main**：提交 `4a66136`（168 个文件，+7802 / −4946，含 `packages/editor-core` 删除到 `exceptions: []` 的全部改动），`origin/main` 已推进到该提交；提交内容与本节验收所依据的树完全一致（提交后仅追加文档状态更新）。明确留给后续：RF-702（HTML 导出 canonical 化）、RF-703（outline/指标统一到 `EditorDerivedSnapshot`）、包体积预算、M5 最终性能验收、M7–M10，以及三个已测量但契约未定的产品行为候选（未聚焦时异步预览长高推移视口、编辑轴 wysiwym↔source 切换的有界位移、widget 池 DOM 复用累积 cell 监听器）。

### 2026-09-19 M5/M6 持续实现

用户授权通过 SubAgent 推进 M5 与 M6。RF-506 当前为 `DEV_DONE`（行为/安全验收 PASS，包体积 FAIL、最终性能验收 pending）；代码基于主目录未提交改动，而非旧 refactor worktree。父 agent 负责计划与独立验收，实现按 runtime 与 pure model 分工，审查 agent 处理明确的 adapter 安全/性能前置缺陷。父最终 2671 passed / 1 skipped、lint/typecheck/build、正式行为 121/121 与编辑交互均通过；M5 不提前标 COMPLETE。按调整后的依赖先推进 RF-701 → RF-602/603/604，删除重复显示派生后按原包体积预算共同收口。当前 intake：`docs/plans/2026-09-19-rf-506-intake.md`。

### 2026-09-17 Editor Foundation 复审修复与路线调整

当前任务 `RF-HARDEN-001`：`ACCEPTED`，父 agent 独立验收 `PASS`。单个实现 agent 修复了恢复基线/落盘确认、增量正确性/隐藏全文解析、桥接版本与快照复用。全量 195 文件、2,535 passed / 1 skipped，独立审计 19/19，build/typecheck/lint 与正式行为 121/121 通过。后续专注可维护与可扩展、编辑交互、性能；下一任务 RF-601 事务/history/IME 与新路径性能验证，之后 RF-506 → RF-701 共享 render plan → RF-602/603/604。复杂结构全文回退、真实平台 IME 与 20k 输入到绘制尚未验收，不把本轮 PASS 扩张为整个重构完成。详见 `reports/task-summaries/RF-HARDEN-001.md`。下方旧日期记录是历史，不代表当前正在执行 RF-101。

### 2026-07-16 RF-101 Workspace Domain 开发交接

Editor Foundation 重构中的 `RF-101` 已进入 `DEV_DONE`，等待独立架构验收与任务验收。生产级 `@fishmark/workspace-domain` 现在是 workspace/window/tab/document session 与文件身份的唯一 canonical state；main 持有唯一 live `WorkspaceState`，通过显式 mapper 输出 shared IPC DTO。renderer/preload 的 Save、Save As、reload 只发送 `tabId`，main 在同一 tab lease 内从 canonical checkpoint 派生保存/重载目标与 Save As 默认路径。成功 open/save adapter 文档的 path 已硬切为非空 string，nullable path 只属于 untitled workspace/domain projection；main 在 mutation 前运行时验证 adapter，并锁定普通 Save/reload/close 的 canonical path/name/content。watch sync 不再接受 renderer 指定的 tab/path：application 无状态读取 canonical active path 后立即转发 intent，不再持有跨 stat 的 per-window queue；per-webContents infrastructure controller 独占 desired path/path epoch、latest sync admission、entry identity、monotonic observation identity、exact internal-write identity 与 destroy tombstone。所有 stat 在状态提交外运行，返回后只用 live controller 和 exact identity 做短 CAS；同 entry 多 callback 只有 latest initiated 可更新 baseline/发事件，begin-write 可跳过被新 intent 淘汰的 pending sync，own-write callback 无论怎样逆序都静默，complete 只提交/清理自己的 write transaction。watch create/replace/rollback/destroy 均先更新 authoritative state 再 safe close，close throw 不会泄漏或复活 controller。dirty 由 revision equality 派生，精确 saved-text checkpoint 支持恢复到已保存内容即 clean。Draft 更新和 reorder 都由调用 renderer 推导 expected owner；旧窗口迟到请求既不能修改新 owner，也不会收到新 owner 的 projection。Save、Save As、reload、individual close、reorder 与 cross-window move/detach transfer 共享同一 per-tab FIFO transaction，owner 在 lease 内复验，owner/missing 结果显式失败。Reload revision race 通过唯一 `success(snapshot) | revision-stale` 结果硬切。Detach、window registration 与 native close 的现有 fail-closed transaction 不变。旧 `src/main/workspace-service.ts`、`getTabPath`、renderer-selected file identity、watch queue、compatibility facade、reload allow-stale 通道和双状态路径均不存在。

新鲜开发门禁：物理文件 location/object identity、hardlink/symlink、owner-tab activation、Open/Save As interleaving focused 12 files / 135 tests 全绿，全量 Vitest 157 files / 1,982 tests；lint 0 error / 8 个既有 warning，typecheck、renderer/workspace-domain/Electron/CLI build、workspace-domain emitted runtime verifier 均通过，diff check 通过；正式 editor behavior 的既有基线为 121/121 cases、2,541/2,541 targets、0 unexpected/not-run。总重构进度仍为 2/38，M1 仍为 0/2，只有验收通过后才能标记 `RF-101 COMPLETE` 并开始 `RF-102`。

### 2026-06-23 TASK-061 引用列表 Tab 与尾部 separator 回归修复

补齐单层引用中 padded empty list item（`> - `）的真实 Tab 覆盖；统一列表命令可将其缩进为 `>   - `。同时修复引用列表退出后尾部 `>` 累积：同深度的结构分隔行和活动空引用行现在成对退出，顶层 `>\n> ` 收敛为普通结构空行，嵌套层级则两行一起逐级 outdent，不再留下孤立 quote marker。对于已经残留在列表项之间的隐藏 `>`，Tab 会在确认上下都是同深度、同缩进、同列表类别后清理连续 separator，再复用正文列表缩进算法；列表命令也不再被暂时陈旧的 active-block cache 提前拒绝。

### 2026-06-23 TASK-061 引用内裸列表 marker Tab 回归修复

引用内普通非空列表项的 Tab / Shift+Tab 路径原本保持可用，但 Enter 提升空列表项后留下的裸 `-` / `1.` 会被 micromark 解析为上一列表项的 lazy continuation，导致 Tab 找不到当前 list item。现在 editor-core 会在普通列表缩进命令前识别紧邻活动列表尾部祖先链的裸 marker，在 quote prefix 后增加缩进并补 marker padding；`> > -` 按 Tab 后得到 `> >   - `，重新成为可解析、可渲染的嵌套列表项。

### 2026-06-06 TASK-061 引用块末尾空行 Backspace 回归修复

针对人工验收截图中的引用块末尾空行回归，Backspace 现在会把当前 `>` / `> ` 空引用行当作引用内 empty line 直接删除；如果上方紧邻同一引用块末尾结构空行，也会一并删除。删除后 selection 落在同一引用块内上一条实际内容行的文本末尾，例如 quoted list 的 `child list` 行尾，不再出现裸 `>` 中间态。

### 2026-06-06 TASK-061 结构行模型验收补充

`codex/editing-region-structural-model` 分支已完成 `TASK-061` 后续结构行模型收敛：`editor-core` 新增共享 `StructuralLineModel`，body structural blank 与 blockquote 内部 bare `>` separator 统一进入同一 line role / separator metadata；selection normalization、ArrowUp / ArrowDown、Backspace separator 删除和引用内列表 Enter / Backspace parity 已改为消费这份模型。

本轮 macOS 验收结论为 PASS：focused Vitest、blockquote / list / structural-blank editing-experience probes、blockquote Typora visual probe、排除 Windows/打包图标测试后的 mac 全量 Vitest、typecheck、lint、build 与 `git diff --check` 均通过。按用户要求，本轮不把 Windows/打包图标测试作为 mac 验收阻断项。

### 2026-04-24 架构重构进度

当前架构重构在隔离 worktree `/Users/chenglinwu/Documents/Yulora/.worktrees/codex-architecture-reset`、分支 `codex/architecture-reset` 上继续推进，执行计划为 `docs/superpowers/plans/2026-04-23-fishmark-architecture-reset.md`。

已完成并通过 review：
- Task 1：shared workspace contract 与 product/test bridge 类型边界已收口。
- Task 2：workspace canonical truth 已收敛到 main，save / close 的 in-flight draft race 已修复并补测试。
- Task 3：`window.fishmark` 已收缩为 product bridge，`window.fishmarkTest` 已隔离到 test-workbench / editor-test runtime；preload bridge mode contract 已提到 shared 层。
- Task 4：renderer workflow orchestration 已拆到 `useWorkspaceController` / `useSaveController` / `useExternalConflictController` / `useEditorWorkflowController`，`document-state.ts` 已删除；save-success refresh、in-flight draft、Save As replay 等竞态已通过 spec + quality review。
- Task 5：`src/renderer/editor/App.tsx` 已收缩为 composition/orchestration root，workspace shell UI 已迁到 presentation-only `WorkspaceShell`；settings drawer 状态已抽到 `useSettingsController`，主题派生已抽到 `useThemeController`，`app.autosave.test.ts` 中直接检查 App JSX 的覆盖已迁移到新 shell 文件。Task 5 已通过 spec review + code quality re-review；review 中发现的未授权 header Save 按钮已移除，outline navigation 已改为 App 层 callback 代理。
- Task 6：`docs/design.md` 已同步为 tabbed workspace + main canonical workspace truth，崩溃恢复 / workspace session restore 已明确回到 backlog；`docs/theme-authoring-guide.md`、renderer markup 与 bundled theme fixtures 已统一到公开 `data-fishmark-surface` / `data-fishmark-theme-surface` hook，不再把 shell-private class selectors 当作主题 API。Task 6 已通过 spec review + code quality re-review。

当前进行中：
- Task 7：最终全量验证与 handoff 文档已完成；最终架构 review 发现的关闭 / 打开前 draft flush 缺口正在本分支内收口。
- 已修复：File Open / startup open / drag/drop open / New tab 现在会先 flush 活动 tab draft，避免切换 workspace snapshot 前丢失 renderer 最新编辑内容。
- 已修复：原生窗口关闭不再由 main 直接读取旧 workspace snapshot；main 先向 renderer 发送 typed close request，renderer flush 最新 draft 后再调用 main 的统一 close-confirm use case。
- 已修复：`dev:electron` / `dev:electron:test-workbench` 等待 preload 实际 runtime shared 输出，避免 clean watch 启动时共享模块未编译完成就启动 Electron。
- 下一步：对 `codex/architecture-reset` 做最终 code review，然后选择 merge / PR / 继续开后续 cleanup slice。

接手注意：
- `package-lock.json` 在 worktree 中有既有无关脏变更，不要回滚也不要纳入本轮提交。
- `WorkspaceShellProps` 仍然偏宽，这是 Task 5 code-quality review 留下的非阻塞 P2；后续如果继续拆 renderer shell，可以优先按 workspace chrome / editor canvas / settings drawer / theme surface host 分组收口 props。
- 最新验证结果：focused close/open tests 通过 2 files / 151 tests；`npm run lint` 通过但保留既有 Fast Refresh warning；`npm run typecheck` 通过；`npm run build` 通过但保留既有 Vite chunk-size warning；`npm run test` 通过 84 files / 808 tests。
- 每个任务继续执行 spec review -> code quality review 两段验收；当前架构重构实现阶段已完成，下一步是最终 code review / release-branch 收尾选择。

截至 2026-04-16，项目处于“可运行编辑器 + 偏好设置与主题运行时基础能力”阶段，而不是“完整 Markdown 编辑器”阶段。

从源码可确认的已完成内容：
- Electron 主进程已能创建窗口
- preload 已通过 `contextBridge` 暴露最小 API
- React 渲染器已能显示最小文档界面
- 已建立安全的 Markdown 文件打开 bridge、UTF-8 读取与错误映射
- renderer 已具备当前文档状态，并能把已打开文档加载到 CodeMirror 6 编辑器中
- 存在主进程文件打开测试和 renderer 文档状态测试
- 偏好设置已接入颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体和 autosave idle delay，变更可实时生效
- 当前文档已支持外部修改 / 删除冲突检测，冲突发生时会暂停 autosave 并提供重载 / 保留当前编辑 / 另存为三条路径
- 已建立主进程持有的标签页工作区真值与 renderer 标签栏主链：当前窗口已支持创建 / 打开 / 切换 / 关闭多个 Markdown 标签页，`Open...` / 拖入 / 外部打开默认进入当前窗口标签流，标签可排序并拖出成新窗口；保存、另存为、autosave、外部文件 watcher 与关闭确认已按活动 `tabId` / 窗口标签序列工作，活动标签继续复用单个 CodeMirror 编辑器实例
- 基础目录边界已建立：`apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e`

从源码可确认的未完成内容：
- 图片粘贴与拖入还未接入完整链路
- 崩溃恢复尚未打通
- 搜索替换、PDF 导出与图片拖放导入仍待完善；HTML 导出已落地为静态导出切片，但 local image embedding 与完整语法 tokenization 仍是剩余风险

当前工作区依赖已安装，并已在 2026-04-16 本地环境里实际执行并通过 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`。若环境差异较大，可按需重跑四项门禁命令复核。

## 人工验收建议

如果你现在想人工验收，请验 `TASK-001`、`TASK-002`、`TASK-003`、`TASK-004`、`TASK-007`、`TASK-032`、`TASK-036` 和 `TASK-037`：
- `TASK-001`：确认开发壳能启动，界面能显示占位内容和 preload 平台字段
- `TASK-002`：确认目录边界存在且未破坏根目录当前可运行外壳
- `TASK-003`：确认可以通过系统文件对话框打开 UTF-8 `.md`，并把内容加载到当前文档界面和 CodeMirror 编辑区中
- `TASK-004`：确认编辑后会进入 dirty 状态，`Save` 会写回当前路径，`Save As` 会写入新路径并切换当前文档路径
- `TASK-007`：确认 CodeMirror 编辑区可输入，undo / redo 快捷键可用，且保存链路仍与当前编辑文本保持一致
- `TASK-032`：确认 `File` 菜单提供 `Open...`、`Save`、`Save As...`，同时页面壳层不再呈现居中 demo 卡片样式
- `TASK-036`：确认当前文件在系统外部被修改或删除后，会出现重载 / 保留当前编辑 / 另存为提示，并且 autosave 不会静默覆盖外部变化
- `TASK-037`：确认设置页支持颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体与 autosave 间隔，且变更能持久化并即时生效

不要把当前仓库误判为“已经具备完整 Markdown 编辑器 MVP 功能”。

## 任务状态表

| Task | Epic | 状态 | 说明 |
| --- | --- | --- | --- |
| BOOTSTRAP-DOCS | 文档基线 | CLOSED | 文档基线已修正并关闭。 |
| TASK-001 | 项目骨架 | CLOSED | 已通过独立评审；确认 Electron / Vite / React / TypeScript 开发壳可建立。 |
| TASK-002 | 项目结构 | DEV_DONE | 已建立 `apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e` 目录边界，同时保持根目录开发壳可运行。 |
| TASK-003 | 打开 Markdown 文件 | DEV_DONE | 已接入安全打开桥接、UTF-8 读取、错误提示与临时 textarea 显示。 |
| TASK-004 | 保存与另存为 | DEV_DONE | 已接入安全 Save / Save As bridge、主进程写入、dirty 状态与保存反馈。 |
| TASK-005 | 自动保存 | DEV_DONE | 已接入 idle autosave、blur autosave、手动/自动保存状态区分，以及保存进行中再次编辑后的单次 replay autosave。 |
| TASK-006 | 最近文件 | DEV_DONE | 已接入 main 持久化最近文件列表、preload 受限 bridge、空工作区入口、点击重开与失效路径清理。 |
| TASK-007 | CodeMirror 6 接入 | DEV_DONE | 已用 CodeMirror 6 替换临时 textarea，并接入基础编辑面、快捷键与现有保存链路。 |
| TASK-032 | 应用菜单与壳层收敛 | DEV_DONE | 已接入原生 `File` 菜单中的 `Open...`、`Save`、`Save As...`，并把 renderer 临时壳收敛为更像桌面编辑器的单栏界面。 |
| TASK-008 | micromark block map | ACCEPTED | 已接入 `micromark` parser 事件流，输出 `heading` / `paragraph` / `list` / `blockquote` 的最小 block map，并通过 parser 单测与 repo 门禁验收。 |
| TASK-009 | active block 状态 | DEV_DONE | 已在 `packages/editor-core` 中落地 active block 解析，并由 CodeMirror 选择变化驱动 renderer 侧当前块状态。 |
| TASK-010 | 标题渲染 | CLOSED | 标题 `#` 弱化、激活回源码态、目标测试、人工验收与合并前门禁均已完成。 |
| TASK-011 | 段落渲染 | CLOSED | 非激活段落轻量渲染、激活回源码态、目标测试、人工验收与合并前门禁均已完成。 |
| TASK-012 | 列表与任务列表渲染 | DEV_DONE | 已补齐列表项 block metadata、非激活态列表/任务列表渲染、Enter 续项与空项退出规则；2026-04-20 起有序列表编辑重构为统一语义层：`markdown-engine` 显式保留 `startOrdinal` / `delimiter` 与嵌套 `children`，`editor-core` 通过 `list-edits` 处理插入、删除、缩进、反缩进、上下移动与 transaction 级归一化，不再依赖分散的按键补丁逻辑；2026-04-21 又把 ordered-list normalization 从“全文替换”收敛成增量 `sequential` 事务，只修正必要 marker diff，彻底修复阅读模式下回删有序列表时页面跳顶的问题；同日还统一了嵌套空列表项的 Enter 语义：ordered / unordered / task list 在子级空项回车时会先回退一层创建父级空项，只有顶级空项才会退出到空行；2026-04-30 将无序/任务列表的 `Tab` / `Shift+Tab` 也收敛到递归 item context，支持二级继续缩进到三级并避免按键泄漏到 UI 焦点导航；同日将层级操作的提交范围收敛为最小 diff，避免整段 root list 替换导致页面滚动跳动。 |
| TASK-013 | 引用块渲染 | DEV_DONE | 已为 top-level 引用块补上非激活态淡色背景与缩进显示，隐藏 `>` 前缀，并在激活时恢复完整 Markdown 源码态；新增 blockquote 交互与 composition flush 回归测试。 |
| TASK-044 | 嵌套引用块 | DEV_DONE | 已把 blockquote 前缀解析收敛到 `markdown-engine` 的 parser-owned helper，支持 `> >`、`>>`、`>    >` 与 tab stop 边界；非激活态隐藏完整引用前缀并输出 capped depth class / nested rails；Enter、Backspace、`Shift+Cmd/Ctrl+9` toggle 与 HTML export 均复用同一前缀语义，已有引用行 toggle 只移除一层。 |
| TASK-014 | 链接显示与编辑 | DEV_DONE | 已基于 inline link AST 实现非激活态可读链接文本、Mod-click / Mod-Enter 打开交互，以及 main/preload 白名单协议系统浏览器桥接。 |
| TASK-015 | 图片粘贴 | DEV_DONE | 已接入剪贴板图片导入、本地 `assets/` 落盘、相对路径 Markdown 插入，以及 Markdown 图片与 HTML `<img>` 在激活态源码 + 预览 / 非激活态图片预览下的统一渲染。 |
| TASK-016 | 图片拖放 | TODO | 拖放图片导入。 |
| TASK-017 | 大纲侧栏 | DEV_DONE | 已补齐 heading 到 outline item 的提取、右侧悬浮可折叠大纲面板、默认收起入口、独立滚动区与点击后编辑器定位/滚动，并覆盖 renderer 回归测试。 |
| TASK-018 | 查找替换 | DEV_DONE | 已接入最小全文查找替换面板、CodeMirror 匹配高亮、替换当前 / 全部替换，以及 undo history 回归。 |
| TASK-019 | HTML 导出 | DEV_DONE | 已接入 `Export HTML...` 菜单、shared/main/preload IPC、主进程 HTML 保存对话框、renderer 静态 HTML 生成与当前 CSS/theme 内联；导出不改变 Markdown 保存目标或 dirty 状态。已知剩余风险：local image bytes embedding 与完整代码块语法 tokenization 未覆盖。 |
| TASK-020 | PDF 导出 | TODO | 导出当前文档为 PDF。 |
| TASK-021 | 崩溃恢复 | TODO | 异常退出后的未保存状态恢复。 |
| TASK-022 | 中文 IME 修复 | TODO | 组合输入与光标稳定性。 |
| TASK-023 | round-trip 回归测试 | TODO | 防止 Markdown 风格被重写。 |
| TASK-024 | Playwright 冒烟测试 | TODO | 在测试工作台体系内接入首条 CLI 可触发的打开-编辑-保存-重开冒烟场景。 |
| TASK-025 | 测试工作台窗口 | ACCEPTED | 已交付独立测试工作台窗口、测试模式启动入口、最小 runtime bridge，以及从工作台拉起独立 editor 测试窗口的基础能力，并完成本轮验收复核。 |
| TASK-026 | 场景注册表 | DEV_DONE | 已在 `packages/test-harness` 落地 `TestScenario` / `TestStep` 类型、`createScenarioRegistry` 静态注册表与查询 API，并把 `defaultScenarioRegistry` 接入工作台场景目录面板；种子场景 `app-shell-startup`、`open-markdown-file-basic`。 |
| TASK-027 | 测试运行器 | DEV_DONE | 已在 `packages/test-harness` 落地统一运行器、步骤状态机与终态处理，并接入工作台运行事件流。 |
| TASK-028 | Debug 界面 | DEV_DONE | 已将 runner 事件流接入测试工作台 renderer，交付场景概览、步骤追踪、最近事件流，以及失败 / 中断原因展示。 |
| TASK-029 | CLI 与工件协议 | DEV_DONE | 已提供 `npm run test:scenario` 统一入口、稳定退出码与标准结果工件目录协议。 |
| TASK-030 | visual-test 支持 | TODO | 首版 synthetic gradient 方案已回退；需按真实截图与真实结果来源重做。 |
| TASK-031 | 核心场景扩充 | TODO | 首批可持续使用的核心测试场景集。 |
| TASK-052 | Dev-only 输入录制 Debug 工具 | TODO | 在 dev/debug 模式提供右下角手动开始/结束的编辑器输入录制工具，写出键盘输入序列与文档开始/结束快照；release 和打包产物必须剔除 recorder UI、bridge 与 writer 逻辑。 |
| TASK-033 | 代码块渲染 | DEV_DONE | 已补齐 fenced code block block map/info string、非激活态等宽渲染与源码态恢复，并覆盖 round-trip 基线回归。 |
| TASK-034 | 行内格式渲染 | DEV_DONE | 已在 `markdown-engine` 建立 canonical `parseMarkdownDocument()` 与完整 inline AST，并接入 `editor-core` / renderer 的非激活态行内渲染；当前支持 bold / italic / inline code / strikethrough 及常见嵌套，光标回到对应 block 后恢复 Markdown 源码态。 |
| TASK-035 | IME 基线保护 | ACCEPTED | 已完成 composition guard、autosave 光标回归修复与段落/标题/列表回归测试，并通过本轮中文 IME 人工验收。 |
| TASK-036 | 外部文件变更检测 | DEV_DONE | 已接入按窗口绑定的当前文档 watcher、外部修改/删除提示、重载 / 保留当前编辑 / 另存为三条路径，以及冲突期间 autosave/Save 的保护规则。 |
| TASK-037 | 偏好设置持久化 | DEV_DONE | 已建立 `app.getPath('userData')/preferences.json` 配置存储，覆盖 autosave 间隔、最近文件上限、应用 UI 字体与字号、文档字体与字号、主题设置；提供 schema 校验、范围 clamp、损坏文件备份恢复与原子写入；通过 `getPreferences` / `updatePreferences` / `onPreferencesChanged` bridge 对 renderer 暴露受限访问；设置页已接入颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体与 autosave idle delay；社区主题统一从 `<userData>/themes/<familyId>/<mode>` 扫描，当前主题不支持所选 light/dark 模式时会回退到 `FishMark 默认` 并显示提示；最近文件列表已由 `TASK-006` 接入。 |
| TASK-039 | 分割线渲染 | DEV_DONE | 已补齐 `thematicBreak` block map、`---` / `+++` 分割线解析、非激活态横线渲染与源码态恢复，并覆盖 CRLF 边界回归。 |
| TASK-038 | 跨平台打包 | DEV_IN_PROGRESS | 已接入基于 `electron-builder` 的 Windows 本地 `package:win` / `release:win` 与 macOS 本地 `package:mac` / `release:mac` / `release:mac:beta` 入口，并在打包前按需从 `assets/branding/fishmark_mark.svg` 生成 `light` / `dark` 两套应用 PNG 与 Windows `icon.ico`；同时新增 `assets/branding/fishmark_file_icon.svg` 作为 Markdown 文件图标源，生成 `build/icons/file/markdown.ico` / `markdown.icns`，并在 Windows 与 macOS `.md` / `.markdown` 文件关联中指向 `icons/file/markdown`；Windows release 继续产出 NSIS installer 与 `latest.yml`，正式 macOS release 现已具备 arm64 `.dmg` / `.zip` / `latest-mac.yml` 构建与 GitHub Release 上传脚本，且会在发布前强制校验 Developer ID Application 签名材料与 Apple notarization 凭据；beta macOS release 可在无 Apple 凭据时发布 ad-hoc signed、未公证的 arm64 `.dmg` 到 `v<version>-mac-beta` prerelease，不接入自动更新也不标记 latest。 |
| TASK-041 | 默认 Markdown 切换型快捷键 | DEV_DONE | 已在 `packages/editor-core/src/commands/` 落地三层语义切换器（`semantic-context` / `semantic-edits` / `toggle-*-commands`），并在 markdown extension keymap 中接入 `Cmd/Ctrl+B`、`Cmd/Ctrl+I`、`Cmd/Ctrl+1..4`、`Shift+Cmd/Ctrl+7`、`Shift+Cmd/Ctrl+9`、`Alt+Shift+Cmd/Ctrl+C`；命令级、扩展级与 renderer 回归测试均覆盖到位，对应 IME composition guard、autosave、active block 与 inactive block decorations 未回归。 |
| TASK-043 | 标签页工作区 | ACCEPTED | 已完成 `main` 持有的 workspace snapshot / tab IPC、renderer 标签栏与活动编辑器主链、多标签新建 / 打开 / 切换 / 关闭、`Open...` / 拖入 / 外部打开默认进标签流、标签排序 / 拖出成新窗口，以及 `tabId` 维度的保存 / 另存为 / autosave / 外部文件 watcher / 关闭确认；本轮验收命令已全部通过。 |
| TASK-045 | 脚注语法 | DEV_DONE | 已在 `markdown-engine` 建立 parser-owned footnote definition map 与 inline reference AST，并同步 editor-core inactive / active 源码恢复、TASK-060 source mode gate、HTML export footnotes/backlinks、duplicate / undefined / malformed 源码回退和 parser / decoration / renderer / export 回归测试。 |
| TASK-046 | 数学公式语法 | DEV_DONE | 已接入 parser-owned inline / block math AST、KaTeX lazy preview、source-mode gate、HTML export `renderToString`、歧义 / 坏公式回退、性能预算与回归测试。 |
| TASK-047 | 提示容器与 admonition 语法 | TODO | 参考 `markdown-it-container` / admonition 类插件，支持白名单提示块，并保持 active 源码态与 export 语义一致。 |
| TASK-048 | 定义列表与缩写语法 | TODO | 参考 `markdown-it-deflist` / `markdown-it-abbr`，支持术语列表、缩写 definition map 与 HTML 语义输出。 |
| TASK-049 | 行内扩展标记 | TODO | 参考 `markdown-it-sub`、`markdown-it-sup`、`markdown-it-ins`、`markdown-it-mark`、`markdown-it-emoji`，扩展现有 inline AST / decoration 管线。 |
| TASK-050 | 导出 HTML 标题锚点与目录 | TODO | 参考 `markdown-it-anchor` / TOC 类插件，在 HTML export 中生成稳定 heading id 与可选目录，不改变编辑器正文显示。 |
| TASK-051 | Mermaid / diagram code fence 渲染 | DEV_DONE | 已接入 `mermaid` fence 非激活态 SVG 预览、active/source mode 源码恢复、strict security lazy renderer、HTML export 无脚本源码 fallback、bundle budget gate 与 Electron 截图探针。 |
| TASK-053 | Typora oracle 与 FishMark baseline | DEV_DONE | 已将 Typora-like editing alignment 拆入 `MVP_BACKLOG.md`，建立 oracle artifact 协议、首批 case matrix 与 baseline report；已用 Typora 1.13.4 Windows 自动捕获 12 个空文档/段落/标题/结构导航 oracle case，并将 4 个 GUI 光标定位不可靠 whitespace / structural case 记录为 blocked；第二实现 worker 已复核这些 blocked case 的 matrix offset、sentinel 保存结果、截图与 scratch 证据，现有证据仍不足以升级为 captured；FishMark probe 已支持首批 `caseId` 与 `oracle-captured` group 运行，当前 baseline 为 10 pass / 2 fail（`heading-end-repeated-enter`、`structural-blank-arrow-down`）；本任务不改编辑行为，也不宣称 Typora-like alignment 已完成。 |
| TASK-054 | 物理编辑行模型 | DEV_DONE | 已在 `editor-core` 中引入 `PhysicalEditingDocument` / `EditingLine` 与 semantic line map，`createEditorDerivedState` 暴露 `editingDocument` / `activeLine`，并移除 parser-first whitespace fake block 方向；目标单测、typecheck、lint、build 与 scoped diff check 均通过。 |
| TASK-055 | 基于物理行的编辑表面 decoration | DEV_DONE | 已用 `PhysicalEditingDocument` 驱动 CodeMirror line decorations，输出稳定 `cm-fm-line-*` class；active empty / whitespace line 保持可见、`pre-wrap` 与可测 caret 几何，inactive structural separator 仍按旧 `cm-inactive-blank-line` 折叠且 active line 优先；目标 editor-core 测试、focused renderer CSS/DOM 测试、三个 editing-experience probes、typecheck、lint、build 均通过。TASK-055 交付时记录的 out-of-scope ordered-list Backspace 失败已由 TASK-056 修复。 |
| TASK-056 | Enter / Backspace line-first 路由 | DEV_DONE | 已把普通 Enter / Backspace 收敛到 physical-line first routing：Enter 保持 table / code fence / list / blockquote / thematic break / heading 语义优先，随后用物理行 paragraph fallback 覆盖 empty / whitespace / unparsed lines；Backspace 先处理 selection/native deletion、whitespace-only 行内单字符删除、ordered-list content-start detach、语义 marker、trailing empty block 与 structural separator。已修复 ordered-list content-start Backspace 回归与 heading repeated Enter oracle；目标 editor-core、renderer、10 个 editing-experience probes、typecheck、lint、build 均通过。 |
| TASK-057 | selection normalization 边界拆分 | DEV_DONE | 已拆分 hidden marker 与 structural navigation selection normalization：printable / composition input 不再触发 structural blank 选择移动，ArrowDown 跨 collapsed structural blank 会按可见列落到下一段末尾；目标 editor-core、renderer、6 个 editing-experience probes、typecheck、lint、build 均通过。 |
| TASK-058 | Typora-like alignment gate | DEV_DONE | 已运行 `oracle-captured` FishMark probe 并发布 Phase 1 alignment gate report：12 个 captured TASK-053 oracle rows 全部 PASS，4 个 blocked whitespace / structural rows 保持 blocked / not scored；editor-core、renderer、typecheck、lint、build 均通过。 |
| TASK-059 | 剪贴板图片临时目录 | DEV_DONE | 已保留已保存文档写入同级 `assets/` 的相对路径行为；未保存文档粘贴图片会写入 `images.temporaryDirectory` 或默认 `<userData>/temp/clipboard-images`，并插入绝对路径 Markdown。设置页 File > 图片 支持选择目录和恢复默认；renderer 粘贴处理支持 DOM 无图片项但无文本 payload 时 fallback 到 main clipboard image import；focused tests、全量 Vitest、typecheck、lint、build 均通过。 |
| TASK-060 | 整篇源码模式 | DEV_DONE | 已在同一 CodeMirror 文档上加入窗口级 `wysiwym` / `source` view mode；状态栏 `</>` 可切换源码模式，source mode 通过 editor-core gate 禁用 Markdown preview decorations / widgets、隐藏 marker selection normalization 和 block pointer interactions，不重建 `EditorState`，不触发 onChange / autosave。focused editor-core / renderer tests、全量 Vitest、typecheck、lint、build 与 diff check 均通过。 |
| TASK-061 | 引用块内部 block 渲染与结构空行 | DEV_DONE | 已为 blockquote 增加 parser-owned `innerBlocks`，引用内 paragraph / list / code fence / block math / Mermaid 复用外部渲染与 export 语义；非空引用行 Enter 生成 `\n>\n> ` 引用内结构空行加新 block，空嵌套引用行 Enter 先逐级退出到父引用层级，顶级空引用行 Enter 才退出引用块；引用内列表 Enter / Backspace / Tab / Shift+Tab 复用外部列表语义，空顶级列表项 Enter 生成引用内结构空行再进入引用正文，Backspace 删除 marker、清理子项缩进和有序列表 content-start 断开都保留 quote 前缀；active 行只让当前引用内列表项回源码态，父项和兄弟项继续保持 inactive list marker；blockquote 基础视觉通过 Typora export visual probe 对齐透明背景、4px rail、15px padding、无圆角和无 inset shadow。 |
| M6 | Editor Foundation 收尾（RF-701 / RF-602 / RF-603 / RF-604） | ACCEPTED | 2026-09-20 owner 明确认可全部验收后收口，提交 `4a66136` 已推送 main。canonical 快照成为唯一显示数据源（RF-701）；遗留解析路径与物理行几何归一、引用分隔符/装饰路由/语义行角色脱离富投影、outline 与兼容投影 canonical 化 + id 契约重写（RF-602 尾项）；异步 widget 生命周期与测量加固（RF-603 步 A，含一处真实潜在缺陷消除）；`packages/editor-core/` 硬删除，生产 renderer 只经 `@fishmark/codemirror-adapter`(+`@fishmark/editor-model`) 公开 API，guard 由 57 条例外清零至 `exceptions: []`（7 包 / 13 规则 / 234 测试全绿）。 |
| M6.5 | 外壳布局不变性 + VS Code 式侧栏（S1–S4） | ACCEPTED | 2026-09-20 owner 明确认可后收口，提交 `4a66136` 已推送 main。固定 measure（左右留白吸收差值）+ 常驻窄 rail + 单一共享侧栏区域（搜索与 outline 为两个 view container，rail 图标切换，一块区域一份宽度）+ 拖拽调宽写全局偏好（拖动只改 CSS 变量、pointerup 落盘一次、收起不写 0、加载 clamp 不回写）；owner 契约：模式切换零位移、任何状态不重排，面板开合的 132px 画布内居中平移经 owner 决策接受，窄舞台（< 768px）由 measure clamp 触发的重排作为文档化阈值报告。实测四组合文本列 720.50px、渲染行 31、文档高 1656.28 全等，跨组合差由 340px/16 行/493px 高归零。 |

### 2026-09-19 RF701 开始（M6 必要前置）
用户最新明确完成 M6 即可。M5 生产节点 133679d、文档节点 6464487 已推送 main；2671 tests、build/lint/typecheck、正式行为和 editing 通过，包体积仍 pending。当前唯一实现任务 RF701：SubAgent 分别负责 engine 显示元数据、纯 render plan、真实编辑器消费者；父负责边界与独立生产合同验收。不扩展后续 M7/M8/M9 功能。

### 2026-09-19 RF701 嵌套渲染修复与快照消费者迁移
恢复时工作区 typecheck 是红的（renderer 配置 39 错）：`active-block` / `table-cursor-state` 已切 canonical snapshot，但 10 个测试文件与 `editor-derived-state.ts`、`code-editor.ts` 仍在用已删除的旧 helper 与 4 参 `deriveTableCursorState`。本轮完成：快照消费者迁移（含删除 `block-map-cache.ts`、`projectSnapshotMarkdownDocument` 单 revision 投影、初始空文档不再解析空串）；修复 `deriveTableCursorState` 偏移空间导致引用内表格 cursor/context 失效；复现并修复逐行 clip 丢零宽 widget 与跨软换行 replace 重复；容器行盒归属（嵌套段落不再覆盖容器行高）与嵌套 heading marker 隐藏/active 行类。typecheck 通过、变更文件 lint 干净；全量 vitest 2686 passed / 1 skipped / 14 failed，其中仅 1 条为本次引入并已改为诚实断言，其余为 engine 漂移等预存失败；`fixtures/performance/editor-foundation-current-baseline.json` 冻结 M5 基线出现漂移（open 计数器由真实调用变化、edit invalidatedNodes 由 engine 节点数变化），需父决定是否重生成。详见 `docs/plans/2026-09-19-rf-701-nested-rendering-handoff.md`。未提交、未推送，M6 仍未完成。

### 2026-09-19 RF602 遗留解析路径清理（同轮追加 1）
承接 RF701 切片继续推进 RF602：删除装饰层 source-scan 定义索引兜底（`collectReferenceDefinitionsWhenMissing` 一并移除，索引只来自 canonical 投影）、删除 source-keyed `derived-state/markdown-document-cache.ts`（三处查询改走 `projectSnapshotMarkdownDocument(readEditorStructureCache(state).tree)`）、删除扩展上已死的 `parseMarkdownDocument` 与从未被调用的 `parseOrderedListNormalizationBlockMap` 两个解析入口（同步 code-editor 与 performance probe），并把依赖注入 parser spy 的三条 extension 用例改写为观察真实 `editorStructureObserver`。typecheck 通过、lint 干净、目标套件 123 通过；全量 vitest 2688 passed / 1 skipped / 13 failed（11 条 engine/metrics 预存失败 + 1 条冻结 baseline 漂移 + 1 条并行负载下 probe 超时，单独复跑通过）。RF602 紧接着的余项（物理行重复重建）见下一节。

### 2026-09-19 RF602 物理行几何归一（同轮追加 2）
`editor-core/physical-editing-document.ts` 改为直接映射 editor-model canonical `PhysicalEditingDocument.lines`（`createPhysicalEditingDocument(canonicalDocument, markdownDocument?)`），删除约 80 行重复的源码切分/CRLF 裁剪/行索引重建；`createStructuralLineModel` 与 `normalizeStructuralBlankSelectionAnchor` 改为接收 snapshot，`line-block-adapter` 与 block-decorations 兜底路径都从 `snapshot.document` 取行；`createEditorDerivedState` 的几何缓存按 canonical document 复用并去掉每事务多余的一次 `newDoc.toString()`。typecheck 通过、lint 0 error、目标套件 143 通过、生产 code-editor 271/273（仅预存 bare-marker 2 条）、全量 2688 passed / 13 failed 且失败集合与上轮一致（无新增）。RF602 余项为语义角色与装饰路由仍依赖富投影。

### 2026-09-19 RF603 异步 widget 生命周期与测量（同轮追加 3）
新增 `packages/editor-core/src/decorations/widget-lifecycle.ts`（`isWidgetMounted` / `requestMountedWidgetMeasurement` / `completeMountedWidget`，目标为结构类型，不新增 editor-core 的 `@codemirror/view` 依赖，架构 guard 的 CodeMirror debt 保持 57 条）。修复审计指出的实际缺陷：KaTeX / Mermaid 预览的异步完成（成功与 fallback）与图片预览 `load` / `error` 此前既不校验容器是否仍在 view DOM 内、也从不请求重新测量，导致异步内容改变高度后 CodeMirror 高度表与滚动锚点停留在渲染前尺寸，已移除的 widget 仍会继续写入；现在统一为"确认挂载 → 写入 → `view.requestMeasure()`"。新增 `widget-lifecycle.test.ts` 8 条合同（挂载判定、丢弃不写入不测量、KaTeX/Mermaid 成功与 fallback、图片 decode）。验证：typecheck 通过、lint 干净、decorations 88 通过、生产 code-editor 291/293（仅预存 bare-marker 2 条）、architecture guard 242 通过、全量 2696 passed / 1 skipped / 13 failed（失败集合与前两轮一致，无新增）。RF603 余项：widget/交互适配器仍消费富投影 DTO、表格陈旧回调加固、异步加载滚动锚点需 Electron 几何探针。

### 2026-09-19 RF602 语义行角色移出富投影（同轮追加 4）
新增 `packages/editor-core/src/canonical-semantic-lines.ts`：`createCanonicalSemanticLineRoles(lines, snapshot)` 只读 canonical tree 解析全部 16 种语义角色；`SemanticLineRole` 迁入该模块并由 `physical-editing-document` 重导出。切换前先做差分等价证明（42 份手写文档 + 2 个生成 fixture，逐行对比 46/46 完全一致），之后才删除投影实现；永久测试为同语料冻结金表 + 生成 fixture 的逐行不变量。`createPhysicalEditingDocument(canonicalDocument, snapshot)` 不再接收 `MarkdownDocument`，`SemanticLine` 去掉 `block` 字段，删除约 145 行投影派生逻辑；调用方（derived-state / block-decorations 兜底 / structural-line-model / line-visibility）与测试同步。验证：typecheck 通过、lint 干净、editor-core 25 文件 284 测试全绿（含新增 45 条）、全量 2740 passed / 1 skipped / 13 failed（失败集合与前几轮一致，无新增）。仍依赖富投影的后续片：structural-line-model 导航分隔符、block-decorations 装饰路由与签名、interactions/commands 的投影 DTO。

### 2026-09-19 RF602 引用分隔符与导航脱离富投影（同轮追加 5）
`blockquote-structural-separators.ts` 重写为 canonical（`findCanonicalBlockquoteStructuralSeparatorAt` / `findCanonicalPreviousBlockquoteStructuralSeparator`，只读模型物理行的 quote-marker 段与 blockquote 节点 children），删除投影实现；差分先行使 22 份引用语料逐 anchor 与旧实现完全一致（期间精确复刻两处偏移空间差异：引用内非段落/标题 block 用整行范围、投影行 endOffset 停在换行前保留 CR），之后才切换并把测试改为冻结金表。`createStructuralLineModel(snapshot)` 不再接收 `MarkdownDocument`，引用空行判定改用模型段落，body 分隔符改用 tree root children；`normalizeStructuralBlankSelectionAnchor(snapshot, anchor, direction)` 与 line-block-adapter 同步。至此 physical-editing-document / canonical-semantic-lines / structural-line-model / blockquote-structural-separators / line-visibility 均不再引用富投影。验证：typecheck 通过、lint 干净、editor-core 26 文件 307 测试全绿、生产 code-editor 271/273（仅预存 2 条）、全量 2764 passed / 1 skipped / 13 failed（失败集合与前几轮一致，无新增）。

### 2026-09-19 RF602 装饰路由与签名脱离富投影（同轮追加 6）
`createBlockDecorations` 顶层遍历改为 canonical root nodes（容器走 canonical 容器路径并删除 "Missing canonical container" 反查分支，叶子经 `canonicalLeafView` DTO 进入 widget/preview 分支）；新增 `createCanonicalContainerSignature`（`kind:node.id:start:end`，node.id 为整棵子树源码指纹，因此嵌套 inline 编辑仍会使缓存失效）；`ActiveBlockState` 新增 `activeRootNodeId`，装饰上下文的 `activeBlockId` 与 scoped-selection 的受影响块都改用 canonical 根节点；active 三分支（引用/围栏/列表）与定义索引改读 canonical tree。至此 `block-decorations.ts` 不再引用 `blockMap`/`activeBlock`。验证：typecheck 通过、lint 干净、editor-core 全绿、生产 code-editor 271/273（仅预存 2 条）、全量 2764 passed / 1 skipped / 13 failed（无新增）。Electron 编辑体验探针：单 case 机制验证通过（`blockquote-structural-separator-navigation` → pass），完整矩阵 79 个 case/step 中 5 条失败，全部是 bare `-`/`1.` 现在提交为列表的引擎族（与 parse-block-map 预存失败同根因），blockquote/结构空行/嵌套渲染/装饰/导航相关 case 全部通过；日志 `.artifacts/probe-editing-experience-full.log`。

### 2026-09-19 容器内代码围栏标记行可见性修复（同轮追加 8）
由 test:editor-behavior oracle 矩阵定位：29 条 unexpected-mismatch 全部是引用/列表内代码围栏标记行 visibility=collapsed（oracle 期望 visible），根因是 .cm-inactive-code-block-fence{display:none} 被应用于容器内围栏行。appendCodeFenceDecorations 新增 concealFenceLines（根级行为不变），容器路径保持围栏标记行可见。证据：oracle unexpected 29 → 5（verified-runner 2338 → 2362）；blockquote-typora-visual 仍 pass；编辑体验探针 blockquote 组 16 case 全 pass；全量单测 2766 passed / 1 skipped / 12 failed（无新增）。剩余 5 条：列表内引用空行折叠 1 条 + matrix-arrowup-path-{3,6,8,9} 重复 ArrowUp 落点 4 条。

### 2026-09-19 探针驱动的嵌套渲染修复与全量探针体检（同轮追加 7）
发现并修复真实缺陷：`cm-math-preview-blockquote` 类此前只存在于 CSS（`markdown-render.css:230`），无任何代码添加，导致引用内块级公式渲染成独立蓝色圆角面板；blockMath 分支现按 `containerContext` 传入该类，新增合同测试断言引用内带该类、根级不带，`npm run test:blockquote-typora-visual` 由 3 条失败转为 pass。探针体检：blockquote-typora-visual（修复后）pass、mermaid-footnote-render pass、table-layout pass、empty-document-layout pass；editing-experience 79 个 case/step 中 5 条失败（bare list marker 引擎族）；editor-behavior oracle 矩阵 2541 targets 中 29 条 unexpected-mismatch，全部是引用/列表内**代码围栏标记行 visibility=collapsed**（`.cm-inactive-code-block-fence{display:none}` 自 HEAD 未改，由父/运行时 agent 的 canonical 容器叶子路径应用，非本次切片引入，需父决定改 CSS 还是改装饰策略）；table-focus-scroll 失败 "Missing active table cell during navigation"，一次性 jsdom 复现显示表内导航与 data-active 标记正确、仅越界行退出表格，探针为 48 行表 8 步仍在表内，故属 Electron 布局/滚动层面待查项（复现文件已删除）。typecheck 通过、lint 0 error、全量 2764 passed / 1 skipped / 14 failed（11 条 engine/metrics 预存 + baseline 漂移 + 本轮负载抖动 app.autosave/architecture，隔离复跑通过）。

### 2026-09-19 M6 收尾：owner 决策 A（oracle 冻结记账重录）
静止树独占复跑先把范围从 5 条缩到 4 条：`matrix-enter-path-1:repeat:physical-geometry` 在干净运行下是 `known-defect-observed`（`known-defect=95 / unexpected=4`），此前记的第 5 条来自并发探针污染（同一证据链里那次 15-unexpected 的运行）。剩余 4 条 `matrix-arrowup-path-{3,6,8,9}:repeat:selection` 经三方证据核对是**会话内真实行为变化而非纯记账过期**：历史 fixture 值是 `{2,2}`（嵌套 marker 前缀内的偏移），实际是 `{4,4}/{4,4}/{4,4}/{6,6}`（首个可见内容字符）；兄弟用例 `path-2/path-4` 今天仍落在 `{2,2}`，所以 `{2,2}` 在当前构建中可达，不是"不可达的过期池值"。成因是 RF-602 canonical 前缀归一让"文档顶部 ArrowUp 退化到行首"后的 normalizer 从停在 marker 前缀内部推进到内容起点；manifest 期望契约（`{9,9}`/`{11,11}`）未变，因此 4 条仍是真实保留缺陷（不是修复，也不是放宽豁免）。owner 决定落盘位置：`fixtures/editor-behavior/current-observations.ts`（RF-001 不可变历史记录，文档明确"不得从当前失败回录历史基线"）保持 byte-identical，重录改以 `active-calibration.ts` 的显式列表 `editorBehaviorReObservedKnownDefects` 表达（4 条，逐 target 写明被取代的历史值、未变的期望契约、成因与干净运行 provenance）；保留集仍精确 107、其中 103 条与历史对象 `toBe` 恒等，另加 fail-closed 不变量（重复/非保留/缺失/未生效一律抛错），`calibrationHash` 由 `fnv1a32-12fd6881` → `fnv1a32-ec70a8b9`（用仓库自身 `createCalibrationHash` 计算，并用同路径对 107 条历史对象复现出旧 hash 作正确性证明；manifestHash/contractHash/runId 未改）。protocol 测试的"与历史恒等"断言改写为"103 条恒等 + 4 条显式重录"，严格更强且未删覆盖。**验收：独占静止树 oracle 由 `unexpected 5` 转为 `unexpected=0 / known-defect=99 / not-run=0`、exit 0**（报告 `.artifacts/editor-behavior/decision-a-verify.json`）。

### 2026-09-19 M6 收尾：owner 决策 B（重新生成冻结性能基线）
按 owner 授权重生成 `fixtures/performance/editor-foundation-current-baseline.json`，与旧基线相比**只有 4 个计数值变化**：`open.fullParse 4→2`、`open.parserEntries.parseMarkdownDocument 1→0`（正是 M6 审计要求的"计数器必须反映真实 parse"：不再在扩展构造时解析空串），以及 `edit` / `orderedListEdit` 的 `invalidatedNodes 19501→20501`（在飞 canonical parse 的节点重建数，`fullParse`/`cacheHit`/`incrementalParseWindow` 均不变）；文件其余部分字节不变，未手改任何数值。生成方式为一次性 vitest 写入器（跑完即删）走与契约测试完全相同的测量路径。**结果：`src/renderer/performance/editor-foundation-baseline.test.ts` 由 1 条失败转为 14/14 通过。**

### 2026-09-19 RF-604 Phase A / A2：性能计数契约迁入 adapter
`INCREMENTAL_STRUCTURE_CACHE_REASON`、`type EditorPerformanceCounters`、`type EditorPerformanceParserEntries` 三个声明从 `packages/editor-core/src/performance/editor-performance-probe.ts` 迁入新模块 `packages/codemirror-adapter/src/performance-counters.ts`（**零 import**，不引入任何 `@codemirror/*`，因此 guard 的 `boundary.editor-core` 例外集保持 57 条不变）。计数器契约归 adapter 的理由是它由 adapter 拥有的 canonical structure cache/observer 派生。`measureEditorPerformanceProbe` 与其余 probe 类型仍留在 editor-core（Phase B5 再迁）；两个 renderer 消费者（`document-derived-ui.ts`、`editor-foundation-performance-report.ts`）改从 adapter 取这三个声明，`editor-core/src/index.ts` 直接从 adapter 重导出以保持公共面字节不变（未引入死的值导入，`noUnusedLocals` 下无 TS6133）。验证：`tsc -p tsconfig.renderer.json` 除一个在飞外来文件的 TS6133 外零诊断、`tsc -p tsconfig.vitest.json` 零诊断、architecture guard **234/234 绿**、guard fixture 未被本切片改动。

### 2026-09-19 M6 收尾：RF-604 Phase A / A3-A5 命令包装器与快捷组迁入 adapter
`editor-view-mode.ts` + `commands/{table-commands,table-context,list-commands,toggle-block-commands,toggle-inline-commands}.ts` + `context/block-tree.ts` + `extensions/markdown-shortcuts.ts` 及其 7 个测试文件，共 **15 个文件**迁入 `packages/codemirror-adapter/src/`，同步删除 **19 条** `boundary.editor-core` 的 `@codemirror` 例外（57 → 55 → 50 → 41 → **38**，四步每步精确命中目标）。全部为纯搬迁：adapter 内部一律用相对兄弟导入（`./semantic-keypress`、`./block-tree`、`./table-commands` 等），**零包内自引用**（规避自引用循环与 `markdown-shortcuts.ts` 顶层快捷表 const 的加载顺序风险）；`@fishmark/editor-core` 公共导出面不变、`src/**` 零改动。两处经父仲裁的细节：① `table-commands.test.ts` 里唯一覆盖 `runMarkdownTab` 的调用改写为语义等价的 `runSemanticCommand(view, planSemanticTab)`（该 wrapper 无任何生产调用者、仅两处 re-export，是丢弃 state 的 2 行转发，故零行为差异；不新建测试文件、不新增例外）；② `markdown-shortcuts.ts` 原本依赖 `../commands` 的 table/toggle 包装器，所以必须把三组包装器与 shortcuts 同批迁出才算"纯搬迁"（原计划的 A5 单独迁移不可行）。`codemirror-markdown-commands.ts` 因依赖 `interactions/**`（Phase B1）刻意留在 editor-core。

**父独立验收**（全部在 A3-A5 落定后的静止树上）：`npm run typecheck` exit 0（含两个 workspace 构建与 renderer/electron/vitest/cli 四套配置）；`npm run lint` 0 error / 8 warning（均为未触碰的 `src/renderer/editor/*` 既有 react-hooks warning）；architecture guard **234/234**（38 条例外，即"声明集合 == 扫描集合"成立）；adapter + editor-core **31 文件 / 362 测试**全绿，且搬迁前后文件数/用例总数不变（无覆盖丢失）；全量 vitest **2769 passed / 1 skipped / 11 failed**，失败恰为已知预存 3 文件 11 条（`parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2，bare-marker 引擎漂移同族）——**决策 B 修掉的冻结基线漂移已消失、无新增失败**。

**Electron 验收批（独占、串行、无并发探针）**：oracle `unexpected-mismatch=0 / known-defect-observed=99 / not-run=0`、exit 0；`test:blockquote-typora-visual` pass；`test:mermaid-footnote-render` pass；`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` 全部 exit 0；`test:editing-experience` 失败恰为已记录的 5 条 bare-marker 族（无新增，说明迁出的 keymap/shortcuts 未破坏编辑体验）。

**包体积预算仍 FAIL**（本会话实测；Phase C 删包/工厂切换后需重测）：`maxInitialChunkBytes` 344027/300000、`maxInitialChunkGzipBytes` 92194/90000、`totalInitialGzipBytes` 267009/260000、`totalJsGzipBytes` 1436858/1430000；所有 `forbiddenInitialSourceGroup` 与 `requiredLazyChunk` 检查 PASS。最大的 source group 仍是 `@codemirror/view`(485932) 与 `editor-core`(279599)，因此真正影响初始包体积的收口点在 Phase B/C（删包 + renderer 工厂切换），不在 Phase A 的搬迁本身。

### 2026-09-19 M6 收尾：`test:table-focus-scroll` 由红转绿（探针环境归一化，产品零改动）
根因：`show:false` 的 Electron 窗口永不成为聚焦页 → 浏览器不投递 `focusin` → `runtime.hasEditorFocus` 恒假 → `packages/editor-core/src/decorations/block-decorations.ts:150-156` 的 selection-scoped 装饰快路径在 `!hasEditorFocus` 时返回 `didUpdateDecorations:false`、`extensions/markdown.ts:683-694` 只记录签名不派发 → 表格 widget 一直保留构建时的 `activePosition:null`、`data-active` 永不出现；而该探针在未聚焦窗口下的 `:focus` 选择器同样永不匹配，于是第 0 步（点击后、任何 ArrowDown 前）即报 "Missing active table cell"。引入者为 `75e1f3c`（2026-05-16 性能优化），不是本次在飞的 RF-602 canonical 迁移。修法按其余 5 个同类 `show:false` 探针的既有约定补发合成 `focusin`（`editorRoot.dispatchEvent(new FocusEvent("focusin",{bubbles:true}))`），并把失败诊断增强为"CM selection + 派生 table cursor + widget start offsets + 合成 focusin 一次性恢复判定 + 真实 cell id（原先 `cell.dataset.tableCell` 恒为 undefined）"+ 10 帧有界重试。**产品代码零改动**；父复跑 `test:table-focus-scroll` exit 0（9 个采样、30:0→38:0，active cell 始终在 `.cm-scroller` 视口内，window/document/body 滚动保持 0）。潜在缺口（未聚焦期间 selection-only 事务不重建装饰）已在交接文档记录两种候选修法与影响面，留待 owner 决定，本会话不擅改。

### 2026-09-20 RF-604 Phase C1a：纯语义行层迁出 editor-core → editor-model
`canonical-semantic-lines`、`structural-line-model`、`blockquote-structural-separators`、`line-visibility`、`hidden-markers`、`source-utils`、`list-utils`、`structural-blank-lines`、`decorations/block-lines`、`commands/line-parsers`、语义行层 `physical-editing-document`（迁入时改名 `semantic-editing-document`：`createPhysicalEditingDocument` → `createSemanticEditingDocument`、类型 `PhysicalEditingDocument` → `SemanticEditingDocument`，因为 `editor-model` 已有同名的 canonical 模型与同名函数，直接搬会造成重复导出），加上各自的测试与 `performance/long-document-fixtures`，共 **20 个文件**迁入 `packages/editor-model/src/{semantic-lines,performance}/`；editor-core 原件全部删除。12 个 editor-core 消费者改指 `@fishmark/editor-model`；`editor-core/src/index.ts` 用 `export { createSemanticEditingDocument as createPhysicalEditingDocument, ... }` 保持公共符号表逐字不变（并记录：这两个别名在仓库内**已无任何消费者**，最终删包切片可直接丢弃）。**本切片不触碰 guard fixture**——这些文件本就不含 `@codemirror`，例外围保持 38，证明"纯语义迁移可以完全不动架构债账本"。父复核：`tsc -p tsconfig.renderer.json` / `-p tsconfig.vitest.json` 零诊断、architecture guard **234/234**、三个包 **52 文件 / 633 测试**全绿（`editor-model` 由 21 文件/271 测试 → 29 文件/373 测试，迁出的 8 个套件 102 条用例随包运行，零覆盖丢失）、`src/renderer/code-editor.test.ts` 仍恰为 2 条既有 bare-marker 失败。动机与顺序：交互层 `interactions/adapters/line-block-adapter.ts`、`code-fence-adapter.ts` 依赖这层纯逻辑（`line-visibility`/`list-utils`/`structural-line-model`/`getInactiveCodeFenceLines`），按 M6 审计"纯物理/源/选区语义归 `editor-model`/`markdown-engine`，**不得为删目录而把纯语义塞进 adapter**"以及 roadmap §4 已把 `physical-lines/physical-editing-document.ts` 放在 `editor-model`，必须先迁它，B1 才能成为纯搬迁。

### 2026-09-20 RF-604 Phase B1 / B2-B3：交互层与装饰层整批迁入 adapter（例外 38 → 8）
**B1（38 → 33）**：`interactions/{index,registry,registry.test,context,types}.ts`、`interactions/adapters/{code-fence,line-block,table}-adapter.ts` 与 `commands/codemirror-markdown-commands.ts` 共 **9 个文件**迁入 `packages/codemirror-adapter/src/`；adapter 内部全部改为相对导入（`./interactions`、`./semantic-keypress`、`../../transaction-adapter`、`../../table-context`），**零包内自引用**；`extensions/markdown.ts:99`、`commands/index.ts` 改指 `@fishmark/codemirror-adapter`；删除 5 条例外。
**B2/B3（33 → 8）**：`decorations/*` 全量 **20 个文件**（含 `block-decorations.ts` 1321 行 + 其 2169 行测试、`code-highlight*`、`image/math/mermaid/footnote/table` widgets、`signature`、`canonical-leaf-view`、`inline-decorations`、`widget-lifecycle`、两个 preview renderer）迁入 `packages/codemirror-adapter/src/decorations/`，`editor-core/src/decorations/` 目录消失；删除 25 条例外。装饰层在 adapter 内仍是唯一实现，**语义计划仍由 `@fishmark/markdown-presentation` 的 `buildRenderPlan` 拥有**（`block-decorations.ts` 持续从它取 plan），符合审计"纯语义计划归 presentation、CM 区间与 active/source gating 归 adapter"。
**一处必须由父仲裁的阻挡（已解决）**：`block-decorations.test.ts` 用 `createRequire("node:module")` 加载 jsdom 做隔离文档，而 `boundary.codemirror-adapter` 禁止 `node:*`（测试文件也受管），迁入后 guard 报 `forbidden-import`。父仲裁选择"改为静态 `import { JSDOM } from "jsdom"` + 新增一个仅含环境类型声明的新文件 `packages/codemirror-adapter/src/jsdom-module.d.ts`"（jsdom 29 不带类型、未装 `@types/jsdom`、`strict` 下会 TS7016；仓库已有手写 shim 先例）。两条 JSDOM 合同的断言逐字保留；未使用 `@ts-expect-error`、未用全局 `require`、未改 tsconfig、未新增 guard 例外。相比"把测试留在即将删除的包里""给目标包加第 9 条例外""放宽 rule 允许 `node:*`""把约 60 条用例整体换测试环境"，这是唯一同时满足"零新增债务 + 零断言损失 + 零抑制"的选项。
**其它同批同步**：`src/main/editor-math-preview-assets.test.ts` 的真实路径读取改指 adapter 下的四个文件（保留两条 `import("./katex-preview-renderer")` / `import("./mermaid-preview-renderer")` 动态 import 断言，未放宽）；adapter index 增加装饰层与交互层公开面，但 **katex/mermaid preview renderer 一律不静态导出**（仅动态 import），`perf:bundle` 的 `forbiddenInitialSourceGroup:katex`/`:mermaid` 仍 **PASS**、且四个体积指标无一变差（344027/300000、92127/90000、266942/260000、1436791/1430000，其中三项比记录基线各小 67 字节）。
**父独立验收**：`tsc` renderer/vitest 零诊断；guard **234/234**（例外读回恰为 8：`extensions/markdown.ts` 3 + `markdown.test.ts` 2 + `performance/editor-performance-probe.ts` 2 + 其测试 1）；三包 **52 文件 / 633 测试**全绿（装饰/交互套件现从 adapter 运行，总数不变）；`src/main/editor-math-preview-assets.test.ts` 2 通过；`src/renderer/code-editor.test.ts` 仍恰为 2 条既有 bare-marker 失败。

### 2026-09-20 RF-604 Phase B4/B5/C2：扩展工厂与性能探针迁入 adapter，并删除 editor-core（M6 硬切换达成）
**B4（例外 8 → 3）**：`extensions/{markdown.ts,markdown.test.ts,index.ts}` 迁入 `packages/codemirror-adapter/src/extensions/`（adapter 内全部相对导入、零自引用），adapter 公开面新增完整扩展工厂（`createFishMarkMarkdownExtensions`、`refreshMarkdownDecorations`、view-mode 全组、shortcut 全组）。**renderer 工厂切换**：`src/renderer/code-editor.ts` 的 `@fishmark/editor-core` 整块 import 改为 `@fishmark/codemirror-adapter`；`editor-behavior-manifest-runner.ts`、`editor-behavior-observer.ts`，以及 `editor/App.tsx`、`WorkspaceShell.tsx`、`code-editor-view.tsx`、`shortcut-hint-overlay.tsx`(+测试)、`WorkspaceShell.test.tsx` 的同类引用一并改指 adapter（全部为 specifier-only，无行为改动）。
**B5（例外 3 → 0）**：`performance/{editor-performance-probe.ts,editor-performance-probe.test.ts}` 迁入 `packages/codemirror-adapter/src/performance/`；`src/renderer/performance/editor-foundation-performance-report.ts` 改指 adapter。
**C2（删包与收口）**：`packages/editor-core/` 整体删除；5 处路径别名（`tsconfig.base/renderer/vitest` + `vite/vitest.config`）移除（`tsconfig.electron/cli` 本就没有）；guard fixture 删除 `editor-core` 包条目与 `boundary.editor-core` 规则，`exceptions` 变为 `[]`（7 包 / 13 规则 / 0 例外）；`boundary.editor-model` 的退役项改为 `@fishmark/codemirror-adapter` / `packages/markdown-engine`（避免规则自禁自身源路径），其余规则里的 `@fishmark/editor-core` → `@fishmark/editor-model`；`src/main/editor-foundation-architecture.test.ts` 的真实路径读取改指新家，合成 fixture 的 `editor-core` 角色由仍存在的 `codemirror-adapter` 承接（每例原意保留，"declared == scanned" 那条改为对空的 declared 集合与真实的 adapter 扫描集合作断言）；`src/main/analyze-renderer-bundle.test.ts` 的 sourcemap 路径同步；`package.json` 的 `test:editor-foundation` 脚本路径由 `packages/editor-core/src/performance` 改为 `packages/codemirror-adapter/src/performance`（否则删包后 ENOENT）。
**一处必须父仲裁的测试改写**：`src/renderer/code-editor-semantic-runtime.test.ts` 原先 `vi.spyOn(adapter, "createSemanticCommandBindings")` 通过公共入口拿私有 adapter；工厂内迁后 spy 不再命中，而 guard 禁止 `src/**` 相对导入包内实现（`boundary.public-package-entries`）。改为两条**真实公共 API** 用例：① 跨身份变更与 `replaceDocument` 后语义命令仍作用于控制器自己的 session；② `destroy()` 释放 session 后 `runSemanticCommand` 返回 false 且文档不变。父核对：被移除的那条内部"preparePlan → stale"断言在 `packages/codemirror-adapter/src/transaction-adapter.test.ts` 有专门用例（`rejects a plan built for a superseded session generation`、`recordEditorDispatch` 跨 rebind 的 stale 判定等），故覆盖不降、销毁路径反而更强。
**父最终验收（M6 硬切换）**：`npm run typecheck`（含两个 workspace 构建与 renderer/electron/vitest/cli 四套配置）**exit 0**；`npm run lint` **0 error / 8 既有 warning**；`npm run build`（clean + renderer + electron + cli + workspace 构建）**exit 0**；architecture guard **234/234**，`boundary.editor-core` 例外 **0**；全量 vitest **2770 passed / 1 skipped / 11 failed**，失败恰为已知预存 3 文件 11 条（`parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2，无新增）；oracle **`unexpected-mismatch=0 / known-defect-observed=99 / not-run=0`**；`test:blockquote-typora-visual`、`test:mermaid-footnote-render` **pass**，`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` **exit 0**；`test:editing-experience` 恰为已记录 **5 条 bare-marker 族**（表格类 case 全 pass）；`perf:bundle` 仍为同样 4 个上限 FAIL（344036/300000、92375/90000、267192/260000、1437041/1430000，与 M6 前基线相比 ≤0.2%），15 个 `forbiddenInitialSourceGroup`（含 katex/mermaid）与 4 个 `requiredLazyChunk` 检查全部 PASS，且**bundle source group 中已无 `editor-core`**；`rg '@fishmark/editor-core|packages/editor-core'`（src/packages/scripts/5 个配置/package.json）只剩一处反向断言与历史字符串。文档同步：根 `README.md` 目录结构、`packages/markdown-engine/README.md`、`packages/workspace-infrastructure/README.md` 里过时的 `editor-core` 声明已更新。
**M6 状态（本会话声明范围）**：RF-604 硬切换达成——`packages/editor-core` 不存在、生产 renderer 只经 `@fishmark/codemirror-adapter`(+`@fishmark/editor-model`) 公开 API、guard 的 editor-core CodeMirror 债务从 57 条清零。**仍未完成、不属本次声明**：RF-602 尾项的富投影 canonical 化（`activeBlock`/`blockMap` 兼容投影与 outline id 契约，M6 审计把 outline 消费者划给 RF-702/703）、RF-603 的陈旧 widget 回调加固与"异步加载期间滚动锚点"几何探针、包体积预算（Phase C 之后仍需单独优化）、M5 最终性能验收与 M7–M10。

### 2026-09-20 M6.5 S2：rail 常驻 + 单一共享侧栏区域（outline 迁入左栏）
**结构**：`.app-rail` 常驻——去掉 `data-visibility`、`.app-rail[data-visibility="collapsed"]`、以及"阅读模式把 rail 列压成 0"的 `.app-layout[reading]{grid-template-columns:0 minmax(0,1fr)}` 和只为它存在的阅读模式 `.app-notification-banner{left:gutter}` 覆盖；`.workspace-shell` 改为 `grid-template-columns: var(--fishmark-side-panel-width) minmax(0,1fr)`（`--fishmark-side-panel-gap` 控制间距、220ms 过渡），`.document-canvas{grid-column:2}`、`.side-panel{grid-column:1}`；共享区域 `aside.side-panel[data-fishmark-region="side-panel"][data-view-container][data-state]` 含 `side-panel-header/-title/-close/-body`。**outline 作为嵌套视图保留旧钩子**（`data-fishmark-region="outline-panel"` + `outline-panel-list/-item/-item-label/-empty`），因此 `fixtures/themes/*/styles/ui.css` 仍能命中；动画与强调镜像到左侧（`transform-origin:left center`、`@keyframes side-panel-enter/-exit`、`::before` 40deg、chevron 左向）。rail 大纲按钮 `data-fishmark-command="outline"`、`aria-pressed` 反映展开态；同图标点击 = 收起。
**状态**：`App.tsx` 以 `activeViewContainer: "search"|"outline"|null` + `closingViewContainer`（退出动画期间保持挂载）取代原 4 个 outline props，暴露 `onToggleViewContainer/onCloseViewContainer`。
**测试**按新设计改写且保留原意：`outline-toggle` 区域 → rail 按钮、CSS 契约改指新名字、"阅读模式折叠 rail" → "rail 与共享面板在阅读模式仍可用（只折叠竖直 chrome）"；`app.autosave.test.ts` 由 S2 在**重读文件后最后编辑**，S1 的 measure 断言完整保留。
**父验收**：`tsc` 两套零诊断；guard **234/234**；全量 `src/renderer` 仅剩已知 3 条失败；lint 0 error / 8 既有 warning。

### 2026-09-20 M6.5 S3：搜索成为第二个 view container + 拖拽调宽 + 全局偏好持久化
**搜索（单一实现）**：删除 `.document-canvas` 中的内联查找/替换 bar，**同一套控件**迁入共享区域作为 `"search"` 视图（`data-fishmark-region="search"`，保留 `find-replace-field/input/row/status/icon-button/text-button` 类与 `find-replace-status` 区域）；rail 搜索按钮与大纲按钮**同契约**（`aria-pressed` 反映展开、`onClick` 切容器）；`Ctrl/Cmd+F` 改为打开该视图并聚焦输入；折叠时先 `clearFindReplaceQuery` 再关容器。**唯一状态源仍是 CodeMirror 的 search state**（`code-editor.ts` 的 `updateFindReplaceQuery/findNextMatch/...` 未动），原 per-tab `findReplaceTabId` 镜像删除（容器身份即身份），因此**不存在第二个搜索入口**。
**拖拽**：`.side-panel-resizer`（`role="separator"`、`aria-orientation/valuemin/valuemax/valuenow`、`tabIndex=0`、右缘 6px、`::before` 扩大命中区、`col-resize`）；拖动中**每帧只改内联 CSS 变量**并 clamp（160 … min(480, 0.6×实测 `.workspace-shell` 宽)）；**pointerup 落盘一次**（测试断言 pointermove 三帧内从不提交）；Esc / `pointercancel` 回原宽且**不写**；方向键 ±16px 立即提交。
**持久化（全局偏好，端到端）**：`UiPreferences.sidePanelWidth: number|null`（默认 `null`）+ 导出 `SIDE_PANEL_WIDTH_MIN=160/MAX=480/DEFAULT=248/MAX_VIEWPORT_FRACTION=0.6` + `clampSidePanelWidth`；`normalizeSidePanelWidth`（非有限/缺失 → null，否则 `clampInteger(160,480)`）；主进程沿用通用 `normalizePreferences/mergePreferences`，**无需改 main、无新 IPC/通道**；渲染层经既有 `preferences.ui.sidePanelWidth` 读取、经既有 `handleUpdatePreferences({ui:{sidePanelWidth}})` 写回。owner 要求的三条语义均实现并有测试：**收起不写 0**（收起时 resizer 卸载、提交路径不可达）、**加载 clamp 只作用于显示**（CSS `min(stored, 60vw)`／≤640px `min(stored, 44vw)`，从不回写；测试：600px 舞台存 460 显示 360，取消拖拽恢复 460）、**一份宽度供 search/outline 共用**，且宽度未变时不重复写。
**顺带修掉** S2 报告的 Ctrl 长按提示浮层与左停面板重叠：`.workspace-canvas:has(> .workspace-shell.is-side-panel-open)` 提供 `--fishmark-hint-column-offset`，浮层 `left` 跟随该变量（`::has` 在 Electron 41 可用）。
**父验收**：`tsc` 两套零诊断；guard **234/234**；`src/shared/preferences.test.ts` + `src/main/preferences-store.test.ts` + `preferences-service.test.ts` **45/45**；全量 `src/renderer` 仅剩已知 3 条失败；lint 0 error / 8 既有 warning。

### 2026-09-20 M6.5 S1：固定 measure（完成，父验收通过）
`base.css` 的 `:root` 新增 `--fishmark-document-measure: 720px` / `--fishmark-document-gutter: 24px`；`editor-source.css` 把 `.cm-content` 的水平内边距改为派生值 `max(var(--fishmark-document-gutter), (100% - var(--fishmark-document-measure)) / 2)`（垂直节奏 `40px … 56px`、`min-height`、字体排版全未动），于是**正文列宽 = `min(measure, 舞台宽 − 2×gutter)`，与 rail/面板几何完全无关**，剩余空间成为对称留白；窄窗由 `@container editor-canvas (max-width: 640px)` 收缩为 `100cqw − 2×gutter`（取代旧的 `@media (max-width: 860px)` 覆盖，并保留其 24px 侧边距语义）。另发现并修掉一个真实缺陷：`.cm-scroller` 的经典滚动条会单侧偷走 10px 内容盒宽度，既让正文档偏心、又让 `clientWidth` 依赖滚动状态 → `scrollbar-gutter: stable both-edges`。
**四组合实测（真实 Electron 探针，窗口 1220×820 / viewport 1204，24 段散文）**：

| 组合 | 改前文本列宽 / 换行行 | 改后 |
|---|---|---|
| editing / 面板关 | 790.56px / 32 | **720.50px / 16** |
| editing / 面板开 | 527.04px / 48 | **720.50px / 16** |
| reading / 面板关 | 867.04px / 32 | **720.50px / 16** |
| reading / 面板开 | 603.04px / 48 | **720.50px / 16** |

改前跨组合差 **340.00px 宽 / 16 个换行行 / 493px 高**；改后 `spread = {textColumnWidth:0, lineCount:0, textLineCount:0, documentHeight:0}`（首行 720.00、`.cm-line` 31、文本行 16、文档高 1656.28 四组全等），两次运行逐字段一致、`pass: true`。**非空洞性**：探针现在实测面板列宽（关闭 0 / 打开 248）并在"打开却未预留列"时失败，因此 invariance 结论不可能是空转。**S2 移除 rail 折叠后，原 −38px 的 rail 塌陷残差归零**（`editingTextStart/EndFromCanvasMinusReading = 0`）。
**探针断言**按新设计改写并各自保留原意：旧的"相对 workspace 原点的文本位移"改为"相对文档画布"（rail 塌陷不再被误判为文本位移）；画布相对的居中判定改为"两侧内边距相等 + 文本列 == clamp 后的 measure"（面板成为画布第一列后，画布盒子不再是居中参照）；新增"无水平溢出""无负内边距"与四项 spread 归零。`app.autosave.test.ts` 那一处 padding 断言按新机制更新（并加 `not.toContain("12vw")`），S2 后续在同一测试块新增的断言与它共存且全绿。
**父验收**：`tsc` 两套零诊断；guard **234/234**；`src/renderer/editor` + `code-editor-view` + `app.autosave` + `editor-source-layout` **21 文件 / 327 测试**；`code-editor.test.ts` 仍仅 2 条已知 bare-marker（另有一次 5s 组合结束超时为负载抖动，复跑通过）；`npm run test:empty-document-layout` **两次 exit 0、`pass: true`、`failures: []`**；lint 0 error / 8 既有 warning。
**S4（已完成，见文末同名小节）**：把"四组合**绝对 X 位置一致**"（owner 原话"不要改变布局"）与"**拖拽后面板宽度变化但正文行数/高度不变**"补成常备断言并复跑。
### 2026-09-20 登记 **M6.5：外壳布局不变性 + VS Code 式侧栏**（与 M6 一起收尾；下述 S1/S2/S3 为本节的执行切片）
**背景（已由代码定位的根因）**：`reading`(聚焦)↔`editing` 自动切换时，正文会**整篇重排**。原因不是 widget 折叠，而是**正文可用宽度被外壳状态决定**：`.app-layout` 是 `grid-template-columns: var(--fishmark-shell-rail-offset) minmax(0,1fr)` 且对 grid-template-columns 做了 transition（`src/renderer/styles/app-ui.css:133-140`），`reading` 模式把它压成 `0 minmax(0,1fr)`；`.workspace-shell` 又是 `minmax(0,1fr) var(--fishmark-outline-column-width)`，`.is-outline-open` 时该列占 `min(248px, 28vw)`（`app-ui.css:872-889`）；而 `.cm-content` 用 `width:100%` + `padding: 40px clamp(64px,12vw,220px) 56px`（`editor-source.css:30-36`）。三者相乘 ⇒ 宽度变化逐帧改换行。附带事实：`shellMode` 的自动切换点位于 `App.tsx`（打开/最近/重载→reading；新建无标题→editing；点进编辑器 `enterEditingMode`→editing；失焦/Escape→reading），切换动画期间编辑器经 seal/release 状态机临时 `readOnly`（`WorkspaceShell.tsx:1006` + `workspace-renderer-application.ts`），**阅读模式本身仍可编辑**。
**owner 已定**：① 正文用**固定 measure**、左右预留空白；② outline 移到**左栏**；③ 左侧保留**独立窄 rail**（参考 VS Code）；④ rail 在**搜索下方**默认加一个 outline 图标，点击从左侧展开 outline panel；⑤ 展开宽度**可拖拽调整**；⑥ **阅读模式下 rail 不折叠**；⑦ 本项记为 **M6.5，与 M6 一起收尾**。
**VS Code 参照（已核源码 `src/vs/workbench/browser/layout.ts`）**：工作台是一张 `SerializableGrid`，部件为 titleBar/banner/activityBar/**sideBar**/panel/auxiliaryBar/editor/statusBar；**资源管理器、源代码管理、扩展复用同一个 `sideBarPartView`**——活动栏图标只切换该区域内的 pane composite（`openViewContainer(ViewContainerLocation.Sidebar, id)`），区域与宽度不变；**隐藏时用 `getViewCachedVisibleSize()` 记住上次可见宽度（`Sizing.Invisible(...)`），再次显示恢复原宽**；宽度是 grid view 的属性，持久化走 `IStorageService` 的 `SerializableGrid` 序列化（即"一块区域一份宽度"，而不是每个面板各存一份）。因此我们的设计取同一模型。
**切片与依赖**：S1 固定 measure（**进行中**，不依赖其余决策）→ S2 outline 移左栏 + rail 图标（单一共享面板区域，为将来多 view container 留位）→ S3 拖拽调宽 + 持久化 → S4 把"四种组合下正文宽度/行数/高度一致"固化为常备探针。S1 的几何证据用真实 Electron 探针（扩展既有 `test:empty-document-layout` harness），断言 `reading/editing × outline 开/关` 四种组合下正文测量一致。

**后续决策（2026-09-20 已定，详见 `docs/decision-log.md`）**：outline **与搜索都进同一个共享侧栏区域**（rail 图标切换 view container，一块区域一份宽度）；面板宽度写**全局偏好**，**拖拽结束落盘一次**（拖动中每帧只改 CSS 变量），收起时缓存宽度不写 0，加载时 clamp 但不回写被压小的值；搜索采用**单一实现**——`Ctrl/Cmd+F` 打开侧栏 Search 视图并删除现有内联查找 bar，与 CM 原生 search query 共用一份状态；状态栏左侧偏移只跟随 rail、不跟随面板。

### 2026-09-20 RF-602 尾项：outline 与兼容投影 canonical 化（owner 决策：id 契约在本切片内一并重写）
三段式推进，每段独立验收：**1a** outline canonical + id 契约；**1b** 交互/表格层 canonical；**1c** 删除兼容投影。
**新契约**：`EditorOutlineHeading.id` 与渲染层 `OutlineItem.id` 都改为 **canonical node id**（`node.id`），两侧同源；`ActiveBlockState` 新增 `activeHeadingId`（根级 heading 的 canonical id，非 heading 一律 null）与 `activeKind`（canonical 根节点 kind），`App.tsx` 直接消费 `activeHeadingId`，测试里对 `activeBlock.type` 的观察改用 `activeKind`。
**关键发现（父未预期，子代理先测量后实施）**：渲染层大纲面板**并不消费** `EditorDerivedState.outlineHeadings`，而是在 `src/renderer/outline.ts` 自己用 legacy `parseMarkdownDocument` 派生条目与 id——今天"当前标题"高亮能用，只是因为两侧恰好都在用投影 id。因此 id 契约重写必须同步把 `deriveOutlineItems` 切到 canonical tree（`parseFullDocumentTree` + `childrenOf(root)` + `isMarkdownLeafNode`，`id = node.id`），label/depth/startOffset/startLine 与顺序逐字不变。子代理先提出"在 renderer 里用 `createNodeIdForSource({path:[i],…})` 重建 canonical id"的过渡方案，父否掉：那等于把引擎的 id 哈希公式复制到渲染层，引擎改公式时两边会静默失调；id 必须**从真实 canonical 节点读**。
**一处冻结证据取舍（经 owner 明确授权，仅改一个字段）**：outline 切 canonical 后不再调用 legacy 入口，所以 `fixtures/performance/editor-foundation-current-baseline.json` 的 `outline.parserEntries.parseMarkdownDocument: 1 → 0`（`counters.fullParse` 仍为 2，另外五个操作与其余全部字段逐字不变）；`document-derived-ui.perf.test.ts` 同步期望值并加强为"outline+metrics 合计恰 1 次 legacy 调用、metrics.fullParse = outline.fullParse + 1"；`editor-foundation-baseline.test.ts` 仍通过，等于证明该文件与实测逐字段一致。
**1b**：`TableCursorState` 新增 `tableNodeId`；`table-context.findActiveTableBlock(activeState)` 用 `snapshot.nodeById(tableNodeId)` + `canonicalLeafView` 构造同形表格 DTO（widget/命令侧的 DTO 形状未变）；交互上下文 `document` → `snapshot`，`lineBlock`/`activeBlock` 改为 canonical **根级**节点（刻意**不用**最深节点：旧 `activeBlock` 就是根级块，用最深节点会改变"引用内围栏"的箭头行为，`active-block.test.ts` 已钉住该语义）；新增 `interactions/canonical-blocks.ts` 承担投影查询的 canonical 对应物（`findBlockForLine`/`findBlockStartingAtOffset` 等）；`line-block-adapter.ts` 约 25 处 `context.document.blocks` 全部 canonical 化；`code-fence-adapter.ts` 经 `canonicalLeafView` 取围栏 DTO；删除已无消费者的 `block-tree.ts`(+test) 与 `list-utils.ts`。
**1c**：删除 `ActiveBlockState.{blockMap,activeBlock}`、`projectSnapshotMarkdownDocument`、`EditorDerivedState.markdownDocument`（含 WeakMap 与 `projectMarkdownDocument` import）；`extensions/markdown.ts` 的链接/脚注/游离列表查询改 canonical（新 `findLinkAtOffset(snapshot, offset)` = `snapshot.nodeAt` + `findLinkInInline`；脚注定义直接读 `snapshot.tree.footnoteDefinitions`；变更检测 `activeRootNodeId`/`snapshot.tree` 身份等价——原 `blockMap` 本就按 tree 记忆化）；`src/renderer/code-editor.test.ts` 22 处 `state.activeBlock?.type` → `state.activeKind`。
**父独立验收**：`tsc -p tsconfig.renderer.json` / `-p tsconfig.vitest.json` 零诊断；architecture guard **234/234**（fixture 未动，7 包 / 13 规则 / `exceptions: []`）；`packages/editor-model/src packages/codemirror-adapter/src src/renderer/outline.test.ts src/renderer/performance` **54 文件 / 652 测试**全绿；全仓 `blockMap|projectSnapshotMarkdownDocument|activeBlock` 残留 **0**；全量 vitest 2770 passed / 1 skipped / 11 failed（仍恰为已知预存集合）。仍留给后续：渲染层 outline 与 `EditorDerivedState.outlineHeadings` 仍是两条派生（RF-703 负责合并成"一套文档结构喂编辑器/大纲/指标/导出"）。

### 2026-09-20 RF-603 尾项：表格 widget 回调陈旧 revision 加固（步 A 完成；步 B 探针按停规则撤回并报告证据与计划）
**步 A（已完成）**：`packages/codemirror-adapter/src/decorations/table-widget.ts` 的全部 7 组事件处理器（mousedown / focus / click / compositionstart / compositionend / input / keydown，覆盖 12 处 `this.callbacks?.*` 派发点）加上"该 cell 仍属于本 widget 实例"的活性判据 `isCellOwnedByRoot(root, editor)`（`root.parentNode !== null && editor.closest(".cm-table-widget") === root && parent.contains(editor) && parent.contains(root)`，通过既有结构性 `WidgetMeasurementTarget` 类型表达，**未新增 `@codemirror/view` 依赖**）；延迟提交（IME 回落的 `commitEditorInput`）同样被门控；新增 `destroy(dom)` 覆写：取消该 root 下所有待发回落定时器并清掉 WeakMap 记录（无悬挂保留）。新增 `table-widget.test.ts` 7 条行为合同（脱离 DOM 的 widget 对 input/composition 回落/keydown 零派发；销毁取消排队回落；失去 cell DOM 所有权的旧实例零派发；原地 DOM 复用时仍正常提交；挂载态回调契约与 offset 不变；IME 组合语义不变；嵌套/替换表格下仍用自身 offset）。
**刻意不做**：判据**不用** `isWidgetMounted` —— 它额外要求 `container.isConnected`，而"宿主暂时脱离 document 时被构建/移动"是合法挂载态，三个既有测试会因此变红（即会改变挂载态行为）。新判据对危险情形严格更强、对全部挂载情形等价。
**发现真实潜在缺陷（已由门控消除，未改其他行为）**：CodeMirror 的 widget 池会为不同 widget 实例复用同一个 DOM 元素且**不调用旧 tile 的 `destroy`**（`node_modules/@codemirror/view/dist/index.js` 的 `new WidgetTile(tile.dom, …, widget)` 路径），因此旧实例的 IME 回落定时器从不被取消；该定时器经 `resolveWidgetTableStartOffset` 读到的是**陈旧**的 `data-table-start-offset`，而 `runTableUpdateCell` → `contextForTable` → `planTableUpdateCell`/`tableNodeAt` 只按该 offset 解析表格——落到另一张表上就会改写那张表的 cell。新的活性判据让这类派发成为 no-op。
**另一处发现（本次未改，建议单独任务）**：同一条 DOM 复用路径还会在每次重建时**累积一整套 cell 事件监听器**（`syncDOM` → `syncTableCellEditor` 未移除上一实例的监听），旧实例因此被复用 DOM 长期保活；修法需要把 cell 监听改为存放在 root 上的单份绑定集合，或让 `TableWidget` 放弃 DOM 复用——两者都触及挂载态行为，超出本切片停规则。
**步 B（几何探针）未落地，按停规则删除并报告**：子代理实现了完整三件套（renderer 探针 + Electron main + `scripts/probe-*.mjs` + npm 脚本）并跑了两次，实测：async 预览（图片 decode）加载前后锚点漂移 **0.00px**、外层页面滚动恒 0；但 **source↔wysiwym 切换**后锚点视口位置漂移 **29.28px**（`scroller.scrollTop` 436 → 423，来回切换可幂等恢复）。根因：CodeMirror 在 scroller 上硬禁用了原生滚动锚定（`overflow-anchor: none`），切到 source 会把锚点上方的预览替换为源码行、上方内容高度变化而无人补偿。它拒绝把 29.28px 写成期望值（那等于断言要求失败的漂移）也没有把该断言从探针里删掉以求绿，而是删除全部新文件与 npm 脚本并给出计划。**这构成一个新的产品行为问题，需 owner 决定契约**：(i) 接受这是"有界的设计内位移"并以文档化常量断言，或 (ii) 修编辑器让 `setViewMode` 前后锚点视口位置保持不变；随后按计划重加探针（async 半边需用 Vite dev-server 中间件/mock 路由来真正"卡住"解码，`data:` URI 无法卡住）。
**父独立验收（RF-602 尾项 + RF-603 步 A 合并）**：`tsc -p tsconfig.renderer.json` / `-p tsconfig.vitest.json` 零诊断；`npm run lint` 0 error / 8 既有 warning；architecture guard **234/234**（fixture 未动）；`packages/codemirror-adapter/src packages/editor-model/src` **52 文件 / 638 测试**全绿（较 51/631 恰为新增的 7 条 widget 合同，无既有用例状态变化）；全量 vitest **2777 passed / 1 skipped / 11 failed**（失败仍恰为已知预存：`parse-block-map` 8 + `document-metrics` 1 + `code-editor` 2，无新增）；独占 oracle **`unexpected-mismatch=0 / known-defect-observed=99 / not-run=0`**；`test:blockquote-typora-visual`、`test:mermaid-footnote-render`、`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` 全部 exit 0；`test:editing-experience` 恰为已知 5 条 bare-marker 族（表格类 case 全 pass）。

### 2026-09-20 RF-603 步 B：source↔wysiwym 切换锚点保持（owner 选方案 ii → 后经 owner 决策 **(b) 移除**）
**结论（更新）**：该机制在树中存活期间被证实两件事——① **契约未被证实**：真实窗口探针残余 19–25px，且"机制锚定光标 / 探针测停放锚点行"的歧义从未澄清；② **它引入了真实回归**：`setViewMode` 读取 `view.coordsAtPos` 在 jsdom 下抛 `textRange(...).getClientRects is not a function`，使 `src/renderer/code-editor-canonical-rendering.test.ts` 由通过转为失败（当时那一刀的验收只跑了 `code-editor.test.ts` 等子集、**没跑全量 renderer**，因此漏检——教训：凡动 UI/外壳的切片必须跑全量 `src/renderer`）。父先做了防御式修复（几何不可用则降级为不锚定），随后 owner 选择 **(b) 直接移除**，回到"切换不做滚动补偿"的干净基线，把编辑器那条轴留给将来的**块身份锚点**（`scrollSnapshot` 式：记录视口顶部所在块 + 块内偏移）一次做对——它同时能覆盖下面第 2 条的异步推移缺陷。
**已移除**：`packages/codemirror-adapter/src/scroll-anchor.ts` 与其单测；`editor-view-mode.ts` 的锚点读取/恢复（该文件按 HEAD 原文逐字还原）；`editor-view-mode.test.ts` 重写为**不依赖几何**的 5 条用例（单事务 + `addToHistory=false`、重复请求不派发、默认与初始模式、效应可从任意事务应用、同一事务内最后一个效应生效）——保留原有意图、且不依赖被移除的机制。父验收：`packages/codemirror-adapter/src` + `code-editor-canonical-rendering.test.ts` **24 文件 / 270 测试全绿**，该文件由 1 失败恢复 5/5。
**移除前的实现与测得证据（原样保留，供将来块身份锚点复用）**：新增 `packages/codemirror-adapter/src/scroll-anchor.ts`（`readAnchorPosition` / `readViewportAnchor(Top)` / `restoreViewportAnchor`），`editor-view-mode.ts` 在分发前后读取并恢复锚点；切换仍是**单次**事务、`Transaction.addToHistory.of(false)`、幂等提前返回，不改文档/选区/历史。机制为每轮 `view.requestMeasure({ read, write })`：`read` 取锚点行的渲染 rect 相对 scroller 的 top（不用 `coordsAtPos`——测量阶段它回答的是变更前视口），`write` 执行 `scrollTop += measured - target`；最多 4 轮，未真正写入的一轮重新排队、已写入的一轮交棒（避免用陈旧测量重复应用同一 delta，这是最后一处被修掉的顺序 bug）。单测：新增 `scroll-anchor.test.ts` 10 条 + `editor-view-mode.test.ts` 7 条全绿（`packages` 由 52/638 → **54/655**）。
**契约未证实**：探针（Vite 中间件扣住图片解码、控制端点在测点释放）证明 async 半边**非空洞**（`pre-load 0.00px / image.complete=false / naturalHeight=0` → `loaded 520.00px`），但切换往返相对其基线的残差为 **24.98px / 19.00px**（两次运行一致）。子代理拒绝放宽容差、也拒绝把失败值写成期望值，按停规则删除 4 个探针文件与 npm 脚本。
**一处未澄清的歧义（很可能解释残差）**：机制锚定的是**光标**（`readAnchorPosition` 取选区远端），而探针测的是它自己停放的那条**锚点行**（`view.domAtPos(anchorOffset)`）。若两者不是同一条，残差不足以否证机制；要定论必须让探针锚定**光标行**（机制的真实契约）再测。当前状态：机制在树中、单测绿、oracle 的 `view-mode` aspect 未破（`unexpected=0`），但"≤1px"缺证据。**待 owner 决定**：保留机制并让探针锚定光标行重测 / 回退机制 / 另开切片做更彻底的"块身份锚点"。
**同批暴露的第二个真实缺陷（已测量、未修、需单独切片）**：编辑器未聚焦时，异步预览长高会把视口推移**整整图片高度**（实测 520.00px；页面级滚动 0/0/0）。根因：CodeMirror 在"未聚焦且近约 100ms 无滚轮/触摸"时跳过自身的滚动锚定补偿。修法：复用 `scroll-anchor.ts` 在 `completeMountedWidget` 的测量前后补偿；子代理原型卡在两点——`toDOM` 内不允许读布局（"Reading the editor layout isn't allowed during an update"），且 img `load` 触发时布局已移动，需改用**块身份**锚点（像 CodeMirror 自己的 `scrollSnapshot` 记录视口顶部所在块），属单独改动。
**父验收**：tsc 两套零诊断；guard **234/234**（fixture 未动，7 包/13 规则/`exceptions: []`）；`packages/codemirror-adapter/src packages/editor-model/src` **54 文件 / 655 测试**；`npm run lint` 0 error / 8 既有 warning；**独占 oracle `unexpected=0 / known-defect=99 / not-run=0`**；`test:blockquote-typora-visual`、`test:mermaid-footnote-render`、`test:table-layout`、`test:empty-document-layout`、`test:table-focus-scroll` 全部 exit 0；`test:editing-experience` 仍恰为已知 5 条 bare-marker 族（无新增）。

### 2026-09-20 M6.5 S4：布局不变性固化为常备断言 + 拖拽维度回归 + 模式切换契约定案
**契约（owner 已认可）**：① **模式切换零位移**——`reading`↔`editing` 之间正文列的绝对 X 位置与首行 X 位置的变化必须为 **0**（探针按 ±2px 断言）；② **面板开合不改变正文排版**——面板列占位与否只影响留白，不改文本列宽/行数/文档高；③ **拖拽调宽同样不改变正文排版**（面板 160→480px 全程，正文列宽/行数/高不变）；④ `shellMode` 切换**不再触发任何重排**（因为宽度不再由外壳状态决定）。
**面板开合带来的一处"可接受位移"（owner 决策：接受）**：面板由关到开时，画布内居中的正文列会跟着画布变窄而整体平移半个面板宽——实测 `absolutePosition.panelStateTranslation = 132`（面板占 264px 布局宽，居中文档列右移其一半）。这与"模式切换零位移"不冲突：**同一次外壳状态变化内的平移是设计结果，模式切换（面板开合状态不变）的位移必须为 0**。探针因此把 `panelStateTranslation` 作为**报告字段**（不参与断言），把 `textColumnLeftModeTranslation` / `firstLineLeftModeTranslation` 作为**断言字段**。
**文档化的边界条件（真实重排只在窄窗发生）**：当舞台宽 < `measure + 2×gutter`（720 + 48 = **768px**）时，`max(gutter, (100% − measure)/2)` 自然退化为 gutter，文本列被 clamp 到更窄，此时**文本确实会重新换行**——这是固定 measure 设计的预期行为而非缺陷。探针为每个样本（含宽面板的窄舞台样本）断言"**文本列 + 2×gutter 不超过舞台宽**（不外溢）"与"无负内边距"，并把 `documentStageWidth` 逐样本与跨样本 spread 一并报告，使"舞台变窄"这件事可见而不是被 invariance 结论掩盖。
**探针改动**（`src/renderer/empty-document-layout-probe.ts`）：① 新增绝对位置矩阵——四组合各测文本列 X 起点与首行 X 起点，跨 `shellMode` 相邻配对断言变化 0；② 新增拖拽维度——按 `stored-default / stored-200 / stored-360` 三档落盘偏好并逐档采样，断言面板列宽与存储值一致（非空洞性：三个档位必须渲染为三个不同列宽），留白档（248/200）断言正文 `textColumnWidth`/`renderedLineCount`/`totalTextHeight`/`documentHeight` 恒定、360 档按阈值单独报告；③ 删除不可靠的 `textLineCount` 采样（字体度量抖动下失真），改用 `.cm-line` 计数（`renderedLineCount`）+ `totalTextHeight` + `documentHeight` + 列宽等精确量；④ 保留 S1 的四项 spread 归零与非空洞性 guard，并新增"首行宽 == 列宽""首行左 == 列左"断言。
**告一段落**：本切片全部为**探针侧**改动，`src/renderer/**` 生产代码零改动（S1–S3 已把机制做完），因此不存在"为过测试而改产品"的风险。

### 2026-09-20 M6 + M6.5 收尾：最终全量验收（独占静止树）
**结论**：M6（RF-701 / RF-602 / RF-603 / RF-604）与 M6.5（S1–S4）在本会话声明的范围内**全部落地并验收通过**；**owner 已于 2026-09-20 明确认可全部验收，M6 与 M6.5 据此标记为 `ACCEPTED` 并收口**，随后按 owner 指示提交并推送 main（提交 `4a66136`，`origin/main` 已同步）；`fixtures/architecture/editor-foundation-guard.json` 为 `exceptions: []`（7 包 / 13 规则），`packages/editor-core/` 不存在。
**非 Electron 批次**：`npm run typecheck`（2 个 workspace 构建 + renderer/electron/vitest/cli 四套配置）**exit 0**；`npm run lint` **0 error / 8 既有 warning**；`npm run build`（clean + renderer + electron + cli）**exit 0**；architecture guard **234/234**；全量 vitest **2788 passed / 1 skipped / 11 failed（2800）**，失败集合与 M6 前**逐条相同**——`packages/markdown-engine/src/parse-block-map.test.ts` 8 + `src/renderer/document-metrics.test.ts` 1 + `src/renderer/code-editor.test.ts` 2（bare-marker 引擎漂移同族，**无新增、无删除覆盖**）。
**Electron 批次（串行独占，先 oracle 后探针）**：oracle **`passed 121/121 cases / 2541 targets / verified-existing=79 / verified-runner=2363 / known-defect=99 / unexpected=0 / not-run=0`**，报告 `.artifacts/editor-behavior/m6.5-final.json`；`test:empty-document-layout`、`test:blockquote-typora-visual`、`test:mermaid-footnote-render`、`test:table-layout`、`test:table-focus-scroll` **全部 exit 0**；`test:editing-experience` **exit 1**，失败恰为已记录的 **5 条 bare-marker 族**（bare `-`、bare ordered marker、两条 IME 组合预览、空白行中文输入），表格类 case 全 pass，与 `parse-block-map`/`code-editor` 同根因，非本批引入。
**仍明确不做（留给后续任务，不属本次声明）**：RF-702（HTML 导出切到 canonical）、RF-703（outline/指标统一到 `EditorDerivedSnapshot`，合并渲染层 `deriveOutlineItems` 与 `EditorDerivedState.outlineHeadings` 两条派生）、包体积预算（`perf:bundle` 仍为同样 4 个上限 FAIL：344036/300000、92375/90000、267192/260000、1437041/1430000；15 个 `forbiddenInitialSourceGroup` 与 4 个 `requiredLazyChunk` 全 PASS，source group 中已无 `editor-core`）、M5 最终性能验收、M7–M10，以及三个已测量待定契约的产品行为候选（未聚焦时异步预览长高会把视口推移整图高；编辑轴 wysiwym↔source 切换上方内容高度变化导致的有界位移；widget 池 DOM 复用累积 cell 监听器）。






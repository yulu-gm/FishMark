# Yulora 测试报告

用于记录各任务的验证结果。

## 模板

| 日期 | 任务 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- | --- |

## 记录

| 2026-04-15 | TASK-035 | `manual: npm run dev` | 通过 | 验收复核：用户已在真实桌面壳中完成中文 IME 人工验收，确认段落、标题、列表输入不丢字、不跳光标，且 autosave 后光标不再跳到文首。 |
| 2026-04-15 | TASK-035 | `npm run lint` | 通过 | 验收复核：ESLint 全量检查通过。 |
| 2026-04-15 | TASK-035 | `npm run typecheck` | 通过 | 验收复核：renderer、electron、vitest 三套 TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-035 | `npm run test` | 通过 | 验收复核：Vitest 报告 15 个文件、79 条测试全部通过，包含新增 `code-editor-view` 回归测试。 |
| 2026-04-15 | TASK-035 | `npm run build` | 通过 | 验收复核：renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本任务验收。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 先以失败测试锁定 composition 期间“文档可更新、派生状态不提前广播”的 guard 语义，再验证段落、标题、列表三类回归场景全部通过。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/app.autosave.test.ts` | 通过 | 确认 composition guard 未破坏现有 `onChange` / `onBlur` 驱动的 autosave 行为。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/code-editor-view.test.tsx src/renderer/app.autosave.test.ts src/renderer/code-editor.test.ts` | 通过 | 修复 autosave 成功后因 `CodeEditorView` 在同一 `loadRevision` 下错误调用 `replaceDocument()` 导致光标跳到文首的问题，并确认 editor reload、autosave、IME guard 三条路径未回归。 |
| 2026-04-15 | TASK-035 | `npm run lint` | 通过 | renderer controller 与新增 IME 回归测试通过 ESLint 检查。 |
| 2026-04-15 | TASK-035 | `npm run typecheck` | 通过 | composition guard、新增测试 helper 与 controller 生命周期调整通过 TypeScript 检查。 |
| 2026-04-15 | TASK-035 | `npm run test` | 通过 | Vitest 报告 14 个文件、77 条测试全部通过，包含新增 IME composition regression coverage。 |
| 2026-04-15 | TASK-035 | `npm run build` | 通过 | renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮 IME 基线保护交付。 |
| 2026-04-15 | TASK-009 | `npm run test -- packages/editor-core/src/active-block.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts` | 通过 | 覆盖 active block 纯解析、块尾换行/空白区边界、CodeMirror 选择变化通知，以及 autosave 与新增 editor prop surface 的非回归。 |
| 2026-04-15 | TASK-009 | `npm run lint` | 通过 | `packages/editor-core` 新增 active-block 逻辑、renderer controller 桥接与文档更新均通过 ESLint。 |
| 2026-04-15 | TASK-009 | `npm run typecheck` | 通过 | `tsconfig.renderer.json` 已纳入 `packages/**/*.ts`，renderer 对 `editor-core` / `markdown-engine` 的依赖通过 TypeScript 检查。 |
| 2026-04-15 | TASK-009 | `npm run test` | 通过 | Vitest 报告 10 个文件、46 条测试全部通过；当前 Windows 环境下全量 `test` 仍需提权以绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-009 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；保留 Vite 默认的大 bundle warning，但未阻塞本轮 active-block 交付。 |
| 2026-04-15 | TASK-025 | `npm run test -- src/main/runtime-windows.test.ts src/main/package-scripts.test.ts src/renderer/test-workbench.test.tsx src/renderer/app.autosave.test.ts` | 通过 | 覆盖测试模式启动脚本、主窗口/工作台窗口分流、preload 单文件 bridge 约束、workbench 页壳，以及 workbench 拉起 editor 测试窗口的最小链路，同时确认 autosave 现有行为未回归。 |
| 2026-04-15 | TASK-025 | `npm run lint` | 通过 | main/preload/renderer 新增测试模式分支、workbench UI 和新增测试文件均通过 ESLint 检查。 |
| 2026-04-15 | TASK-025 | `npm run typecheck` | 通过 | Electron 窗口管理、preload runtime bridge、renderer 新接口与测试桩的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-025 | `npm run test` | 通过 | Vitest 报告 11 个文件、53 条测试全部通过，包括新增 runtime-windows、preload 单文件 bridge 约束与 renderer workbench 测试。 |
| 2026-04-15 | TASK-025 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-025 | `npm run test -- src/main/runtime-windows.test.ts src/main/package-scripts.test.ts src/renderer/test-workbench.test.tsx src/renderer/app.autosave.test.ts` | 通过 | 验收复核：Vitest 报告 4 个文件、18 条测试全部通过；当前 Windows 沙箱会在加载 Vite/Vitest 配置时触发 `spawn EPERM`，本轮使用提权环境完成重跑。 |
| 2026-04-15 | TASK-025 | `npm run lint` | 通过 | 验收复核：ESLint 全量检查通过。 |
| 2026-04-15 | TASK-025 | `npm run typecheck` | 通过 | 验收复核：renderer、electron、vitest 三套 TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-025 | `npm run build` | 通过 | 验收复核：renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本任务验收。 |
| 2026-04-15 | TASK-028 | `npm run test -- packages/test-harness/src/runner.test.ts src/renderer/test-workbench.test.tsx` | 通过 | 覆盖 workbench 的 idle / running / failed / interrupted debug 状态，以及 runner 事件流与步骤结果在 renderer 中的折叠展示；当前 Windows 沙箱中需提权绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-028 | `npm run lint` | 通过 | 新增 workbench 运行状态模型、受控场景目录与 debug 面板样式均通过 ESLint。 |
| 2026-04-15 | TASK-028 | `npm run typecheck` | 通过 | renderer 中新增的 runner 事件折叠、步骤状态展示和中断控制通过 TypeScript 检查。 |
| 2026-04-15 | TASK-028 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮交付。 |
| 2026-04-15 | TASK-008 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 覆盖顶层 `heading` / `paragraph` / `list` / `blockquote` 顺序、heading depth、有序/无序列表、空输入，以及 list / blockquote 内部 paragraph 不泄漏为顶层 block。 |
| 2026-04-15 | TASK-008 | `npm run lint` | 通过 | `packages/markdown-engine` 的新增 parser、类型定义与 Vitest 配置调整均通过 ESLint 检查。 |
| 2026-04-15 | TASK-008 | `npm run typecheck` | 通过 | `tsconfig.vitest.json` 已纳入 `packages/**/*.ts`，新增 Markdown engine 源码和测试均通过 TypeScript 检查。 |
| 2026-04-15 | TASK-008 | `npm run test` | 通过 | Vitest 报告 9 个文件、41 条测试全部通过，包括新增 block-map parser 测试。 |
| 2026-04-15 | TASK-008 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；当前 Windows 环境下全量 `test` / `build` 仍需提权以绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-005 | `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts` | 通过 | 覆盖 manual-saving / autosaving 状态迁移、编辑器 blur 事件、idle autosave、blur autosave、手动保存优先级，以及 in-flight autosave 后的单次 replay autosave。 |
| 2026-04-15 | TASK-005 | `npm run lint` | 通过 | autosave 调度、CodeMirror blur 透传与新增测试文件均通过 ESLint 检查。 |
| 2026-04-15 | TASK-005 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查通过，并补齐了 vitest JSX/test types 配置。 |
| 2026-04-15 | TASK-005 | `npm run test` | 通过 | Vitest 报告 8 个文件、37 条测试全部通过，包括新增 autosave orchestration 测试。 |
| 2026-04-15 | TASK-005 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；当前 autosave 实现未引入构建期错误。 |
| 2026-04-15 | TASK-032 | `npm run test -- src/main/application-menu.test.ts src/main/save-markdown-file.test.ts src/renderer/code-editor.test.ts src/renderer/document-state.test.ts` | 通过 | 覆盖 File 菜单命令分发，并确认菜单接入后现有保存链路、CodeMirror 控制器和文档状态测试仍全部通过。 |
| 2026-04-15 | TASK-032 | `npm run lint` | 通过 | 原生菜单、preload 订阅接口和 renderer 壳层样式调整未引入 lint 错误。 |
| 2026-04-15 | TASK-032 | `npm run typecheck` | 通过 | Electron 菜单、共享菜单命令类型与 preload/renderer 新接口的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-032 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` / Vite / Vitest 的 `EPERM` 限制。 |
| 2026-04-15 | TASK-007 | `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖 CodeMirror controller、renderer 持久化快照、dirty 状态与 Save / Save As 兼容路径。 |
| 2026-04-15 | TASK-007 | `npm run lint` | 通过 | CodeMirror controller、CodeEditorView 与 renderer shell 调整未引入 lint 错误。 |
| 2026-04-15 | TASK-007 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过，并补齐了 Vitest 的 DOM 编译上下文。 |
| 2026-04-15 | TASK-007 | `npm run test` | 通过 | Vitest 报告 6 个文件、27 条测试通过，包括新增 CodeMirror controller 测试。 |
| 2026-04-15 | TASK-007 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` / Vite 的 `EPERM` 限制。 |
| 2026-04-15 | TASK-004 | `npm run test -- src/main/save-markdown-file.test.ts src/renderer/document-state.test.ts src/main/package-scripts.test.ts` | 通过 | 覆盖保存成功、保存失败、另存为取消、另存为成功、dirty 状态和开发启动脚本依赖。 |
| 2026-04-15 | TASK-004 | `npm run lint` | 通过 | Save / Save As bridge、主进程写入链路与 renderer 状态更新未引入 lint 错误。 |
| 2026-04-15 | TASK-004 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-004 | `npm run test` | 通过 | Vitest 报告 5 个文件、26 条测试通过，包括新增保存链路测试。 |
| 2026-04-15 | TASK-004 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` 清理阶段的 `EPERM`。 |
| 2026-04-15 | TASK-002 | `npm run lint` | 通过 | 现有应用壳和文档调整未引入 lint 错误。 |
| 2026-04-15 | TASK-002 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-002 | `npm run test` | 通过 | Vitest 报告现有测试全部通过。 |
| 2026-04-15 | TASK-002 | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-003 | `npm run lint` | 通过 | 安全 bridge、打开文件流程与 renderer 文档状态相关代码未引入 lint 错误。 |
| 2026-04-15 | TASK-003 | `npm run typecheck` | 通过 | `src/main`、`src/preload`、`src/renderer` 与共享打开文件类型的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-003 | `npm run test` | 通过 | Vitest 报告 `src/main/open-markdown-file.test.ts`、`src/renderer/document-state.test.ts` 在内的现有测试全部通过。 |
| 2026-04-15 | TASK-003 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过，当前打开文件闭环可继续作为后续保存与编辑器接入基础。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run lint` | 通过 | ESLint 无错误。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run test` | 通过 | Vitest 报告 1 个文件、2 条测试通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `test -f docs/design.md && test -f docs/acceptance.md && test -f docs/test-cases.md && test -f docs/progress.md && test -f docs/decision-log.md && test -f docs/test-report.md && rg -n "^\| (BOOTSTRAP-DOCS|TASK-001|TASK-002|TASK-003|TASK-004|TASK-005|TASK-006|TASK-007|TASK-008|TASK-009|TASK-010|TASK-011|TASK-012|TASK-013|TASK-014|TASK-015|TASK-016|TASK-017|TASK-018|TASK-019|TASK-020|TASK-021|TASK-022|TASK-023|TASK-024) \|" docs/progress.md` | 通过 | 已确认 `docs/` 中的必需文件存在，且 `docs/progress.md` 包含 `BOOTSTRAP-DOCS` 与 `TASK-001` 到 `TASK-024`。 |
| 2026-04-15 | TASK-010 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 先补了 heading inactive/active 切换与 composition flush 回归测试，再实现标题 decoration；当前 worktree 内该目标测试共 10 项全部通过。 |
| 2026-04-15 | TASK-010 | 人工验收（`npm run dev`，worktree: `D:\MyAgent\Yulora\Yulora\.worktrees\task-010-heading-rendering`） | 通过 | 用户已确认标题 `#` 弱化、激活回源码态和基础交互通过人工验收。仓库级 `lint` / `typecheck` / 全量 `test` / `build` 尚未在本轮执行。 |
| 2026-04-15 | TASK-011 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 补了 inactive paragraph 切换、heading/paragraph decoration 共存和 composition flush 回归测试；当前 worktree 内该目标测试共 14 项全部通过。 |
| 2026-04-15 | TASK-011 | 人工验收（`npm run dev`，worktree: `D:\MyAgent\Yulora\Yulora\.worktrees\task-010-heading-rendering`） | 通过 | 用户已确认段落轻量渲染、激活回源码态、与标题 decoration 共存以及基础交互通过人工验收。仓库级 `lint` / `typecheck` / 全量 `test` / `build` 待本轮补跑。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run lint` | 通过 | 合并前门禁通过，无 lint 错误。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run typecheck` | 通过 | 合并前门禁通过，renderer / electron / vitest TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run test` | 通过 | 合并前门禁通过，15 个测试文件、89 个测试全部通过。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run build` | 通过 | 合并前门禁通过；Vite 仅报告产物 chunk 较大 warning，不阻塞构建。 |
| 2026-04-15 | TASK-001 | `npm run lint` | 通过 | 修正 Electron 入口和开发脚本后，无 lint 错误。 |
| 2026-04-15 | TASK-001 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-001 | `npm run test` | 通过 | Vitest 报告 1 个文件、2 条测试通过。 |
| 2026-04-15 | TASK-001 | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-001 | `node -e "const {spawn,spawnSync}=require('child_process'); const child=spawn('npm',['run','dev'],{stdio:'inherit'}); let ready=false; const deadline=Date.now()+20000; const timer=setInterval(()=>{ const curl=spawnSync('curl',['-I','-sSf','http://localhost:5173/'],{encoding:'utf8'}); const ps=spawnSync('ps',['-ax','-o','command='],{encoding:'utf8'}); const electronRunning=/Electron\\.app\\/Contents\\/MacOS\\/Electron/.test(ps.stdout); if(curl.status===0 && electronRunning){ ready=true; console.log('DEV-SHELL-READY'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); } else if(Date.now()>deadline){ console.error('DEV-SHELL-TIMEOUT'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); process.exit(1); } },500); child.on('exit',(code,signal)=>{ clearInterval(timer); if(ready){ process.exit(0); } process.exit(code ?? (signal ? 1 : 0)); });"` | 通过 | Vite 成功提供 `http://localhost:5173/`，`curl` 可访问，同步观察到了运行中的 Electron 进程，随后正常退出。 |

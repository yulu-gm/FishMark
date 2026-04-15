# Yulora 测试报告

用于记录各任务的验证结果。

## 模板

| 日期 | 任务 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- | --- |

## 记录

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
| 2026-04-15 | TASK-001 | `npm run lint` | 通过 | 修正 Electron 入口和开发脚本后，无 lint 错误。 |
| 2026-04-15 | TASK-001 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-001 | `npm run test` | 通过 | Vitest 报告 1 个文件、2 条测试通过。 |
| 2026-04-15 | TASK-001 | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-001 | `node -e "const {spawn,spawnSync}=require('child_process'); const child=spawn('npm',['run','dev'],{stdio:'inherit'}); let ready=false; const deadline=Date.now()+20000; const timer=setInterval(()=>{ const curl=spawnSync('curl',['-I','-sSf','http://localhost:5173/'],{encoding:'utf8'}); const ps=spawnSync('ps',['-ax','-o','command='],{encoding:'utf8'}); const electronRunning=/Electron\\.app\\/Contents\\/MacOS\\/Electron/.test(ps.stdout); if(curl.status===0 && electronRunning){ ready=true; console.log('DEV-SHELL-READY'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); } else if(Date.now()>deadline){ console.error('DEV-SHELL-TIMEOUT'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); process.exit(1); } },500); child.on('exit',(code,signal)=>{ clearInterval(timer); if(ready){ process.exit(0); } process.exit(code ?? (signal ? 1 : 0)); });"` | 通过 | Vite 成功提供 `http://localhost:5173/`，`curl` 可访问，同步观察到了运行中的 Electron 进程，随后正常退出。 |

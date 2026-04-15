# TASK-029 总结

结果：DEV_DONE

范围：
- 为 agent 提供统一 CLI 入口 `npm run test:scenario -- --id <scenario-id>`
- 固定退出码契约（0 通过 / 1 失败 / 2 超时 / 3 中断 / 4 配置错误）
- 建立 `.artifacts/test-runs/<timestamp>-<scenario-id>/` 工件目录，写出 `result.json` 与 `step-trace.json`

本轮完成：
- `packages/test-harness/src/cli/args.ts`：参数解析（`--id`、`--step-timeout`、`--out-dir`、`--no-artifacts`、`-h/--help`），未知参数与缺失值全部归为配置错误
- `packages/test-harness/src/cli/exit-codes.ts`：`CLI_EXIT_CODES` 常量与 `exitCodeForStatus()` 映射 `ScenarioStatus`
- `packages/test-harness/src/cli/artifacts.ts`：`ResultDocument` / `StepTraceDocument` 结构、`PROTOCOL_VERSION = 1`、可测试的 `runDirName()` 与 `writeRunArtifacts()`
- `packages/test-harness/src/cli/run.ts`：可测试的 `runCli()` 核心，注入 registry / handlers / writer / signal / now，统一处理状态与退出码
- `packages/test-harness/src/cli/bin.ts`：可执行入口，桥接 `process.argv`、`process.stdout/stderr`、`SIGINT -> AbortController`
- `packages/test-harness/src/handlers/headless.ts`：与 workbench 表现一致的无头 handler（`app-shell-startup` 全通过，`open-markdown-file-basic` 在 `select-fixture` 失败）
- `packages/test-harness/src/index.ts`：导出 CLI、handler、工件、退出码等公共 API
- `tsconfig.cli.json`：CommonJS/Node10 输出到 `dist-cli/`，接入 `typecheck`
- 根 `package.json`：新增 `build:cli`、`pretest:scenario`、`test:scenario` 脚本，`clean` / `typecheck` 同步更新
- `.gitignore` 追加 `dist-cli`、`.artifacts`
- README 更新 CLI 用法、退出码表与协议版本说明
- 新增测试：`cli/args.test.ts`、`cli/run.test.ts`、`cli/artifacts.test.ts`，覆盖参数解析、未知场景、通过 / 失败 / 超时 / 中断、帮助输出、工件落盘

验证：
- `npm run lint`
- `npm run typecheck`
- `npm test` — 18 files / 98 tests 全通过
- `npm run build:cli` 正常产出 `dist-cli/cli/*.js`
- 手动验收：
  - `node dist-cli/cli/bin.js --id app-shell-startup` → 退出码 0，写出 `result.json` / `step-trace.json`
  - `node dist-cli/cli/bin.js --id open-markdown-file-basic --no-artifacts` → 退出码 1，stderr 指明失败步骤 `select-fixture`
  - `node dist-cli/cli/bin.js --id not-a-scenario --no-artifacts` → 退出码 4
  - `node dist-cli/cli/bin.js` → 退出码 4，提示缺失 `--id`

剩余不在本任务范围内：
- 真正驱动 Electron 场景的 handler（headless handler 仅为占位）
- visual-test 截图 / baseline / diff（TASK-030）
- CLI 与 CI / 调度器的集成

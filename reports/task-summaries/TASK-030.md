# TASK-030 总结

结果：DEV_DONE

范围：
- 建立 visual-test 能力：RGBA 截图比对、PNG 基线读写、diff 图生成
- CLI 写出 actual / expected / diff PNG 工件，`result.json` 携带 `visualResults`
- 工作台 UI 接入 in-memory visualApi，把 actual / expected / diff 直接画到 `<canvas>`
- 首批 visual scenario `visual-smoke-gradient` 用确定性渐变驱动整条流水线

本轮完成：
- `packages/test-harness/src/visual/compare.ts`：平台无关的 `compareRgba()`，含 per-channel 阈值与 diff buffer（不匹配像素红色，匹配像素灰度淡化）
- `packages/test-harness/src/visual/png.ts`：基于 `node:zlib` 的最小 RGBA PNG 编解码（8-bit、RGBA、filter 0）
- `packages/test-harness/src/visual/check.ts`：`runVisualCheck()`，支持 baseline 自动种子、size-drift、像素 mismatch，写出 `visual/<stepId>/{actual,expected,diff}.png`
- `packages/test-harness/src/visual/api.ts`：`VisualApi` / `VisualObservation` 统一契约，供 CLI 和 workbench 共用
- `packages/test-harness/src/visual/node-api.ts`：node-backed VisualApi（CLI 走磁盘）
- `packages/test-harness/src/visual/memory-api.ts`：in-memory VisualApi（workbench 走内存 + canvas）
- `packages/test-harness/src/visual/gradient.ts`：确定性 64×64 渐变 + `drift` 开关
- `packages/test-harness/src/scenarios/visual-smoke-gradient.ts`：`render-gradient` + `compare-gradient` 两步场景，加入 `defaultScenarioRegistry`
- `packages/test-harness/src/handlers/headless.ts`：headless handler 支持 `visual-smoke-gradient`，失败时抛出走 runner 失败路径
- `packages/test-harness/src/cli/args.ts`：新增 `--baseline-root`、`--force-visual-drift`
- `packages/test-harness/src/cli/run.ts`：提前建立 run 目录、构造 visualApi 注入 handler 工厂、收集 observations 注入 `ResultDocument.visualResults`、在 stdout 摘要中打印 verdict 与工件路径
- `packages/test-harness/src/cli/artifacts.ts`：`PROTOCOL_VERSION` 升 2，`ResultDocument` 增加 `visualResults`，`writeRunArtifacts` 接受 `runDir` 覆盖
- `src/renderer/App.tsx`：workbench 挂接 memoryVisualApi、加入 `Force visual drift` 开关、把 observations 画到 `<canvas>`；保留既有 debug stream / test process 面板
- `src/renderer/styles.css`：visual-results 面板、frame canvas、verdict badge 样式
- 测试：`visual/compare.test.ts`、`visual/png.test.ts`、`visual/check.test.ts`、`cli/run.test.ts` 增加 visual 场景用例
- `tsconfig.cli.json` / `tsconfig.base.json` 沿用无改动；`.gitignore` 追加 `tests/visual-baselines`
- README 补齐 visual-test 章节，`MVP_BACKLOG.md` 置为 DEV_DONE

验证：
- `npm run lint`
- `npm run typecheck`
- `npm test` — 21 files / 110 tests 全通过
- `npm run build` 产物正常
- `npm run build:cli && node dist-cli/cli/bin.js --id visual-smoke-gradient`
  - 首次：verdict `baseline-created`，exit 0，baseline 落到 `tests/visual-baselines/visual-smoke-gradient/compare-gradient.png`
  - 再次：verdict `match`，exit 0
  - `--force-visual-drift`：verdict `mismatch`，exit 1，`.artifacts/test-runs/<ts>-visual-smoke-gradient/visual/compare-gradient/{actual,expected,diff}.png` 全部写出
- 人工验收（workbench）：
  - `npm run dev:test-workbench`
  - 在 scenario catalog 选 `visual-smoke-gradient`，点 `Run Selected Scenario`
  - 确认 `Visual Results` 面板出现三幅 canvas；首次为 baseline-created（仅 actual），第二次 match 显示 actual（淡色 diff 可省略）
  - 勾选 `Force visual drift` 再次运行，确认 verdict 变为 `mismatch`、三个 canvas 都渲染、diff 上高亮红色像素、Test Process 面板将 `compare-gradient` 标记为 failed

剩余不在本任务范围内：
- 接入真正的 Electron 截图（当前仍是合成渐变）
- 基线管理命令（update-baseline / reject 等）
- 跨平台像素差异的容忍策略（目前仅 per-channel 阈值）
- 更丰富的 diff 可视化（如半透明 overlay）

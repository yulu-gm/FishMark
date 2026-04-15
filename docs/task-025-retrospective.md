# TASK-025 复盘

## 主要阻碍

1. `dev:test-workbench` 最初复用了普通 renderer 的 `5173` 端口。在主工作区已经运行 `npm run dev` 的情况下，worktree 里的 Electron 会连到错误的 Vite 实例，导致现象和真实根因混在一起。
2. 真正的白屏根因不在 renderer，而在 preload。Electron 控制台已经明确给出 `Unable to load preload script` 和 `module not found: ./runtime-mode`，说明问题发生在 preload 模块链加载阶段，而不是 workbench 页面本身。
3. workbench 页面后来被我改成了“bridge 缺失时显示诊断 banner 而不是直接崩溃”，这提升了可诊断性，但也让“窗口能打开”变成了一个误导性信号。如果验证只看窗口是否出现，就会把 bridge 缺失误判成“基本正常”。
4. Windows 本地环境里，受控启动、日志文件删除和部分 Vitest 运行会碰到权限/锁文件问题，导致调试过程里存在额外噪音，需要分辨哪些是产品问题，哪些只是本机进程和沙箱限制。

## 我犯下的错误

1. 我过早声称问题已经修复。那时我只验证了 Electron 进程启动和页面渲染，没有验证 `window.yulora` 是否真的由 preload 暴露出来。这违反了“证据先于结论”的要求。
2. 我第一次把问题归因到等待构建产物不完整，补了 `wait-on dist-electron/preload/runtime-mode.js`。这个修复方向并不充分，因为真实问题不是“文件没等到”，而是 preload 在运行时依赖本地相对模块导入，这条链本身就不稳。
3. 我自己的验证策略太弱。之前的脚本测试主要约束 `package.json` 里的启动字符串和端口，不足以证明 preload 成功执行，也不足以证明 bridge 可用。
4. 我在发现 workbench 页面能显示诊断信息后，没有及时把“页面渲染成功”和“功能真正可用”明确区分开，导致对修复状态的判断失真。

## 最终纠正

1. 把 workbench renderer 独立到 `5174`，先消掉 worktree 与主工作区的端口串线。
2. 把 runtime mode 解析内联进 `src/preload/preload.ts`，让 preload 保持单文件入口，不再依赖 `./runtime-mode` 这样的本地相对导入。
3. 在 `src/main/package-scripts.test.ts` 里补充约束，明确禁止 preload 源文件继续出现本地相对导入，避免同类问题回归。
4. 重新跑 `npm run test`、`npm run lint`、`npm run typecheck`、`npm run build`，用新的结果而不是旧印象来收口。

## 后续约束

1. 以后凡是 Electron preload 问题，验收不能只看“窗口是否打开”，必须至少验证 bridge 是否已暴露。
2. 任何“已经修好”的结论都必须建立在最新一轮完整验证上，不能依赖上一轮日志或半程验证结果。
3. 诊断 UI 是辅助，不是成功信号。它只能说明应用没有直接崩溃，不能说明功能已经恢复。

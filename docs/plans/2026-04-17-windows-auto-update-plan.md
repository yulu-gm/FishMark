# Windows Auto Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Windows 安装版 Yulora 接入基于 GitHub Releases 的自动更新，并在下载过程中把进度提示接入现有底部状态条。

**Architecture:** 在 main 进程新增独立的 `app-updater` 服务封装 `electron-updater`、菜单触发、弹窗和状态广播；通过 preload 暴露最小更新 API 与事件订阅；renderer 只订阅只读更新状态，并在现有状态条按需显示“正在下载更新”提示。发布端继续使用 `electron-builder + NSIS`，并补齐 GitHub publish 配置，为后续迁移到 `generic` provider 预留抽象边界。

**Tech Stack:** Electron、React 19、TypeScript、electron-builder、electron-updater、Vitest、Vite

---

## Scope

本计划覆盖：
- Windows 自动更新接入
- GitHub Releases 发布源
- 启动后自动检查更新
- `Help -> Check for Updates` 手动入口
- 下载完成确认安装弹窗
- 下载中状态条提示
- main / preload / renderer / shared / 配置 / 测试同步更新

本计划暂不覆盖：
- macOS 自动更新
- 代码签名与 notarization
- CI 自动发版
- 自建更新服务器
- 灰度更新

---

## Design Decisions

### 1. 更新状态独立建模

新增 `src/shared/app-update.ts`，定义跨进程共享的更新状态类型与 channel 常量。

建议状态：
- `idle`
- `checking`
- `downloading`
- `downloaded`
- `error`

其中 `downloading` 带：
- `version`
- `percent`

renderer 不复用文档保存状态，也不把更新状态揉进 `AppState`。

### 2. 更新服务收敛到 main

新增 `src/main/app-updater.ts`。

服务接口建议最小化：

```ts
export type AppUpdaterController = {
  checkForUpdates: (source: "auto" | "manual") => Promise<void>;
  getState: () => AppUpdateState;
};
```

初始化参数建议显式注入：

```ts
type CreateAppUpdaterOptions = {
  app: Pick<Electron.App, "isPackaged" | "getVersion">;
  dialog: Pick<Electron.Dialog, "showMessageBox">;
  autoUpdater: {
    autoDownload: boolean;
    checkForUpdates: () => Promise<unknown>;
    quitAndInstall: () => void;
    on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  };
  runtimeMode: "editor" | "test-workbench";
  broadcast: (state: AppUpdateState) => void;
  logger?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
};
```

这样更利于单测，不依赖真实 Electron runtime。

### 3. 状态条只展示下载中

renderer 状态条只在 `state.kind === "downloading"` 时显示更新提示：

```tsx
const updateStatusLabel =
  appUpdateState.kind === "downloading"
    ? appUpdateState.percent >= 1
      ? `正在下载更新 ${Math.round(appUpdateState.percent)}%`
      : "正在下载更新…"
    : null;
```

下载完成后不常驻显示“已下载完成”，由主进程弹窗接管。

### 4. 自动检查与手动检查提示策略不同

- 自动检查：
  - 无更新时不提示
  - 出错时只记日志
- 手动检查：
  - 无更新时弹提示
  - 出错时弹错误

---

## Task 1: 补齐发布依赖与共享更新协议

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.json`
- Create: `src/shared/app-update.ts`
- Modify: `src/renderer/types.d.ts`

**Step 1: 写共享更新协议测试入口说明并确认受影响依赖**

检查文件：
- `package.json`
- `electron-builder.json`
- `src/renderer/types.d.ts`

目标：
- 明确新增依赖 `electron-updater`
- 评估是否一并加入 `electron-log`
- 约定 shared 层事件与状态类型

**Step 2: 新建共享协议文件**

在 `src/shared/app-update.ts` 中定义：

```ts
export const CHECK_FOR_APP_UPDATES_CHANNEL = "yulora:check-for-app-updates";
export const APP_UPDATE_STATE_EVENT = "yulora:app-update-state";

export type AppUpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };
```

**Step 3: 更新 `package.json` 与打包配置**

最小改动目标：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>.git"
  },
  "dependencies": {
    "electron-updater": "^6.x"
  }
}
```

`electron-builder.json` 增加：

```json
{
  "publish": [
    {
      "provider": "github",
      "owner": "<owner>",
      "repo": "<repo>",
      "releaseType": "release"
    }
  ],
  "electronUpdaterCompatibility": ">=2.16"
}
```

**Step 4: 更新 renderer 类型声明**

在 `src/renderer/types.d.ts` 中同步新增：
- `checkForUpdates`
- `onAppUpdateState`
- `AppUpdateState`

**Step 5: 运行基础校验**

Run:
```powershell
npm run typecheck
```

Expected:
- 可能先因 preload 未实现而失败，记录真实缺口

**Step 6: 提交本任务**

```bash
git add package.json electron-builder.json src/shared/app-update.ts src/renderer/types.d.ts
git commit -m "feat: define app update contract"
```

---

## Task 2: 为自动更新接入 main 进程服务与菜单入口

**Files:**
- Create: `src/main/app-updater.ts`
- Create: `src/main/app-updater.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/main.test.ts`
- Modify: `src/main/application-menu.ts`
- Modify: `src/main/application-menu.test.ts`
- Modify: `src/shared/menu-command.ts`

**Step 1: 先写菜单测试**

在 `src/main/application-menu.test.ts` 里新增断言：

```ts
expect(helpMenu?.submenu?.map((item) => item.label)).toContain("Check for Updates");
expect(dispatchCommand).toHaveBeenCalledWith("check-for-updates");
```

**Step 2: 运行菜单测试，确认失败**

Run:
```powershell
npm run test -- src/main/application-menu.test.ts
```

Expected:
- FAIL，提示缺少 `check-for-updates` 命令或菜单项

**Step 3: 更新共享菜单命令与菜单定义**

在 `src/shared/menu-command.ts` 增加：

```ts
"check-for-updates"
```

在 `src/main/application-menu.ts` 的 `Help` 菜单中新增命令项。

**Step 4: 再写 `app-updater` 单测**

在 `src/main/app-updater.test.ts` 覆盖：
- 非 packaged 环境不启用
- 非 Windows 不启用
- 自动检查无更新时回到 `idle`
- `update-available` 后进入 `downloading`
- `download-progress` 更新百分比
- `update-downloaded` 后弹安装确认框
- 手动检查无更新时弹“已是最新版本”
- 手动检查失败时弹错误

测试中用 fake emitter/fake updater，避免依赖真实网络。

**Step 5: 运行 `app-updater` 测试，确认失败**

Run:
```powershell
npm run test -- src/main/app-updater.test.ts
```

Expected:
- FAIL，文件或实现不存在

**Step 6: 实现最小 `app-updater.ts`**

建议结构：

```ts
export function createAppUpdater(options: CreateAppUpdaterOptions): AppUpdaterController {
  let state: AppUpdateState = { kind: "idle" };
  let lastCheckSource: "auto" | "manual" = "auto";

  const setState = (next: AppUpdateState) => {
    state = next;
    options.broadcast(next);
  };

  options.autoUpdater.autoDownload = true;

  options.autoUpdater.on("checking-for-update", () => {
    setState({ kind: "checking" });
  });

  options.autoUpdater.on("update-not-available", () => {
    setState({ kind: "idle" });
  });

  options.autoUpdater.on("update-available", (info: { version: string }) => {
    setState({ kind: "downloading", version: info.version, percent: 0 });
  });

  options.autoUpdater.on("download-progress", (progress: { percent: number }) => {
    const current = state.kind === "downloading" ? state : { kind: "downloading", version: "", percent: 0 };
    setState({ ...current, percent: progress.percent });
  });
}
```

**Step 7: 在 `main.ts` 接线**

接线目标：
- whenReady 后初始化 updater
- 通过 `broadcastToWindows(APP_UPDATE_STATE_EVENT, state)` 广播状态
- 接收菜单命令 `check-for-updates`
- 注册 `CHECK_FOR_APP_UPDATES_CHANNEL`

**Step 8: 补 `main.test.ts` 的字符串级接线断言**

例如断言 `main.ts` 包含：

```ts
createAppUpdater({
  runtimeMode: resolveAppRuntimeMode(process.env),
```

和：

```ts
broadcastToWindows(APP_UPDATE_STATE_EVENT, state)
```

**Step 9: 运行 main 层相关测试**

Run:
```powershell
npm run test -- src/main/application-menu.test.ts src/main/app-updater.test.ts src/main/main.test.ts
```

Expected:
- PASS

**Step 10: 提交本任务**

```bash
git add src/main/app-updater.ts src/main/app-updater.test.ts src/main/main.ts src/main/main.test.ts src/main/application-menu.ts src/main/application-menu.test.ts src/shared/menu-command.ts
git commit -m "feat: add main-process app updater"
```

---

## Task 3: 扩展 preload 契约与 bridge

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.contract.test.ts`
- Modify: `src/preload/preload.test.ts`

**Step 1: 先写 preload contract 断言**

在 `src/preload/preload.contract.test.ts` 中新增：

```ts
void api.checkForUpdates();
expect(invoke.mock.calls).toContainEqual([CHECK_FOR_APP_UPDATES_CHANNEL]);
```

以及事件转发测试：

```ts
const updateListener = vi.fn();
const detachUpdate = api.onAppUpdateState(updateListener);
expect(on).toHaveBeenCalledWith(APP_UPDATE_STATE_EVENT, expect.any(Function));
```

**Step 2: 运行 preload contract 测试，确认失败**

Run:
```powershell
npm run test -- src/preload/preload.contract.test.ts src/preload/preload.test.ts
```

Expected:
- FAIL，API 尚未暴露

**Step 3: 在 `preload.ts` 增加最小 bridge**

新增：

```ts
checkForUpdates: (): Promise<void> => ipcRenderer.invoke(CHECK_FOR_APP_UPDATES_CHANNEL),
onAppUpdateState: (listener: (state: AppUpdateState) => void) => {
  const handler = (_event: unknown, state: AppUpdateState) => listener(state);
  ipcRenderer.on(APP_UPDATE_STATE_EVENT, handler);
  return () => ipcRenderer.off(APP_UPDATE_STATE_EVENT, handler);
}
```

并导出 preload 侧 `AppUpdateState` 类型别名。

**Step 4: 运行 preload 测试**

Run:
```powershell
npm run test -- src/preload/preload.contract.test.ts src/preload/preload.test.ts
```

Expected:
- PASS

**Step 5: 提交本任务**

```bash
git add src/preload/preload.ts src/preload/preload.contract.test.ts src/preload/preload.test.ts
git commit -m "feat: expose app update bridge"
```

---

## Task 4: 在 renderer 状态条展示下载中更新提示

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/app.autosave.test.ts`
- Modify: `src/renderer/styles/app-ui.css`

**Step 1: 先在 renderer 测试中写状态条断言**

在 `src/renderer/app.autosave.test.ts` 补三个场景：
- 默认不显示更新提示
- 收到 `downloading` 事件后显示 `正在下载更新…`
- 收到 `downloading + percent` 后显示百分比
- 收到 `downloaded` 或 `idle` 后提示消失

示例断言：

```ts
expect(statusStrip?.textContent).not.toContain("正在下载更新");
expect(statusStrip?.textContent).toContain("正在下载更新 42%");
```

**Step 2: 运行 renderer 测试，确认失败**

Run:
```powershell
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- FAIL，当前没有更新状态订阅和提示文案

**Step 3: 在 `App.tsx` 中新增更新状态订阅**

实现建议：

```ts
const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({ kind: "idle" });

useEffect(() => {
  return yulora.onAppUpdateState((nextState) => {
    setAppUpdateState(nextState);
  });
}, [yulora]);
```

计算展示文案：

```ts
const updateStatusLabel =
  appUpdateState.kind === "downloading"
    ? appUpdateState.percent >= 1
      ? `正在下载更新 ${Math.round(appUpdateState.percent)}%`
      : "正在下载更新…"
    : null;
```

在底部状态条中按条件插入：

```tsx
{updateStatusLabel ? <p className="update-status">{updateStatusLabel}</p> : null}
```

**Step 4: 在 `app-ui.css` 增加样式**

最小样式目标：

```css
.update-status {
  margin: 0;
  color: color-mix(in srgb, var(--yulora-text-strong) 78%, var(--yulora-text-subtle));
  font-size: 0.84rem;
  letter-spacing: 0.005em;
}
```

**Step 5: 运行 renderer 测试**

Run:
```powershell
npm run test -- src/renderer/app.autosave.test.ts
```

Expected:
- PASS

**Step 6: 提交本任务**

```bash
git add src/renderer/editor/App.tsx src/renderer/app.autosave.test.ts src/renderer/styles/app-ui.css
git commit -m "feat: show update download status in status bar"
```

---

## Task 5: 打通真实发布脚本与本地验证说明

**Files:**
- Modify: `package.json`
- Modify: `docs/plans/2026-04-17-windows-auto-update-design.md`
- Create or Modify: `docs/test-cases.md`（若仓库存在则更新，否则在任务总结中记录）

**Step 1: 在 `package.json` 增加发布脚本**

建议新增：

```json
"release:win": "npm run build && npm run generate:icons && electron-builder --config electron-builder.json --win --x64 --publish always"
```

**Step 2: 记录真实发版前置条件**

在设计文档或测试说明中写明：
- 需要设置 `GH_TOKEN`
- GitHub Release 应为公开仓库
- 只在安装版中验证自动更新

**Step 3: 运行静态闸门**

Run:
```powershell
npm run lint
```

Expected:
- PASS

**Step 4: 运行类型检查**

Run:
```powershell
npm run typecheck
```

Expected:
- PASS

**Step 5: 运行完整测试**

Run:
```powershell
npm run test
```

Expected:
- PASS

**Step 6: 运行构建**

Run:
```powershell
npm run build
```

Expected:
- PASS

**Step 7: 人工验收**

1. 安装旧版本，例如 `0.1.0`
2. 发布新版本，例如 `0.1.1` 到 GitHub Releases
3. 启动旧版本
4. 验证启动后自动检查
5. 验证底部状态条出现 `正在下载更新`
6. 验证下载完成后出现安装确认框
7. 点击 `稍后`，应用继续正常运行
8. 再次触发更新安装，点击 `立即重启更新`
9. 验证升级后的版本号为新版本

**Step 8: 提交本任务**

```bash
git add package.json docs/plans/2026-04-17-windows-auto-update-design.md
git commit -m "docs: capture windows auto update release flow"
```

---

## Recommended Execution Order

1. Task 1: 共享协议与发布配置
2. Task 2: main 更新服务与菜单入口
3. Task 3: preload bridge
4. Task 4: renderer 状态条提示
5. Task 5: 发布脚本与完整验证

原因：
- 先定协议和依赖
- 再把主进程更新控制打通
- 然后开放桥接
- 最后接 UI
- 收尾时再跑整体验证与发布说明

---

## Verification Commands

分阶段验证：

- Main:
  - `npm run test -- src/main/application-menu.test.ts src/main/app-updater.test.ts src/main/main.test.ts`
- Preload:
  - `npm run test -- src/preload/preload.contract.test.ts src/preload/preload.test.ts`
- Renderer:
  - `npm run test -- src/renderer/app.autosave.test.ts`
- Full gate:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`

---

## Notes For Implementation

- `autoUpdater` 的 provider 配置应优先走 `electron-builder` 产出的内建配置，不要在第一版把 feed URL 硬编码散落到业务代码中。
- `app-updater.ts` 必须保证多次检查不会造成并发检查冲突，必要时加简单的 `isChecking` 守卫。
- 状态条提示只用于“下载中”，不要把“检查中”“下载完成”“失败”全部塞进去，否则会让状态条变成噪音面板。
- 若后续切换到自建源，优先保持 `src/shared/app-update.ts` 与 renderer 使用方式不变，只替换 main 端 provider 配置。

---

Plan complete and saved to `docs/plans/2026-04-17-windows-auto-update-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - 我在当前会话里按任务逐步实现、验证、再继续下一步。

**2. Parallel Session (separate)** - 另开一个执行会话，按 `executing-plans` 流程分阶段落地。

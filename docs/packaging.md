# Yulora 打包说明

## Windows 本地打包

当前仓库已经提供 Windows 本地打包入口，可生成可安装的 NSIS `.exe`。

### 前置条件

- Windows
- 已安装 Node.js 与 npm
- 已在仓库根目录执行 `npm install` 或 `npm ci`

### 品牌素材来源

- 已提交的唯一图标源文件位于 `assets/branding/`
- 当前包含：
  - `assets/branding/yulora_logo_light.svg`
  - `assets/branding/yulora_logo_dark.svg`
- 生成出来的 PNG / ICO 不提交进仓库，只作为打包时的临时产物

### 执行命令

```bash
npm run package:win
```

或使用 `tools/` 目录下的批处理入口：

```bat
tools\package-win.bat
```

这条命令会依次执行：

1. `npm run build`
2. `npm run generate:icons`
3. `node scripts/build-win-release.mjs package`

### 正式发版元数据

Windows 正式发版额外依赖两份元数据：

- `package.json` 中的 `version`
- `release-metadata/release-notes.json`

其中 `release-metadata/release-notes.json` 是 GitHub Release 标题与正文的唯一输入，推荐结构：

```json
{
  "version": "0.1.2",
  "title": "Yulora 0.1.2 Release",
  "body": "### 本次更新\n\n- ...\n- ..."
}
```

约束：

- 正式发版前必须同步更新 `package.json` 与 `release-metadata/release-notes.json` 的版本号
- `release:win` 会在真正发布前校验这两个版本是否一致
- 不要再把 GitHub Release 正文硬编码到 `scripts/build-win-release.mjs`

### 图标生成产物

`npm run generate:icons` 会按需生成：

- `build/icons/light/icon-32.png`
- `build/icons/light/icon-64.png`
- `build/icons/light/icon-128.png`
- `build/icons/light/icon-256.png`
- `build/icons/light/icon-512.png`
- `build/icons/light/icon.ico`
- `build/icons/dark/` 下对应的同名产物

其中 `light` 版本会作为当前 Windows 打包默认图标。

当前仓库会在专用的 Windows 打包脚本中于 `electron-builder` 完成后补写应用主程序 `Yulora.exe` 的图标，并带重试保护，因此安装器和安装后的应用都会使用同一套正式图标，同时避免 Windows 上对 `.exe` 做二次资源写入时的偶发锁文件失败。

## Windows GitHub Release 发版

当前仓库已经提供 Windows GitHub Release 发版入口：

```bash
npm run release:win
```

或使用 `tools/` 目录下的批处理入口：

```bat
tools\release-win.bat
```

这条命令会依次执行：

1. `npm run build`
2. `npm run generate:icons`
3. `node scripts/build-win-release.mjs release`

其中发布脚本会：

1. 清理本地 `release/` 目录
2. 用程序化 `electron-builder` 生成 NSIS 安装包与 `latest.yml`
3. 以重试方式补写 `Yulora.exe` 图标
4. 读取 `release-metadata/release-notes.json`，并校验其版本号与 `package.json` 一致
5. 使用 `GH_TOKEN` / `GITHUB_TOKEN`，或回退到本机 `git credential fill` 中的 GitHub 凭据
6. 创建或复用 `v<version>` GitHub Release，并以元数据中的标题和正文同步 Release 页面
7. 上传：
   - `latest.yml`
   - `Yulora-Setup-<version>.exe`
   - `Yulora-Setup-<version>.exe.blockmap`

## macOS 预留入口

`tools/` 目录下还提供了两个 macOS 入口：

```bash
./tools/package-macos.sh
./tools/release-macos.sh
```

其中：

- `./tools/package-macos.sh` 会先做 Node/npm 与平台检查，再调用 `npm run package:mac`
- `npm run package:mac` 会执行 `build`、`generate:icons`，然后用 `electron-builder --mac --dir` 产出本地调试用的 unpacked `.app`
- `./tools/release-macos.sh` 目前仍是预留入口，后续补上 `.dmg` / `.zip`、签名、notarize 与正式发版链路时继续沿用

未来 macOS 正式发版也应复用同一份 `release-metadata/release-notes.json`，避免不同平台各自维护一份 Release 正文。

### 产物输出

打包产物输出到：

```text
release/
```

### 当前限制

- 当前 macOS 只覆盖本地 unpacked `.app`，不包含 `.dmg` / `.zip`
- macOS `.dmg` / `.zip` 仍属于 `TASK-038` 后续切片
- 当前未配置正式开发者签名；本地 `package:mac` 会在可用时回退到 ad-hoc 签名
- macOS `.icns` 仍未生成

### 后续扩展位

- Windows / macOS 代码签名
- macOS `.dmg` / `.zip` 打包产物
- `.icns` 生成与安装器视觉定制

## Package Size Guardrails

Current Windows packaging keeps the installer lean without changing editor behavior:

- Keep only the Electron locales for `en-US`, `zh-CN`, and `zh-TW`.
- Exclude generated declaration files under `dist-electron/` from packaged output.
- Exclude generated source maps under `dist-cli/` from packaged output.
- Treat renderer-only libraries such as `react`, `react-dom`, `@codemirror/*`, and `micromark` as build-time dependencies so Vite bundles them instead of copying them into packaged runtime `node_modules`.

If Yulora later adds first-party UI localization for more languages, add the matching Electron locale back to `electron-builder.json` before shipping that language.

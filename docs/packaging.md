# FishMark 打包说明

## Windows 本地打包

当前仓库已经提供 Windows 本地打包入口，可生成可安装的 NSIS `.exe`。

### 前置条件

- Windows
- 已安装 Node.js 与 npm
- 已在仓库根目录执行 `npm install` 或 `npm ci`

### 品牌素材来源

- 已提交的唯一图标源文件位于 `assets/branding/`
- 当前包含：
  - `assets/branding/fishmark_logo_light.svg`
  - `assets/branding/fishmark_logo_dark.svg`
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
  "title": "FishMark 0.1.2 Release",
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

其中 `light` 版本会作为当前 Windows 与 macOS 打包默认图标。

当前仓库会在专用的 Windows 打包脚本中于 `electron-builder` 完成后补写应用主程序 `FishMark.exe` 的图标，并带重试保护，因此安装器和安装后的应用都会使用同一套正式图标，同时避免 Windows 上对 `.exe` 做二次资源写入时的偶发锁文件失败。

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
3. 以重试方式补写 `FishMark.exe` 图标
4. 读取 `release-metadata/release-notes.json`，并校验其版本号与 `package.json` 一致
5. 使用 `GH_TOKEN` / `GITHUB_TOKEN`，或回退到本机 `git credential fill` 中的 GitHub 凭据
6. 创建或复用 `v<version>` GitHub Release，并以元数据中的标题和正文同步 Release 页面
7. 上传：
   - `latest.yml`
   - `FishMark-Setup-<version>.exe`
   - `FishMark-Setup-<version>.exe.blockmap`

## macOS 预留入口

`tools/` 目录下还提供了两个 macOS 入口：

```bash
./tools/package-macos.sh
./tools/release-macos.sh
```

其中：

- `./tools/package-macos.sh` 会先做 Node/npm 与平台检查，再调用 `npm run package:mac`
- `npm run package:mac` 会执行 `build`、`generate:icons`，然后用 `electron-builder --mac --dir` 产出本地调试用的 unpacked `.app`
- `./tools/release-macos.sh` 会先做 Node/npm 与平台检查，再调用 `npm run release:mac`
- `npm run release:mac` 会执行 `build`、`generate:icons`，然后用 `scripts/build-mac-release.mjs release` 产出正式 macOS 发布资产并上传到 GitHub Release

macOS 正式发版复用同一份 `release-metadata/release-notes.json`，避免不同平台各自维护一份 Release 正文。

## macOS GitHub Release 发版

当前仓库提供 macOS GitHub Release 发版入口：

```bash
npm run release:mac
```

或使用 `tools/` 目录下的 shell 入口：

```bash
./tools/release-macos.sh
```

这条命令会依次执行：

1. `npm run build`
2. `npm run generate:icons`
3. `node scripts/build-mac-release.mjs release`

其中发布脚本会：

1. 校验当前平台必须是 macOS
2. 读取 `release-metadata/release-notes.json`，并校验其版本号与 `package.json` 一致
3. 要求存在 Developer ID Application 签名材料
4. 要求存在 Apple notarization 凭据
5. 清理本地 `release/` 目录
6. 用 `electron-builder` 生成 arm64 `.dmg`、`.zip` 和 `latest-mac.yml`
7. 使用 `GH_TOKEN` / `GITHUB_TOKEN`，或回退到本机 `git credential fill` 中的 GitHub 凭据
8. 创建或复用 `v<version>` GitHub Release，并以元数据中的标题和正文同步 Release 页面
9. 上传：
   - `latest-mac.yml`
   - `FishMark-<version>-arm64.dmg`
   - `FishMark-<version>-arm64.zip`
   - `.dmg.blockmap`（若 `electron-builder` 生成）

macOS 正式发布要求满足以下任一组 notarization 凭据：

- `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`
- `APPLE_KEYCHAIN_PROFILE`（可选配 `APPLE_KEYCHAIN`）

签名材料要求满足以下任一条件：

- `CSC_LINK` 与 `CSC_KEY_PASSWORD`
- `CSC_NAME`
- 当前 Keychain 中可用的 `Developer ID Application` 证书

## macOS Beta DMG 发版

如果还没有 Apple Developer ID 签名和 notarization 凭据，可以先发布明确标记为 beta 的 ad-hoc signed DMG：

```bash
npm run release:mac:beta
```

这条命令会依次执行：

1. `npm run build`
2. `npm run generate:icons`
3. `node scripts/build-mac-release.mjs beta`

其中 beta 发布脚本会：

1. 读取 `release-metadata/release-notes.json`，并校验其版本号与 `package.json` 一致
2. 清理本地 `release/` 目录
3. 用 `electron-builder` 生成 Apple Silicon `FishMark-<version>-arm64.dmg`
4. 使用 ad-hoc signing，跳过 Developer ID 签名、notarization、`.zip` 和 `latest-mac.yml`
5. 使用 `GH_TOKEN` / `GITHUB_TOKEN`，或回退到本机 `git credential fill` 中的 GitHub 凭据
6. 创建或复用 `v<version>-mac-beta` GitHub prerelease
7. 上传：
   - `FishMark-<version>-arm64.dmg`
   - `.dmg.blockmap`（若 `electron-builder` 生成）

beta DMG 是测试分发包，不接入自动更新，也不标记为 GitHub latest。它不做 Apple notarization，用户首次打开时可能需要在 macOS System Settings 中手动允许。

### 通过 GitHub Actions 发布 macOS Beta

Windows 开发机可以通过 GitHub Actions 的 macOS runner 发布 beta DMG，不需要 Apple Developer ID 证书或 notarization 凭据。

仓库提供手动触发的 workflow：

```text
.github/workflows/release-macos-beta.yml
```

使用步骤：

1. 在 Windows 上先同步 `package.json` 与 `release-metadata/release-notes.json` 的版本号，并推送到 `main`。
2. 打开 GitHub 仓库的 Actions 页面。
3. 选择 `Release macOS Beta`。
4. 点击 `Run workflow`，分支选择 `main`。

该 workflow 会在 `macos-latest` 上执行：

1. `npm ci`
2. release metadata 版本一致性校验
3. `npm run release:mac:beta`

发布结果会写入 `v<version>-mac-beta` prerelease，并上传 Apple Silicon beta DMG 及 `.dmg.blockmap`（若 `electron-builder` 生成）。

### 产物输出

打包产物输出到：

```text
release/
```

### 当前限制

- `package:mac` 仍只覆盖本地 unpacked `.app`
- `release:mac` 只发布 Apple Silicon `arm64` 产物
- `release:mac:beta` 只发布 ad-hoc signed、未公证的 Apple Silicon `.dmg`
- 正式发版必须配置 Developer ID 签名与 notarization 凭据
- macOS `.icns` 仍未生成

### 后续扩展位

- Windows / macOS 代码签名
- macOS `x64` 或 `universal` 打包产物
- `.icns` 生成与安装器视觉定制

## Package Size Guardrails

Current Windows packaging keeps the installer lean without changing editor behavior:

- Keep only the Electron locales for `en-US`, `zh-CN`, and `zh-TW`.
- Exclude generated declaration files under `dist-electron/` from packaged output.
- Exclude generated source maps under `dist-cli/` from packaged output.
- Treat renderer-only libraries such as `react`, `react-dom`, `@codemirror/*`, and `micromark` as build-time dependencies so Vite bundles them instead of copying them into packaged runtime `node_modules`.

If FishMark later adds first-party UI localization for more languages, add the matching Electron locale back to `electron-builder.json` before shipping that language.

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

或使用仓库根目录入口：

```bat
package-win.bat
```

这条命令会依次执行：

1. `npm run build`
2. `npm run generate:icons`
3. `electron-builder --config electron-builder.json --win --x64`

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

当前仓库会在 `afterPack` 阶段单独补写应用主程序 `Yulora.exe` 的图标，因此安装器和安装后的应用都会使用同一套正式图标。

## macOS 预留入口

仓库根目录还提供了一个预留入口：

```bash
./package-macos.sh
```

当前这个入口会先做基础环境检查，并明确提示 macOS 打包尚未接入正式实现。后续补上 `.dmg` / `.zip` 与 `.icns` 流程时，会继续沿用这个入口。

### 产物输出

安装器输出到：

```text
release/
```

### 当前限制

- 当前只覆盖 Windows 本地打包
- macOS `.dmg` / `.zip` 仍属于 `TASK-038` 后续切片
- 代码签名尚未配置
- 自动更新尚未配置
- macOS `.icns` 仍未生成

### 后续扩展位

- Windows / macOS 代码签名
- macOS 打包产物
- 自动更新接入
- `.icns` 生成与安装器视觉定制

## dev-app.bat
本地一键启动开发应用。启动前会同步依赖并执行 `dev:prepare`：清理旧产物、先完整生成 workspace / Electron / CLI 运行时，再启动各 watch 进程和 Electron，避免依赖包尚未生成时主进程进入错误状态；随后同步开发主题。

## package-macos.sh / package-win.bat
一键本地打包

## release-macos.sh / release-win.bat
一键发布，慎点！

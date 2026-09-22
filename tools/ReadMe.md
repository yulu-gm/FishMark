## dev-app.bat
本地一键启动开发应用。启动前会同步依赖、清理旧的生成产物并同步开发主题，避免旧的 `dist-*` / workspace package 输出让 Electron 抢跑到新一轮 TypeScript 编译之前。

## package-macos.sh / package-win.bat
一键本地打包

## release-macos.sh / release-win.bat
一键发布，慎点！

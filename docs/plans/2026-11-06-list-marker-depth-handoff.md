# 无序列表 marker 层级交替

渲染态按实际嵌套层级对无序 marker 增加空心样式，源码展开时继续显示原 marker；有序/任务不受影响。独立 HTML 导出以递归列表树深度计算交替，不以源码空格计数。默认亮/暗主题通过 Electron 截图和 marker 几何检查；导出验证为结构测试，尚未做导出文件像素验收；自定义主题与 Windows 尚未完整验收。基线副本仍为 2063abc，需将补丁应用到真实 main 并复验。

后续已迁至基于完整 main `fbabfd7` 的 worktree；macOS Electron 视觉、列表退格及退出组合 5/5 通过，build/lint/typecheck 通过。完整测试另有 8 项解析基线失败及 1 项 macOS 临时路径断言失败。未验证 Windows 和导出文件实际像素。

独立导出后续已使用产品导出函数与实际应用样式生成 HTML 文件，在 Electron 打开并检查默认主题 marker 与截图；未覆盖原生保存对话框、自定义 glyph 主题及 Windows。

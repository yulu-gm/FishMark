# TASK-059 Clipboard Image Temporary Directory

日期：2026-05-30
状态：DEV_DONE

## 本轮完成内容

- 保留已保存 Markdown 文档的现有粘贴行为：图片继续写入文档同级 `assets/`，Markdown 插入相对路径。
- 支持未保存文档粘贴图片：图片写入有效临时图片目录，Markdown 插入绝对本地路径。
- 新增 `images.temporaryDirectory` 偏好设置；`null` 表示默认 `<userData>/temp/clipboard-images`。
- 设置页 File > 图片 支持选择临时图片目录和恢复默认目录。
- renderer 粘贴处理新增 fallback：DOM paste payload 没有图片项、也没有可粘贴文本时，会尝试调用 main clipboard image import。
- 延续截图热修复：main 写盘前验证编码图片字节，并在必要时使用 `clipboard.readImage().toPNG()` 输出有效 PNG。

## 主要改动文件

- `src/shared/clipboard-image-import.ts`
- `src/main/clipboard-image-import.ts`
- `src/main/temporary-image-directory.ts`
- `src/shared/preferences.ts`
- `src/shared/product-bridge.ts`
- `src/preload/preload.ts`
- `src/main/main.ts`
- `src/renderer/code-editor.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/editor/settings-view.tsx`
- `src/renderer/styles/settings.css`
- `docs/decision-log.md`
- `docs/test-report.md`

## 已验证内容

- `npm.cmd run test -- src/shared/preferences.test.ts src/main/clipboard-image-import.test.ts src/main/temporary-image-directory.test.ts src/preload/preload.contract.test.ts src/main/main.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts`
- `npm.cmd run test`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`

## 剩余风险

- 本轮不实现“保存文档时自动把临时图片迁移到文档 assets”的流程；临时图片路径会保持绝对路径。
- 设置页只保存目录路径，不主动探测目录权限；真实写入失败仍由粘贴导入流程返回错误提示。

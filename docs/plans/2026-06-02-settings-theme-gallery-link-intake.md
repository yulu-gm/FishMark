# Settings Theme Gallery Link Intake

## 背景

用户要求将主题页面链接 `https://yulu-gm.github.io/fishmark-themes/` 嵌入 app 设置页，并放在主题选择的下方。

## 范围

- 在设置页“外观 / 主题”的主题包选择区域下方增加主题页面链接。
- 链接点击必须走 FishMark 现有受控外链打开通道，不让 renderer 自行导航。
- 保持改动聚焦，不调整主题扫描、主题包安装或偏好存储行为。

## 验收要点

- 设置页主题选择下方可以看到“打开主题页面”链接。
- 点击链接调用 `openExternalLink("https://yulu-gm.github.io/fishmark-themes/")`。
- 设置页现有主题刷新、打开主题目录、主题切换行为不受影响。

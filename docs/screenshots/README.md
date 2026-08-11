# Screenshots 截图指引

README（英文主版与中文版）中的「截图」章节引用本目录的图片，目前标记为 *Coming soon*。
按下面的清单截图后放入本目录，并在两个 README 中替换引用即可。

## 需要的截图

| 文件 | 内容 | 建议尺寸 |
|---|---|---|
| `selection.png` | 网页中选中一段文字后，选区旁浮出「翻译 / 解读」工具栏 | ≥ 1280 宽 |
| `result.png` | 点击「解读」后，结果浮窗展示解读内容 | ≥ 1280 宽 |
| `popup.png` | 扩展弹窗（API Key 配置 + 模型设置） | 弹窗实际尺寸即可 |

## 怎么截

1. 本地加载扩展（`chrome://extensions/` → 开发者模式 → 加载已解压 → 选择仓库目录）
2. 打开任意网页选中文字，截图工具栏与结果浮窗（`selection.png` / `result.png`）
3. 点击工具栏扩展图标，截图弹窗（`popup.png`）
4. 放入本目录并提交

## README 中的引用位置

英文版 `README.md`：

```markdown
![Selection](docs/screenshots/selection.png)
![Result](docs/screenshots/result.png)
![Popup](docs/screenshots/popup.png)
```

中文版 `README.zh-CN.md` 同样替换「截图」章节内容。

> 提示：截图内容不要包含真实 API Key。弹窗截图前可先把 Key 输入框清空或保持脱敏状态。

<div align="center">

# 🐋 小鲸鱼助手 LittleWhale

**选中网页任意文字，用 DeepSeek 翻译与解读**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/zhaotianyi-source/littlewhale-extension)](https://github.com/zhaotianyi-source/littlewhale-extension/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/zhaotianyi-source/littlewhale-extension/ci.yml?branch=main)](https://github.com/zhaotianyi-source/littlewhale-extension/actions)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

基于 DeepSeek API 的 Chrome 扩展（Manifest V3）。在任意网页选中文字，选区旁立即浮出 **翻译 / 解读** 按钮——无需复制粘贴、无需切换标签页，小鲸鱼（DeepSeek 的虎鲸 IP）帮你把内容读透。

## ✨ 功能

- **选中即用**：鼠标（或 `Shift + 方向键`）选中文字，选区旁浮出工具栏
- **翻译**：输出通顺的简体中文译文
- **解读**：输出核心观点、背景信息、关键细节与启示
- **模型可配置**：默认 `deepseek-v4-flash` + `reasoning_effort=max`（最强思考），弹窗中可随时切换模型与智能水平
- **隐私设计**：API Key 仅存本机，绝不暴露给网页；可选「安全模式」仅存内存、不落盘
- **结果浮窗**：可滚动、可复制、`Esc` 关闭

## 📸 截图

_待补充：将截图放入 `docs/screenshots/` 后在此引用（如 `docs/screenshots/selection.png`、`docs/screenshots/popup.png`）。_

## 📦 安装

**要求**：Chrome（或 Chromium 内核浏览器）≥ 102（依赖 `chrome.storage.session`）。

1. 打开 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本仓库目录
4. 点击工具栏扩展图标 → 粘贴 DeepSeek API Key（自动保存）→ **测试连接** → 完成

> 在 [platform.deepseek.com](https://platform.deepseek.com) 创建 API Key。

## 🚀 使用

1. 打开任意网页，选中一段文字
2. 点击浮出工具栏上的 **翻译** 或 **解读**
3. 在结果浮窗中阅读——可复制，或点 ✕ / 按 `Esc` 关闭

## ⚙️ 配置

打开扩展弹窗：

| 配置项 | 说明 | 默认值 |
|---|---|---|
| API Key | DeepSeek API Key（`sk-...`），粘贴后自动保存 | — |
| 安全模式 | Key 仅保存在内存、不写磁盘（重启浏览器后需重新输入） | 关 |
| 模型 | 任意 DeepSeek 模型 ID，如 `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-chat` | `deepseek-v4-flash` |
| 智能水平 | `reasoning_effort`：`max` / `high` / `low`（v4 模型思考模式默认开启） | `max` |

## 🔒 隐私与安全

- **存储**：API Key 默认存于 `chrome.storage.local`（本机 Chrome 配置目录，明文，不同步到任何云账户）。开启「安全模式」后仅存内存（`chrome.storage.session`），浏览器重启即清空。
- **网络**：Key 仅作为 `Authorization` 头发往 `https://api.deepseek.com`（`host_permissions` 已限定该域名），不会发给任何其它站点。
- **隔离**：网页 JS 无法访问扩展存储、无法触发扩展请求；其它扩展按扩展 ID 隔离。content script 从不读取 Key。
- **无追踪**：无统计、无遥测、无任何第三方请求。
- **建议**：定期在 platform.deepseek.com 查看用量；怀疑泄露立即吊销并轮换 Key；开启磁盘加密（FileVault）保护静态文件。

## ❓ 常见问题

<details>
<summary><b>为什么提示「尚未配置 API Key」？</b></summary>

打开扩展弹窗粘贴 Key 即可——粘贴后自动保存，状态栏会显示 `已保存：sk-****xxxx`。保存后重试。
</details>

<details>
<summary><b>如何修改模型 / 智能水平？</b></summary>

打开弹窗 →「模型设置」：修改模型 ID、选择智能水平，自动保存。
</details>

<details>
<summary><b>选中了文字但没弹工具栏？</b></summary>

content script 只在主框架运行。若文本在 iframe 内（如内嵌文档），工具栏可能不出现——属已知限制。
</details>

<details>
<summary><b>Key 会发给 TapTap 或其它站点吗？</b></summary>

不会。Key 只发往 `api.deepseek.com`。
</details>

<details>
<summary><b>报错 HTTP 401 / 429 / 400？</b></summary>

`401`：Key 无效或已吊销；`429`：频率限制或余额不足；`400 模型不存在`：模型 ID 拼写有误。以弹窗报错详情为准。
</details>

## 🛠 开发

```bash
npm install     # 安装开发依赖（jsdom）
npm run check   # 检查所有扩展 JS 文件语法
npm test        # 运行 UI 回归测试（jsdom）
```

回归测试（`tests/content-ui.test.js`）模拟「选中 → 工具栏 → 结果浮窗」完整流程，防止显隐回归。CI 会在每次 push 和 PR 时自动运行全部检查。

## 🤝 参与贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。发现 bug 或有想法？请到 [Issues](https://github.com/zhaotianyi-source/littlewhale-extension/issues) 提交。

## 📄 许可证

[MIT](LICENSE) © [zhaotianyi-source](https://github.com/zhaotianyi-source)

# 小鲸鱼助手 LittleWhale（DeepSeek 选中翻译与解读）

基于 Manifest V3 的 Chrome 扩展，小鲸鱼（DeepSeek 的虎鲸 IP）帮你把选中的内容读透。

## 功能：选中文本 → 翻译 / 解读

- 在任意网页上用鼠标选中文字（或 `Shift + 方向键` 选中），选区旁会浮出 **翻译** / **解读** 两个按钮。
- 点击后通过后台 Service Worker 调用 **DeepSeek API**，结果在浮窗中展示，支持滚动、复制、关闭。
- 翻译：输出简体中文译文；解读：输出核心观点、背景信息、关键细节。
- **默认模型 `deepseek-v4-flash`，智能水平（`reasoning_effort`）默认 `max`**；均可在弹窗「模型设置」中修改，修改自动保存。
- API Key 只保存在 `chrome.storage.local`（本机浏览器）或安全模式下的内存中，由后台请求，不会暴露给网页。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 打开右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本目录（`ChromePlug`）
4. 点击工具栏中的扩展图标，在弹窗中粘贴 DeepSeek API Key（自动保存）并测试连接

## 目录结构

```
ChromePlug/
├── manifest.json      # MV3 声明
├── background.js      # Service Worker：DeepSeek API 调用
├── content.js         # 选中文本浮出工具栏 + 结果浮窗
├── content.css        # 注入页面的 UI 样式
├── popup.html         # 弹窗页面（API Key 配置 + 模型设置）
├── popup.js           # 弹窗逻辑
└── icons/             # 扩展图标（16/32/48/128）
```

## 安全说明

- **存储**：默认将 API Key 存在 `chrome.storage.local`（本机 Chrome 配置目录，明文，不会同步到 Google 账户）。勾选弹窗中的「安全模式」后，Key 只保存在内存（`chrome.storage.session`），**不写入磁盘**，浏览器重启后需重新输入。
- **网络**：Key 仅作为 `Authorization` 头发往 `https://api.deepseek.com`（`host_permissions` 已限定），不会发给任何其它站点。
- **隔离**：网页 JS 无法访问扩展存储、无法触发扩展请求；其它扩展按扩展 ID 隔离。content script 从不读取 Key。
- **建议**：定期在 [platform.deepseek.com](https://platform.deepseek.com) 查看用量；怀疑泄露时直接吊销并重新生成 Key；本机开启 FileVault/磁盘加密可降低静态文件被读取的风险。

## 说明

- API Key 在 [platform.deepseek.com](https://platform.deepseek.com) 创建，**粘贴到弹窗后会自动保存**（也可点「立即保存」），保存后弹窗会显示已保存状态。
- 模型与智能水平在弹窗「模型设置」中修改：`reasoning_effort` 可选 `max / high / low`（v4 系列模型思考模式默认开启）。
- 选中功能运行在页面主框架；若某些网站（如 iframe 内嵌文档）不生效，属正常限制。
- 超长文本会被截断到 20000 字符再发送。
- 常见错误提示：`HTTP 401`（Key 无效）、`HTTP 429`（额度/频率限制）、`400 模型不存在`（模型名拼写有误）、未配置 Key 时会在浮窗提示去弹窗配置。

# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-08-11

### 新增
- 模型设置：可配置模型与智能水平（`reasoning_effort`：max / high / low），修改自动保存
- 默认模型切换为 `deepseek-v4-flash`，智能水平默认 `max`
- 「安全模式」：API Key 仅保存在内存（`chrome.storage.session`），不写入磁盘，浏览器重启后需重新输入
- API Key 粘贴即自动保存（防抖），弹窗显示已保存状态（脱敏预览）

### 修复
- 修复工具栏/结果浮窗 `hidden` 属性被 `display: flex` 覆盖导致无法关闭的问题（`[hidden]` 兜底规则）
- 修复点击按钮后选区被清除导致请求失败的问题（弹出时缓存选区文本与位置）
- 优化未配置 API Key 时的报错提示，附带操作指引

### 变更
- 插件更名为「小鲸鱼助手 LittleWhale」
- TapTap 链接工具从本插件拆分，不再随本仓库分发

## [1.1.0] - 2026-08-11

### 新增
- 安全模式（API Key 仅存内存）

### 修复
- 修复选中工具栏无法关闭的问题

## [1.0.0] - 2026-08-11

### 新增
- 选中网页文本浮出「翻译 / 解读」工具栏，调用 DeepSeek API
- 结果浮窗：滚动、复制、关闭
- 弹窗配置：API Key 存储（`chrome.storage.local`）、测试连接
- TapTap Maker 链接工具：拼接 `bypassAuth` 打开、提取项目 ID 打开 games 直链

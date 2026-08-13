# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.3.1] - 2026-08-11

### 修复
- 修复浮层被页面自身弹窗压住的问题（如 GitHub 的 Dialog）：浮层容器改用非模态 `<dialog>`，通过 `show()` 进入浏览器 top layer，压过任何仅靠 z-index 的页面元素；工具栏/结果卡/toast 全部隐藏时自动退出 top layer

## [1.3.0] - 2026-08-11

### 新增
- 结果浮窗支持 Markdown 渲染（标题、列表/嵌套列表、任务列表、引用、代码块、表格、链接等）
- 请求取消：结果卡「取消/关闭」会中止进行中的 DeepSeek 请求（`AbortController`），并丢弃过期响应
- 结果卡片粘性展示：加载中与完成后，点击空白 / Esc / 滚动不再关闭，仅手动关闭

### 修复
- 修复连点/取消后的请求竞态：旧响应不再覆盖新结果（`requestSeq`）
- 修复加载期选区工具栏与结果卡叠层；发起请求后仅保留结果卡
- 加固 Markdown 链接消毒（拒绝 `javascript:` / 控制字符等）；原始 HTML 一律转义
- 弱化 `_斜体_` 误伤 `snake_case`；支持剥掉模型误包的最外层 ` ```markdown ` 代码围栏

### 变更
- 页面浮层与弹窗 UI 改为更克制的扁平风格
- 结果卡采用稳定视口定位，避免超高内容时溢出屏幕

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

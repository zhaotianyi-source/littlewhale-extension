# Security Policy

## 报告安全漏洞

本项目涉及用户 API Key 等敏感信息，我们非常重视安全问题。如果发现漏洞，请**不要**公开提交 issue，而是：

- 通过 GitHub 私信联系仓库维护者，或
- 在 Issue 中仅描述"存在安全问题，需要私下沟通"

## 安全模型（简要）

- API Key 仅存储于本机（`chrome.storage.local` 或安全模式下的内存 `chrome.storage.session`）
- Key 仅发往 `https://api.deepseek.com`（`host_permissions` 已限定）
- content script 不读取、不接触 API Key
- 本项目无任何第三方网络请求、无统计埋点

## 响应承诺

- 确认漏洞后 7 天内给出修复计划
- 修复发布后将进行版本打标与 Release 公告

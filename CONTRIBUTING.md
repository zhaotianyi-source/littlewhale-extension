# Contributing

感谢你愿意为「小鲸鱼助手 LittleWhale」贡献代码！请先阅读以下约定。

## 开发环境

- Node.js ≥ 18（运行回归测试与语法检查）
- Chrome ≥ 102（手动验证扩展行为）

```bash
npm install     # 安装开发依赖
npm run check   # JS 语法检查
npm test        # UI 回归测试（jsdom）
```

## 工作流

1. Fork 本仓库并创建功能分支：`git checkout -b feat/your-feature`
2. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
   - `feat:` 新功能 / `fix:` 修复 / `docs:` 文档 / `refactor:` 重构 / `test:` 测试 / `chore:` 杂项
3. 修改后本地跑通 `npm run check` 与 `npm test`
4. 推送分支并提交 Pull Request，按 PR 模板填写

## 代码约定

- 扩展脚本为无构建步骤的纯 JS（MV3），保持 ES 语法与现有代码风格一致
- 修改 `content.js` 的 UI 逻辑时，请同步在 `tests/content-ui.test.js` 中补充回归用例
- 用户可见的改动请同步更新 `README.md` / `README.zh-CN.md` 与 `CHANGELOG.md`
- 不要提交任何真实 API Key；新增敏感信息处理时请同步更新「隐私与安全」文档

## 提问

有疑问或想先讨论方案，欢迎开 issue 交流，不要直接发 PR 大改。

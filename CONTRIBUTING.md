# 参与共同开发

欢迎通过 [Issues](https://github.com/liyangwei52-ops/amazon-visual-workbench-community/issues) 反馈问题、讨论功能，通过 [Pull Requests](https://github.com/liyangwei52-ops/amazon-visual-workbench-community/pulls) 提交改动。维护者审核后合并到 `main`；网站发布单独处理。

## 先了解项目

先读 [AGENTS.md](AGENTS.md)、[快速入口](AI_QUICKSTART.md)、[接手指南](docs/AI_HANDOFF.md)和[最新进度](docs/progress.md)，再查看相关代码。修改 Next.js 代码前阅读安装版本的 `node_modules/next/dist/docs/`。

当前功能以源码和最新文档为准。历史多语言 README 与《项目概述.md》不代表当前产品合同。

## Fork 并在本地运行

在 GitHub 点击本项目的 **Fork**，创建自己的副本。以下命令中将 `YOUR_GITHUB_USERNAME` 换为自己的 GitHub 用户名：

请从公开的 `amazon-visual-workbench-community` 开始。旧开发仓库保持私有，不要把其旧分支或完整历史推送到公开库；更新公开代码也应在本公开仓库的干净历史上提交。

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/amazon-visual-workbench-community.git
cd amazon-visual-workbench-community
git remote add upstream https://github.com/liyangwei52-ops/amazon-visual-workbench-community.git
git switch -c codex/your-change
npm ci
npm run dev
```

使用 Node.js ≥20.9.0，项目最近验证环境为 Node.js 24；依赖以 `package-lock.json` 为准。启动后访问 `http://localhost:3000`。仅查看界面和运行下方离线检查不需要填写 API Key。

需要手动分析或生图时，在网页 `/settings` 填写自己的 API 配置。服务端代理的 HTTPS 允许列表配置见[本地运行说明](README.md#本地运行)，个人环境写入不提交的 `.env.local`。API 配置、草稿、图片与套装保存在各自浏览器，不随 Fork 或提交同步。

## 修改与验证

每个 PR 尽量围绕一个问题，描述触发条件、改前/改后行为和验证结果。大的功能或协议调整可以先在 Issue 讨论。

以下检查使用本机依赖、合成数据和本地逻辑，不请求真实模型：

```sh
node scripts/run-ts-test.cjs scripts/test-generation-batches.ts
node scripts/run-ts-test.cjs scripts/test-generation-selection.ts
node scripts/run-ts-test.cjs scripts/test-incremental-submission.ts
```

这三项只覆盖结果批次、选择和局部提交，不代表所有功能已验证。修改代码时，按[接手指南的验证表](docs/AI_HANDOFF.md#优先选择与修改相关的验证)选择相关检查；界面变化补充桌面和窄屏核对。可按范围运行 `npx eslint src` 和 `npm run build`，不要覆盖正在使用的构建目录。

`scripts/` 同时保留历史诊断脚本；部分依赖未上传的私人夹具、浏览器或真实付费接口，不能批量盲跑。运行前查看脚本，真实模型请求须获得明确授权；PR 中区分离线、拦截模拟、真实请求及未执行项目。

保留完整提示词、旧草稿/套装/队列兼容、栏目隔离和刷新不自动重发的边界。不要为验证清空用户数据，也不要增加自动付费重试。

重要功能更新同批核对 [AGENTS.md](AGENTS.md)、[README](README.md) 和 [progress](docs/progress.md)，在进度顶部写明原因、范围、实际验证、兼容与发布状态；架构或交接入口变化同时更新快速入口及接手指南。

## 提交 Pull Request

```sh
git add path/to/changed-file
git commit -m "fix: describe your change"
git push -u origin codex/your-change
```

在自己的 Fork 点击 **Compare & pull request**，目标选择 `liyangwei52-ops/amazon-visual-workbench-community:main`，填写 PR 模板。涉及界面时附使用合成素材的截图；维护者审核并决定合并，提交 PR 不会自动发布网站。

不要提交 API Key、令牌、`.env*`、`.vercel/`、浏览器配置、真实用户素材、测试日志、`verification/`、`backups/` 或构建产物。问题反馈与截图也应去掉这些信息；安全问题不要在公开 Issue 或 PR 粘贴凭据、私人数据或可直接利用的细节，使用仓库可用的私密报告渠道联系维护者。

## 来源与许可证状态

本项目基于 [imgx-studio/gpt-image-2-webui](https://github.com/imgx-studio/gpt-image-2-webui) 改造，保留原来源及历史。当前仓库与本项目所基于的上游快照未包含 `LICENSE`，本次公开协作不新增许可证；许可证另由维护者核对并明确。关于公开仓库与许可证的区别，见 [GitHub 许可说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。

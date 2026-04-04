# Astrbot Group Blog

Worker 端的群聊博客仓库。

目标不是做一个普通 dashboard，而是做一个“可长期浏览的群刊式数据博客”：

- 群首页展示长期趋势和群画像
- 历史日报作为归档页可长期浏览
- 登录后可以在多个已绑定群之间切换
- 插件负责上传结构化结果，Worker 负责持久化、渲染和展示

## 技术栈

- Astro SSR
- Cloudflare Workers
- React islands
- Tailwind 4
- 后续 UI 组件以 shadcn/ui 为主
- 图表后续使用 Apache ECharts

## 模板同步

日报 HTML 模板不直接硬编码在本仓库中，而是在 `build` 前从模板源仓库同步。

当前默认模板源配置写在 [template-source.config.json](./template-source.config.json)：

- Repo: `https://github.com/clown145/astrbot_plugin_qq_group_daily_analysis.git`
- Branch: `main`
- Subdir: `src/infrastructure/reporting/templates`

同步命令：

```bash
npm run sync:templates
```

`npm run build` 前会自动执行一次模板同步。

支持通过环境变量覆盖：

- `TEMPLATE_REPO_URL`
- `TEMPLATE_REPO_BRANCH`
- `TEMPLATE_REPO_SUBDIR`
- `TEMPLATE_TARGET_DIR`

## 命令

```bash
npm install
npm run sync:templates
npm run db:migrate
npm run build
npm run deploy
```

如果你用的是 Cloudflare Workers Builds，推荐在项目设置里配置：

- `Build command`: `npm run build`
- `Deploy command`: `npm run deploy`

这样每次部署前会自动执行 D1 migration。

## 部署与联调

详细部署、D1 初始化、bot 回调、插件接入说明见：

- [docs/deployment_and_integration.md](./docs/deployment_and_integration.md)

## 当前限制

当前这台 Android/Termux 机器无法运行 `workerd`，因此本地不能完整执行 Cloudflare 适配后的 `astro build`。这不影响仓库结构和代码编写，真正的构建与部署应在 Linux 服务器或 CI 上完成。

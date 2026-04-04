# Deployment And Integration

## 1. 当前已实现能力

- `POST /api/ingest`
  - 接收插件发送的 `blog_export_package_v1`
  - 写入 `D1`
  - 归档 `publish_payload`、`render_bundle`、完整 package 到 `R2`
  - 同时生成日报归档 HTML 并写入 `R2`
- `POST /api/auth/bind/start`
  - 网页端发起绑定，返回一次性绑定码
- `POST /api/auth/bind/verify`
  - bot 用服务端 secret 回调，确认绑定码已在目标群里由目标 QQ 发出
- `POST /api/auth/bind/finalize`
  - 网页端完成绑定并建立登录会话
- `POST /api/auth/login`
  - QQ + 密码登录
- `GET /api/auth/session`
  - 返回当前 Cookie 会话
- `POST /api/auth/logout`
  - 登出
- 页面：
  - `/`
  - `/login`
  - `/g/[slug]`
  - `/g/[slug]/archive`
  - `/g/[slug]/reports/[date-or-report-id]`

## 2. Cloudflare 资源

需要准备：

- `D1`
  - 数据库名建议：`astrbot-group-blog`
- `R2`
  - 桶名建议：`astrbot-group-blog-archive`
- `KV`
  - 命名空间建议：`astrbot-group-blog-cache`

### 2.1 wrangler 绑定

`wrangler.jsonc` 里需要配置：

- `BLOG_DB`
- `BLOG_ARCHIVE`
- `BLOG_CACHE`

Secrets 需要配置：

- `INGEST_SHARED_TOKEN`
- `BIND_CALLBACK_SECRET`
- `SESSION_SECRET`
- `PASSWORD_PEPPER`

## 3. D1 初始化与自动建表

当前版本不再要求在部署阶段执行 `wrangler d1 migrations apply`。

Cloudflare 后台设置：

1. `Build command`: `npm run build`
2. `Deploy command`: `npm run deploy`

仓库里现在提供：

```bash
npm run deploy
```

`npm run deploy` 现在只执行 `wrangler deploy`。

Worker 在运行时会自动检查 `blogs`、`report_assets` 等表是否存在；如果不存在，就会把仓库里的 SQL migration 自动执行到当前 D1 绑定上。

也就是说：

- 第一次部署不用手动建表
- 不需要手动执行 `wrangler d1 migrations apply`
- 首次访问数据库相关路由时，会自动完成 D1 初始化

当前 migration 文件：

- [migrations/0001_initial.sql](/data/data/com.termux/files/home/astrbot-group-blog/migrations/0001_initial.sql)
- [migrations/0002_report_assets.sql](/data/data/com.termux/files/home/astrbot-group-blog/migrations/0002_report_assets.sql)

## 4. 插件接入

插件端已经支持 `web` 输出格式，Worker 上传配置建议如下：

- `enable_web_blog = true`
- `worker_base_url = https://<your-worker-domain>`
- `worker_ingest_path = /api/ingest`
- `worker_upload_token = <same as INGEST_SHARED_TOKEN>`

上传请求：

- Method: `POST`
- URL: `/api/ingest`
- Header:
  - `Authorization: Bearer <INGEST_SHARED_TOKEN>`
  - `Content-Type: application/json`
- Body:
  - `blog_export_package_v1`

成功后返回：

- `urls.blog_url`
- `urls.archive_url`
- `urls.report_url`

## 5. Bot 绑定回调

当用户在网页上发起绑定后，Worker 会生成一次性绑定码。

用户需要在目标群里，用目标 QQ 给 bot 发送：

```text
/绑定博客 <bind_code>
```

bot 校验到消息后，应该回调 Worker：

- Method: `POST`
- URL: `/api/auth/bind/verify`
- Header:
  - `Authorization: Bearer <BIND_CALLBACK_SECRET>`
  - `Content-Type: application/json`

请求体：

```json
{
  "platform": "qq",
  "groupId": "123456789",
  "qqNumber": "987654321",
  "bindCode": "123456"
}
```

说明：

- `platform` 必须和 ingest 写入博客时的 `target.platform` 一致
- `groupId` 必须和 ingest 写入博客时的 `target.group_id` 一致
- `qqNumber` 必须是 bot 实际观测到的发信者 QQ，不信任网页提交值
- `bindCode` 是用户在网页上拿到的一次性绑定码

## 6. 登录流程

首次绑定：

1. 用户打开 `/login?blog=<slug>`
2. 调用 `/api/auth/bind/start`
3. 去群里发 `/绑定博客 <code>`
4. bot 调 `/api/auth/bind/verify`
5. 网页调用 `/api/auth/bind/finalize`
6. Worker 下发 `HttpOnly` Cookie，会话建立完成

后续登录：

1. 用户打开 `/login`
2. 调用 `/api/auth/login`
3. Worker 下发 `HttpOnly` Cookie
4. 前端调用 `/api/auth/session` 获取可访问群列表

## 7. 报告路由约定

日报详情页路由采用：

- `daily_snapshot`
  - `/g/:slug/reports/:snapshot_date`
- 其他报告
  - `/g/:slug/reports/:report_id`

这样可以避免多天报告、预览报告都撞到 `/latest`。

报告头像和其他大对象资产采用：

- `/g/:slug/assets/:reportId/:assetId`

Worker 在 ingest 时会把 `render_bundle.assets.avatars` 中的 `data_uri` 拆到 `R2`，并把 `render_context` 里的头像字段改写成上述资产 URL。

## 8. 模板来源

模板不会硬编码在仓库里，而是在构建前同步。

当前默认模板源：

- Repo: `https://github.com/clown145/astrbot_plugin_qq_group_daily_analysis.git`
- Branch: `main`
- Subdir: `src/infrastructure/reporting/templates`

命令：

```bash
npm run sync:templates
```

当前 Worker 端会优先用同步下来的模板渲染归档 HTML；如果模板缺失或渲染失败，会回退到内置 fallback HTML。

## 9. 本地限制

这台 Termux/Android 机器上 `workerd` 不支持当前平台，所以：

- `./node_modules/.bin/tsc --noEmit` 可以跑
- `astro check` / `astro build` 本机不可靠

真正联调应放到：

- Linux 服务器
- GitHub Actions
- Cloudflare 部署环境

## 10. 说明

- 保留 migration SQL 文件，作为运行时自动建表的来源。
- 这样可以绕过 Workers Builds 首次部署时 `database_id` 尚未可用，导致 `wrangler d1 migrations apply` 无法执行的问题。

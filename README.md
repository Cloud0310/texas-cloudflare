# Texas Hold'em

基于 Svelte、Cloudflare Workers 和 Durable Objects 的德州扑克应用，使用 pnpm workspace 管理 client、worker 和 shared。

## 本地开发与检查

使用 Node.js 24 和 pnpm 12.3.4，与 CI 环境保持一致。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test
pnpm build
```

`pnpm dev` 启动 Worker，`pnpm dev:client` 启动前端开发服务器。测试使用 tsx 运行现有的 Node.js 测试，支持源码中的 TypeScript 和无扩展名导入。

## GitHub Actions CI/CD

工作流位于 [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)。

- PR、推送到 `main` 和手动运行均执行依赖锁定安装、lint、类型检查、牌局测试、构建及 Wrangler 部署预检查。
- 只有 `main` 检查通过后才部署；手动运行时选择其他分支仅执行 CI。
- 部署下载同次 CI 生成的前端产物，通过仓库锁定的 Wrangler 将 Worker、Durable Objects 和静态资源一起发布。
- 生产部署串行执行，不中断正在进行的部署；PR 检查不需要 Cloudflare 凭据。

首次启用时，在 GitHub 仓库 **Settings → Secrets and variables → Actions**，或 **Environments → production** 中添加：

| Secret                  | 内容                              |
| ----------------------- | --------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 目标账户的 Workers 部署 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID                |

API Token 可从 **Edit Cloudflare Workers** 模板创建，并限定到目标账户及域名所在 Zone。当前配置包含自定义域名，需保留相应的 Workers 路由权限。配置方法见 [Cloudflare GitHub Actions 文档](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。

部署目标由 [`worker/wrangler.jsonc`](worker/wrangler.jsonc) 决定：Worker 名为 `texas-holdem`，域名为 `texas.cloud0310.cn`。首次部署前确保该域名的 Zone 位于目标 Cloudflare 账户中；如修改域名，也更新工作流的 environment URL。

配置好 Secrets 并将工作流推送到 `main` 后会自动部署，也可在 **Actions → CI/CD → Run workflow** 中选择 `main` 手动触发。缺少 Secrets 时 CI 仍能通过，部署任务会明确报错。可在 GitHub 的 `production` Environment 设置审批规则，并将 CI 检查设为 `main` 的必需检查。

本地手动部署需先执行 `pnpm build`，再执行 `pnpm deploy:worker`。

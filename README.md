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

## GitHub Actions CI

工作流位于 [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)。

- PR、推送到 `main` 和手动运行均执行依赖锁定安装、lint、类型检查、牌局测试、构建及 Wrangler 部署预检查。
- 前端构建产物保存为 `client-dist`，保留 7 天。
- 同一分支的新运行会取消旧的 CI 运行；检查不需要 Cloudflare 凭据。

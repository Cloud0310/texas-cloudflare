# Texas Hold'em

基于 Svelte、Cloudflare Workers 和 Durable Objects 的德州扑克应用，使用 pnpm workspace 管理 client、worker 和 shared。

## 本地开发与检查

使用 Node.js 24 和 pnpm 12.3.4。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test
pnpm build
```

`pnpm dev` 启动 Worker，`pnpm dev:client` 启动前端开发服务器。测试使用 tsx 运行现有的 Node.js 测试，支持源码中的 TypeScript 和无扩展名导入。

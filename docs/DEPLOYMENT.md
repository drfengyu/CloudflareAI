# 部署

## 前置：Cloudflare 资源

```bash
# 安装 wrangler 并登录
npm i -g wrangler && wrangler login

# 创建 D1 与 KV
wrangler d1 create cf-ai-console
wrangler kv namespace create cf-ai-console
```

记下 `database_id` 与 KV `id`。

## API Token 权限

在 Cloudflare 控制台创建 API Token，授予：

- **Workers AI** — Read / Run
- **D1** — Edit
- **Workers KV Storage** — Edit
- **Account Analytics** — Read（用量对账）

## 环境变量

参考 `.env.example`，本地写入 `.env.local`，Vercel 在 Project → Settings → Environment Variables 配置相同变量：

| 变量 | 说明 |
| --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID |
| `CF_API_TOKEN` | 上面创建的 Token |
| `CF_D1_DATABASE_ID` | D1 数据库 ID |
| `CF_KV_NAMESPACE_ID` | KV 命名空间 ID |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth（本项目启用） |
| `NEXT_PUBLIC_APP_URL` | 部署域名 |

## 登录方式（本项目同时启用）

- **邮箱 + 密码**（Credentials）：无需第三方，仅需 `AUTH_SECRET`。
- **GitHub OAuth**：在 GitHub → Settings → Developer settings → OAuth Apps → New 创建：
  - Homepage URL：`http://localhost:3000`（本地）/ 你的 Vercel 域名（线上）
  - Authorization callback URL：
    - 本地：`http://localhost:3000/api/auth/callback/github`
    - 线上：`https://<app>.vercel.app/api/auth/callback/github`
  - 将 Client ID / Secret 填入 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`。

生成 `AUTH_SECRET`：

```bash
openssl rand -base64 32
# 或： npx auth secret
```

## 数据库迁移

```bash
npm run db:generate   # 由 lib/db/schema.ts 生成迁移 SQL（drizzle/）
npm run db:migrate    # 应用到 D1（P2 引入）
```

## Vercel

1. 推送仓库，`vercel` 导入项目（Framework 自动识别 Next.js）。
2. 配置上述环境变量。
3. `vercel.json` 配置 cron（模型目录同步、用量对账，P6 引入）。
4. 部署后访问 `/dashboard`。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

# Cloudflare AI Console

充分利用 **Cloudflare Workers AI**（约 78 个模型）的全功能控制台，部署在 **Vercel** 上：
按功能分类在线生成（文本 / 图像 / 图像理解 / 语音 / 嵌入 / 翻译），多用户使用记录与用量监控，
并对外提供 **OpenAI 兼容** 与 **Anthropic 兼容** 的 API 网关，供 Claude Code / Codex / Hermes 等编程工具直接调用。

## 功能进度

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| P0 脚手架 | Next.js 16 + Tailwind v4 + 控制台布局 + 文档骨架 | ✅ |
| P1 模型库 | 同步 `/ai/models/search`，按分类展示 ~78 个模型 | ✅ |
| P2 鉴权 + D1/KV | Auth.js 多用户，D1/KV over REST，业务表 | ✅ |
| P3 在线生成 | 文本流式 / 文生图 / 视觉 / 语音 / 嵌入 / 翻译 | ✅ |
| P4 用量监控 | Neuron 记账、每日免费额度余量、费用估算、历史 | ✅ |
| P5 API 网关 | OpenAI（chat/embeddings/models）+ Anthropic（messages） | ✅ |
| P6 收尾部署 | 限流、cron、Vercel 部署 | ✅ |

## 快速部署

### 一键部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2FCloudflareAI&env=CF_ACCOUNT_ID,CF_API_TOKEN,CF_D1_DATABASE_ID,CF_KV_NAMESPACE_ID,AUTH_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET)

点击按钮后，Vercel 会要求你填入以下环境变量：

| 环境变量 | 说明 | 获取方式 |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID | [Dashboard](https://dash.cloudflare.com) 右侧 "Account ID" |
| `CF_API_TOKEN` | API Token（需要 Workers AI / D1 / KV 权限） | [创建 Token](https://dash.cloudflare.com/profile/api-tokens) |
| `CF_D1_DATABASE_ID` | D1 数据库 ID | 见 [D1 创建步骤](#d1-数据库) |
| `CF_KV_NAMESPACE_ID` | KV 命名空间 ID | 见 [KV 创建步骤](#kv-命名空间) |
| `AUTH_SECRET` | Auth.js 密钥（32 字节随机） | 运行 `openssl rand -base64 32` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | 见 [GitHub OAuth 配置](docs/SETUP.md#github-oauth) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Secret | 同上 |

部署完成后：
1. 访问你的 Vercel 域名（如 `https://your-app.vercel.app`）
2. 注册账户或用 GitHub 登录
3. 在 `/keys` 页面创建 API key
4. 在编程工具（Claude Code / Codex）中配置 base URL 为你的域名

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/CloudflareAI.git
cd CloudflareAI

# 安装依赖
npm install

# 复制环境变量模板
cp .env.local.example .env.local

# 编辑 .env.local，填入 Cloudflare 配置和 Auth.js 密钥

# 应用数据库迁移（首次运行）
npm run db:migrate

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### D1 数据库

创建 D1 数据库并获取 ID：

```bash
# 在 Cloudflare Dashboard 创建
# 或使用 Wrangler CLI
wrangler d1 create cloudflare-ai-console
# 输出中的 "database_id" 即为 CF_D1_DATABASE_ID
```

应用迁移（通过 D1 HTTP API）：

```bash
npm run db:migrate
```

### KV 命名空间

```bash
# Cloudflare Dashboard: Workers & Pages > KV > Create namespace
# 或使用 Wrangler
wrangler kv:namespace create cloudflare-ai-console
# 输出中的 "id" 即为 CF_KV_NAMESPACE_ID
```

## 使用示例

### 在 Claude Code 中使用

1. 在控制台 `/keys` 页面创建 API key（如 `sk-cfai-xxxxx`）
2. 配置 Claude Code：

```json
{
  "customModels": [
    {
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "baseURL": "https://your-app.vercel.app/api/openai/v1"
    }
  ]
}
```

### 在 Continue / Codex 中使用

```json
{
  "models": [
    {
      "title": "Cloudflare Llama 3.1",
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "apiBase": "https://your-app.vercel.app/api/openai/v1"
    }
  ]
}
```

### cURL 测试

```bash
# OpenAI 格式
curl https://your-app.vercel.app/api/openai/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Anthropic 格式
curl https://your-app.vercel.app/api/anthropic/v1/messages \
  -H "x-api-key: sk-cfai-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 技术栈

- **Next.js 16（App Router）+ TypeScript**，部署 Vercel
- **Tailwind CSS v4** + 自建轻量 UI 组件 + lucide 图标
- **Auth.js (NextAuth v5)** 多用户登录（邮箱密码 + GitHub OAuth）
- **Cloudflare D1 + KV**（通过 REST API 从 Vercel 访问），**Drizzle ORM** 管理 schema/迁移
- **Zod** 校验，**内存限流**（60 req/min per user）

## 功能亮点

- **250+ 模型**：自动同步 Cloudflare Workers AI 全模型目录，按功能分类
- **在线生成**：5 个可用 playground（文本对话流式/文生图/图像理解/嵌入/翻译）
- **用量监控**：今日/本月 Neuron 消耗、配额进度条、90% 预警、分页历史记录
- **API 网关**：OpenAI + Anthropic 双协议兼容，供编程工具直接调用
- **多用户**：邮箱密码注册 + GitHub OAuth，D1 存储用户/会话/配额/用量日志

## 贡献

欢迎 PR！主要方向：
- 语音/视频 playground 实现（集成第三方 API）
- 分布式限流（Upstash / Cloudflare Workers KV）
- API 网关流式格式完全兼容 Anthropic SSE
- Dashboard 图表可视化

## 许可

MIT

---

**Powered by Cloudflare Workers AI + Next.js 16 + Vercel**

## 文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 架构与目录结构
- [`docs/MODELS.md`](docs/MODELS.md) — 模型分类与 Workers AI 要点
- [`docs/API.md`](docs/API.md) — API 网关用法（OpenAI / Anthropic 兼容）
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + Cloudflare 部署
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — 变更记录

> 约定：**每次提交都同步更新相关 md 文档**，并在 `docs/CHANGELOG.md` 追加一条记录。

# Cloudflare AI Console

充分利用 **Cloudflare Workers AI**（约 78 个模型）的全功能控制台，部署在 **Vercel** 上：
按功能分类在线生成（文本 / 图像 / 图像理解 / 语音 / 嵌入 / 翻译），多用户使用记录与用量监控，
并对外提供 **OpenAI 兼容** 与 **Anthropic 兼容** 的 API 网关，供 Claude Code / Codex / Hermes 等编程工具直接调用。

## 功能进度

### 基础功能（P0-P6 已完成）

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| 脚手架 | Next.js 16 + Tailwind v4 + 控制台布局 + 文档骨架 | ✅ |
| 模型库 | 同步 `/ai/models/search`，按分类展示 ~59 个模型 | ✅ |
| 鉴权 + 存储 | Auth.js 多用户，D1/KV over REST，业务表 | ✅ |
| 在线生成 | 文本流式 / 文生图 / 视觉 / 语音 / 嵌入 / 翻译 | ✅ |
| 用量监控 | Neuron 记账、历史记录 | ✅ |
| API 网关 | OpenAI（chat/embeddings/models）+ Anthropic（messages） | ✅ |
| 部署 | 限流、Vercel 生产部署 | ✅ |

### 架构改造（2026-06-13 起，参考 new-api）

当前版本：**v0.2.0**（2026-06-15）—— API Key 管理增强 + Error 追踪 + 完美对齐布局

| 阶段 | 说明 | 状态 |
| --- | --- | --- |
| **Phase A** | 视觉地基（shadcn 组件/主题/布局） | 🚧 规划中 |
| **Phase B** | 数据内核 & 计量修复 | ✅ 部分完成 |
| ├─ 定价模块 | hosted ×1000 / proxied ×1 倍率 + 图像固定价 | ✅ |
| ├─ 真实计量 | 按 token/neurons 计费 + 余额扣减 + error 记 0 | ✅ |
| ├─ 余额校验 | user + apiKey 双重余额预检 + 402 拒绝 | ✅ |
| ├─ 图像修复 | FLUX-2 multipart 响应解析 | ✅ |
| ├─ API Key 必需 | 所有 Playground 必须有 key，无 key 返回 403 | ✅ |
| └─ 流式计量 | 流式结束后精确计量（当前按估算） | 🚧 待实现 |
| **Phase C** | 数据看板 | ✅ 部分完成 |
| ├─ 用量聚合 | 小时/日趋势 + 模型排行 + credits 统计 | ✅ |
| ├─ 图表渲染 | recharts 折线/柱状/条形图 | ✅ |
| ├─ 时间切换 | 今日/本周/本月（修复 async searchParams） | ✅ |
| └─ 余额展示 | StatCard + 最近调用列表 | ✅ |
| **Phase D** | 令牌管理界面 | ✅ 部分完成 |
| ├─ Key 统计 | 每个 key 的调用次数 + 消耗 credits | ✅ |
| ├─ 额度进度 | 有限/无限额度可视化 + 进度条 | ✅ |
| ├─ 列表对齐 | CSS Grid 固定宽度列布局 | ✅ |
| └─ 状态管理 | 创建/编辑/禁用/删除 + 模型白名单 | ✅ |
| **Phase E** | 公开定价页 | 🚧 待实现 |
| **Phase F** | 管理后台 | 🚧 待实现 |

**最新更新（v0.2.0）**：
- ✅ API Key 使用统计（调用次数 + 消耗 credits）
- ✅ Error 追踪系统（errorReason 字段 + 显示）
- ✅ 渠道区分（站内/OpenAI/Anthropic）
- ✅ 完美对齐的列表布局（Grid + 固定宽度）
- ✅ 所有 Playground 必须有 API Key

**变更详情**：见 [`CHANGELOG.md`](CHANGELOG.md) 和 [`CLAUDE.md`](CLAUDE.md)


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

- **59+ 模型**：自动同步 Cloudflare Workers AI 全模型目录，按功能分类，显示应用倍率后的实际计费价格
- **在线生成**：7 个 playground（文本对话流式/文生图/图像理解/嵌入/翻译/语音/视频）
- **真实计量**：按 token/neurons 精确计费，余额预检 + 双重扣减（user + apiKey），error 不扣费
- **数据看板**：小时/日趋势图表、模型分布、余额/消耗统计、时间范围切换（今日/本周/本月）
- **API 网关**：OpenAI + Anthropic 双协议兼容，供编程工具直接调用
- **多用户**：邮箱密码注册 + GitHub OAuth，D1 存储用户/会话/余额/用量日志

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

- [`CHANGELOG.md`](CHANGELOG.md) — 版本变更记录（遵循 Keep a Changelog 规范）
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 架构与目录结构
- [`docs/MODELS.md`](docs/MODELS.md) — 模型分类与 Workers AI 要点
- [`docs/API.md`](docs/API.md) — API 网关用法（OpenAI / Anthropic 兼容）
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + Cloudflare 部署
- [`CLAUDE.md`](CLAUDE.md) — 项目指令和改造路线图

> 约定：**每次提交都同步更新相关 md 文档**，并在 `CHANGELOG.md` 追加版本记录。

# 架构

## 总览

```
┌─────────────────────────────────────────────┐
│  浏览器（控制台 UI）                          │
└───────────────┬─────────────────────────────┘
                │  HTTPS
┌───────────────▼─────────────────────────────┐
│  Next.js on Vercel                           │
│  ├─ app/(dashboard)  控制台页面（session 鉴权）│
│  ├─ app/api/ai/*     站内 playground 调用      │
│  ├─ app/api/v1/*     API 网关（API key 鉴权）  │
│  │    ├─ OpenAI 兼容：chat / embeddings / models│
│  │    └─ Anthropic 兼容：messages              │
│  └─ lib/             业务逻辑                   │
└───────┬───────────────────────┬───────────────┘
        │ REST                   │ REST
┌───────▼────────┐     ┌─────────▼──────────────┐
│ Workers AI     │     │ D1 (SQLite) + KV        │
│ /ai/run        │     │ 用户/密钥/用量/配额/目录 │
│ /ai/v1/*       │     └─────────────────────────┘
└────────────────┘
```

外部编程工具（Claude Code / Codex / Hermes）→ `app/api/v1/*` → Workers AI。

## 为什么 Vercel + Cloudflare REST

应用部署在 Vercel，但数据（D1/KV）在 Cloudflare。两者通过 Cloudflare 的 REST API 打通：

- **D1**：`POST /accounts/{id}/d1/database/{db}/query`（`{sql, params}`）
- **KV**：`/accounts/{id}/storage/kv/namespaces/{ns}/values/{key}`
- **Workers AI**：`POST /accounts/{id}/ai/run/{model}` 与 `/accounts/{id}/ai/v1/*`
- **Analytics（GraphQL）**：`workersAiInferenceAdaptiveGroups` 查询真实 Neuron 消耗

如此只需一个 Vercel 部署目标，无需单独的 Cloudflare Worker。代价是鉴权/记账每请求一次 REST 往返；
后续如成为瓶颈，可改用 session JWT 减少 D1 读或引入边缘 Worker。

## 目录结构

```
app/
  (dashboard)/            控制台布局与页面
    dashboard/            用量总览
    models/               模型库
    playground/{text,image,vision,speech,embeddings,translate,video}/
    history/ keys/ settings/
  api/
    ai/[task]/            站内 playground（session 鉴权）
    v1/chat/completions/  OpenAI 兼容
    v1/embeddings/        OpenAI 兼容
    v1/models/            OpenAI 兼容
    v1/messages/          Anthropic 兼容
    auth/[...nextauth]/
    cron/sync-models/     定时同步模型目录
components/
  ui/                     Button / Card / Badge 等轻量原语
  dashboard/              Sidebar / PageHeader
lib/
  categories.ts           模型分类（task → category）
  env.ts                  环境变量集中访问 + 计费常量
  utils.ts                cn / 数字与货币格式化
  cloudflare/             ai.ts / catalog.ts / analytics.ts
  db/                     schema.ts / d1-http.ts / kv-http.ts / queries.ts
  gateway/                openai.ts / anthropic.ts
  usage/                  meter.ts（Neuron 估算与记账）
  auth.ts                 Auth.js 配置
docs/                     文档（每次提交同步更新）
drizzle/                  迁移 SQL
```

## 鉴权模型

- 控制台页面：Auth.js session（GitHub OAuth 或邮箱/密码）。
- API 网关：平台签发的 API key（`Authorization: Bearer ...`），按 key → user 归属用量。
- Cloudflare 凭证为平台级（单账户），每用户配额在 D1 内部强制；BYOK 作为后续可选项。

## 数据模型（D1）

`users` · `accounts` · `sessions`（Auth.js）· `api_keys` · `usage_logs` · `quotas` · `model_catalog`。
详见 `lib/db/schema.ts`（P2 引入）。

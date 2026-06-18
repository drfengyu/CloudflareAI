# API 路由规范

本项目遵循 [new-api](https://github.com/QuantumNous/new-api) 的标准路由约定。

## 路由设计原则

### 1. 路径分离

- **AI 推理网关**：`/v1/*` — 根路径，OpenAI/Anthropic 兼容端点
- **业务 API**：`/api/*` — 用户管理、令牌、兑换码等业务逻辑
- **站内功能**：`/api/ai/*` — Playground 专用端点（需登录）

### 2. 认证方式

- **推理网关 `/v1/*`**：`Authorization: Bearer sk-cfai-xxxxx` 或 `x-api-key: sk-cfai-xxxxx`
- **业务 API `/api/*`**：Session Cookie（NextAuth.js）或 Token Auth
- **站内 Playground `/api/ai/*`**：Session Cookie（需登录）

---

## 推理网关路由（/v1/*）

### OpenAI 兼容端点

#### 1. 对话补全
```
POST /v1/chat/completions
Authorization: Bearer sk-cfai-xxxxx
Content-Type: application/json

{
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1024
}
```

**功能**：
- 支持流式（SSE）和非流式响应
- 自动计量真实 token 用量
- 余额预检 + 双重扣减（user + apiKey）
- 错误不计费
- **工具调用（Function Calling）**：透传 `tools` / `tool_choice`，返回标准 `tool_calls`

**实现文件**：`app/v1/chat/completions/route.ts`

---

#### 2. 嵌入向量
```
POST /v1/embeddings
Authorization: Bearer sk-cfai-xxxxx
Content-Type: application/json

{
  "model": "@cf/baai/bge-base-en-v1.5",
  "input": "The food was delicious and the waiter..."
}
```

**功能**：
- 支持单个字符串或字符串数组
- 按文本长度估算 token
- 返回 OpenAI 格式嵌入向量

**实现文件**：`app/v1/embeddings/route.ts`

---

#### 3. 模型列表
```
GET /v1/models
（公开，无需鉴权）
```

**响应**：
```json
{
  "object": "list",
  "data": [
    {
      "id": "@cf/meta/llama-3.1-8b-instruct",
      "object": "model",
      "created": 1609459200,
      "owned_by": "cloudflare"
    }
  ]
}
```

**实现文件**：`app/v1/models/route.ts`

---

### Anthropic 兼容端点

#### 4. 消息（Claude 格式）
```
POST /v1/messages
x-api-key: sk-cfai-xxxxx
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello, Claude"}
  ],
  "system": "You are a helpful assistant.",
  "stream": false
}
```

**功能**：
- 接收 Anthropic 格式请求
- 内部转换为 OpenAI 格式调用 Cloudflare
- 返回 Anthropic 格式响应
- 支持流式和非流式
- **工具调用（Function Calling）**：`tools`（`{name, description, input_schema}`）→ OpenAI `tools`；
  `tool_use` / `tool_result` content block 正确转换，返回 `tool_use` block + `stop_reason: tool_use`，
  适配 Claude Code 智能体循环
  - Cloudflare 流式端点不返回结构化 tool_calls（序列化进 content 文本），故本网关在**请求带 `tools` 且
    `stream:true`** 时改用非流式上游 + 合成 Anthropic SSE（`message_start` → `content_block_start(tool_use)`
    → `input_json_delta` → `message_delta(stop_reason:tool_use)` → `message_stop`）

**实现文件**：`app/v1/messages/route.ts` + `lib/relay/anthropic.ts`

**响应**：
```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Hello! How can I help you?"}
  ],
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 8
  }
}
```

**实现文件**：`app/v1/messages/route.ts`

---

## 业务 API 路由（/api/*）

### 用户管理（/api/user）

参考 new-api 设计：

```
POST   /api/user/register          # 注册（公开）
POST   /api/user/login             # 登录（公开）
GET    /api/user/logout            # 登出
GET    /api/user/self              # 获取当前用户信息（需认证）
PUT    /api/user/self              # 更新当前用户信息（需认证）
DELETE /api/user/self              # 删除账户（需认证）

# 管理员路由
GET    /api/user                   # 获取所有用户（需管理员）
GET    /api/user/search            # 搜索用户（需管理员）
GET    /api/user/:id               # 获取指定用户（需管理员）
POST   /api/user                   # 创建用户（需管理员）
PUT    /api/user                   # 更新用户（需管理员）
DELETE /api/user/:id               # 删除用户（需管理员）
POST   /api/user/manage            # 批量管理用户（需管理员）
```

---

### 令牌管理（/api/token）

```
GET    /api/token                  # 获取当前用户的所有令牌
GET    /api/token/search           # 搜索令牌
GET    /api/token/:id              # 获取指定令牌详情
POST   /api/token                  # 创建新令牌
PUT    /api/token                  # 更新令牌
DELETE /api/token/:id              # 删除令牌
POST   /api/token/batch            # 批量删除令牌
```

**令牌字段**（参考 new-api）：
- `name`: 令牌名称
- `status`: 1=启用 / 2=禁用 / 3=过期 / 4=耗尽
- `remain_quota`: 剩余额度（-1 表示无限）
- `unlimited_quota`: 是否无限额度
- `expired_time`: 过期时间（Unix timestamp，-1 表示永不过期）
- `models`: 允许的模型列表（空数组表示全部允许）
- `ip_whitelist`: IP 白名单（可选）

---

### 兑换码管理（/api/redemption）

```
# 管理员路由
GET    /api/redemption             # 获取所有兑换码（需管理员）
GET    /api/redemption/search      # 搜索兑换码（需管理员）
GET    /api/redemption/:id         # 获取兑换码详情（需管理员）
POST   /api/redemption             # 创建兑换码（需管理员）
PUT    /api/redemption             # 更新兑换码（需管理员）
DELETE /api/redemption/:id         # 删除兑换码（需管理员）
DELETE /api/redemption/invalid     # 删除无效兑换码（需管理员）

# 用户路由
POST   /api/user/topup             # 使用兑换码充值（需认证）
```

---

### 充值管理（/api/topup）

```
GET    /api/user/topup/info        # 获取充值信息（需认证）
GET    /api/user/topup/self        # 获取当前用户充值记录（需认证）
POST   /api/user/topup             # 使用兑换码充值（需认证）

# 管理员路由
GET    /api/user/topup             # 获取所有充值记录（需管理员）
```

---

### 用量日志（/api/log）

```
GET    /api/log/self               # 获取当前用户用量日志（需认证）
GET    /api/log/self/search        # 搜索当前用户日志（需认证）
GET    /api/log/self/stat          # 获取当前用户统计（需认证）

# 管理员路由
GET    /api/log                    # 获取所有用量日志（需管理员）
GET    /api/log/search             # 搜索所有日志（需管理员）
GET    /api/log/stat               # 获取全局统计（需管理员）
DELETE /api/log                    # 删除历史日志（需管理员）
```

---

### 系统设置（/api/option）

```
# 超级管理员路由（role >= 100）
GET    /api/option                 # 获取所有系统设置
PUT    /api/option                 # 更新系统设置
```

**系统设置项**（存储在 `option` 表）：
- `pricing_base_multiplier`: 基础定价倍率
- `pricing_hosted_multiplier`: Hosted 模型倍率
- `pricing_proxied_multiplier`: Proxied 模型倍率
- `checkin_enabled`: 签到功能开关
- `checkin_min_quota`: 签到最小奖励
- `checkin_max_quota`: 签到最大奖励

---

### 签到功能（/api/user/checkin）

```
GET    /api/user/checkin           # 获取签到状态（需认证）
POST   /api/user/checkin           # 执行签到（需认证）
```

**响应示例**：
```json
{
  "hasCheckedIn": false,
  "lastCheckinDate": null,
  "canCheckin": true
}
```

---

## 站内 Playground 路由（/api/ai/*）

这些端点需要用户登录（Session Cookie），不使用 API Key。

```
POST   /api/ai/text                # 文本生成 Playground
POST   /api/ai/image               # 图像生成 Playground
POST   /api/ai/vision              # 图像理解 Playground
POST   /api/ai/embeddings          # 嵌入向量 Playground
POST   /api/ai/translate           # 翻译 Playground
```

**特点**：
- 自动使用用户的默认 API Key
- 无 API Key 时返回 403 提示创建
- 流式响应支持对话历史保存

---

## 中间件和认证

### 1. 推理网关认证（`/v1/*`）

```typescript
// lib/auth/api-key.ts
export async function verifyApiKey(
  token: string,
  clientIp?: string
): Promise<{
  userId: string;
  apiKeyId: string;
  allowedModels?: string[];
} | null>
```

**校验项**：
- ✅ Token 格式：`sk-cfai-{20位随机字符}`
- ✅ 状态：`status = 1`（启用）
- ✅ 过期时间：`expiredTime = -1` 或 `> Date.now()`
- ✅ IP 白名单：`ipWhitelist` 为空或包含客户端 IP
- ✅ 余额：`user.balanceCredits > 0` 且 `apiKey.remainCredits > 0`（或无限额度）

---

### 2. 业务 API 认证（`/api/*`）

```typescript
// lib/auth/session.ts
export async function requireUser(): Promise<string> // userId
export async function requireAdmin(): Promise<string> // role >= 10
export async function requireRoot(): Promise<string>  // role >= 100
```

基于 NextAuth.js Session，从 cookie 中读取。

---

### 3. 限流（Rate Limiting）

```typescript
// lib/rate-limit.ts
export function checkRateLimit(
  key: string,
  options: { window: number; limit: number }
): boolean
```

**默认限流**：
- 推理网关：60 req/min per user
- 业务 API：根据敏感度分级（login/register: 5 req/min，普通操作：60 req/min）

---

## 错误处理

### 标准错误响应格式

**OpenAI 格式**（`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`）：
```json
{
  "error": "Error message"
}
```

**Anthropic 格式**（`/v1/messages`）：
```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

**业务 API 格式**（`/api/*`）：
```json
{
  "error": "Error message",
  "details": [...] // 可选，Zod 验证错误详情
}
```

---

### 常见 HTTP 状态码

| 状态码 | 含义 | 场景 |
|--------|------|------|
| 200 | 成功 | 正常响应 |
| 400 | 请求错误 | 参数验证失败 |
| 401 | 未授权 | API Key 无效或缺失 |
| 402 | 余额不足 | Payment Required |
| 403 | 禁止访问 | 模型不在白名单、权限不足 |
| 404 | 未找到 | 资源不存在 |
| 429 | 限流 | 超过速率限制 |
| 500 | 服务器错误 | 内部错误、模型调用失败 |

---

## 参考资料

- **new-api 路由设计**：`D:\Download\new-api-main\router\`
  - `api-router.go` — 业务 API 路由
  - `relay-router.go` — 推理网关路由
- **OpenAI API 文档**：https://platform.openai.com/docs/api-reference
- **Anthropic API 文档**：https://docs.anthropic.com/claude/reference

---

## 下一步改造

根据 new-api 标准，以下功能待实现：

### Phase H - 完善业务 API

- [ ] `/api/user/search` — 用户搜索（管理员）
- [ ] `/api/token/search` — 令牌搜索（限流）
- [ ] `/api/log/self/search` — 用量日志搜索（用户）
- [ ] `/api/redemption/search` — 兑换码搜索（管理员）
- [ ] `/api/user/manage` — 批量用户管理（禁用/启用/调整余额）

### Phase I - 渠道管理（Channel）

渠道管理用于连接多个上游 AI 供应商（OpenAI / Anthropic / Cloudflare / Azure 等）。

```
# CRUD
GET    /api/channels                       # 列出所有渠道（需管理员）
POST   /api/channels                       # 创建渠道（需管理员）
GET    /api/channels/:id                   # 获取渠道详情（需管理员）
PUT    /api/channels/:id                   # 更新渠道（需管理员）
DELETE /api/channels/:id                   # 软删除渠道（需管理员）

# 健康检查 & 统计
GET    /api/channels/:id/health            # 渠道健康检查（需管理员）
GET    /api/channels/:id/stats             # 渠道使用统计（需管理员）

# 模型管理
GET    /api/channels/:id/models            # 列出渠道关联模型（需管理员）
POST   /api/channels/:id/models/sync       # 从上游同步模型列表（需管理员）
PUT    /api/channels/:id/models/:modelId   # 更新模型倍率（需管理员）
DELETE /api/channels/:id/models/:modelId   # 移除模型关联（需管理员）
```

**渠道类型**：
- `cloudflare` — Cloudflare Workers AI（内置逻辑）
- `openai` — OpenAI API 直通
- `anthropic` — Anthropic API 直通
- `azure` — Azure OpenAI 服务

**适配器注册表**：`lib/channels/registry.ts`
- 根据渠道类型自动选择对应适配器
- 支持 `healthCheck()` / `listModels()` 扩展方法
- 配置字段按渠道类型动态展示（API Key、Base URL、Organization ID 等）

**渠道路由网关**（`lib/channels/router.ts`）：
- 根据 API Key 的 `channelId` 自动路由到对应上游
- OpenAI 渠道 → 直通 OpenAI API
- Anthropic 渠道 → 直通 Anthropic API
- Cloudflare 渠道 → 内置 Workers AI 逻辑

### Phase J - 订阅计费（Subscription）

new-api 的 `/api/subscription` 支持订阅套餐，本项目使用积分制，此功能可选。

---

**最后更新**：2026-06-18

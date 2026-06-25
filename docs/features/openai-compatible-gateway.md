# 渠道管理 - OpenAI 兼容网关

## 功能概述

本项目支持添加任何 OpenAI 兼容的 API 网关作为模型渠道，可以快速导入第三方网关的模型列表并使用。

---

## 支持的网关示例

### 1. Vercel AI Gateway（免费模型）

**Base URL**: `https://ai-gateway.vercel.sh/v1`

**特点**:
- ✅ 提供免费模型（如 Llama、Mistral 等）
- ✅ 无需 API Key
- ✅ 支持 OpenAI 兼容接口

**配置步骤**:
1. 进入 `/admin/channels`（管理员）
2. 点击"创建渠道"
3. 选择类型：`OpenAI 兼容 (通用)`
4. 配置：
   - 名称：`Vercel AI Gateway`
   - Base URL：`https://ai-gateway.vercel.sh/v1`
   - API Key：留空（免费模型无需）
5. 保存后点击"同步模型"
6. 系统自动从 `https://ai-gateway.vercel.sh/v1/models` 获取模型列表

### 2. SiliconFlow

**Base URL**: `https://api.siliconflow.cn/v1`

**特点**:
- ✅ 国内访问快
- ✅ 支持多种开源模型
- ⚠️ 需要 API Key

**配置步骤**:
1. 注册获取 API Key
2. 创建渠道：
   - 类型：`OpenAI 兼容 (通用)`
   - Base URL：`https://api.siliconflow.cn/v1`
   - API Key：`sk-xxx...`
3. 同步模型

### 3. 其他 OpenAI 兼容网关

任何实现了 OpenAI `/v1/models` 和 `/v1/chat/completions` 接口的网关都可以接入。

---

## 使用流程

### Step 1: 创建渠道

访问 `/admin/channels`，点击"创建渠道"：

```json
{
  "name": "Vercel AI Gateway",
  "type": "openai-compatible",
  "config": {
    "baseUrl": "https://ai-gateway.vercel.sh/v1",
    "apiKey": ""  // 可选
  }
}
```

### Step 2: 健康检查

创建后点击"健康检查"按钮，验证连接：
- ✅ 连接正常 → 可以同步模型
- ❌ 连接失败 → 检查 baseUrl 是否正确

### Step 3: 同步模型

点击"同步模型"按钮：
- 系统自动调用 `GET {baseUrl}/models`
- 解析返回的模型列表
- 插入到 `model_pricing` 表
- 自动设置 `multiplier = 1.0`

**返回示例**:
```json
{
  "message": "同步完成：新增 15 个模型，共 15 个",
  "total": 15,
  "inserted": 15,
  "skipped": 0
}
```

### Step 4: 创建 API Key

在 `/keys` 页面创建新的 API Key：
1. 选择渠道：选择刚创建的 `Vercel AI Gateway`
2. 选择模型：从同步的模型列表中选择
3. 创建密钥

### Step 5: 调用 API

使用创建的 API Key 调用：

```bash
curl https://cloudai.fuwari.fun/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 技术实现

### 适配器架构

**文件**: `lib/channels/openai-compatible-adapter.ts`

```typescript
export class OpenAICompatibleAdapter implements ChannelAdapter {
  id = "openai-compatible"
  name = "OpenAI Compatible"
  type = "openai-compatible"

  // 转发请求到上游
  async route(path, request, context) { ... }

  // 健康检查
  async healthCheck(context) {
    const baseUrl = context.config.baseUrl
    const res = await fetch(`${baseUrl}/models`)
    return { ok: res.ok, message: "..." }
  }

  // 获取模型列表
  async listModels(context) {
    const baseUrl = context.config.baseUrl
    const res = await fetch(`${baseUrl}/models`)
    const data = await res.json()
    return data.data.map(m => ({ id: m.id, object: m.object }))
  }
}
```

### 模型同步 API

**端点**: `POST /api/channels/[channelId]/models`

**逻辑**:
1. 获取渠道配置（baseUrl + apiKey）
2. 调用 `adapter.listModels()`
3. 过滤已存在的模型（避免重复）
4. 批量插入新模型到 `model_pricing` 表

**SQL**:
```sql
INSERT INTO model_pricing (
  modelId,
  category,
  source,
  channelId,
  multiplier
) VALUES (
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'remote',
  'openai-compatible',
  'channel-id-xxx',
  1.0
)
```

---

## 配置示例

### Vercel AI Gateway（免费）

```json
{
  "name": "Vercel Free",
  "type": "openai-compatible",
  "status": 1,
  "config": {
    "baseUrl": "https://ai-gateway.vercel.sh/v1"
  }
}
```

### SiliconFlow（需 Key）

```json
{
  "name": "SiliconFlow",
  "type": "openai-compatible",
  "status": 1,
  "config": {
    "baseUrl": "https://api.siliconflow.cn/v1",
    "apiKey": "sk-siliconflow-xxx"
  }
}
```

### 自建网关

```json
{
  "name": "My Gateway",
  "type": "openai-compatible",
  "status": 1,
  "config": {
    "baseUrl": "https://my-gateway.example.com/v1",
    "apiKey": "my-secret-key"
  }
}
```

---

## 注意事项

### 1. API Key 可选

- 有些免费网关（如 Vercel AI Gateway）**不需要** API Key
- 配置字段 `apiKey` 设为可选 (`required: false`)
- 适配器会根据是否存在 key 决定是否添加 `Authorization` 头

### 2. baseUrl 格式

- 必须包含协议（`https://`）
- 应该以 `/v1` 结尾（标准 OpenAI 路径）
- 不要以 `/` 结尾（代码会自动处理）

**正确**:
- ✅ `https://api.openai.com/v1`
- ✅ `https://ai-gateway.vercel.sh/v1`

**错误**:
- ❌ `api.openai.com/v1`（缺少协议）
- ❌ `https://api.openai.com`（缺少 `/v1`）

### 3. 模型命名

- 不同网关的模型 ID 可能不同
- Vercel AI Gateway: `meta-llama/Meta-Llama-3.1-8B-Instruct`
- OpenAI: `gpt-4o`
- 系统保留原始 ID，不做转换

### 4. 计费设置

- 同步时默认 `multiplier = 1.0`
- 管理员可在 `/admin/pricing` 调整倍率
- 如果上游免费，可设为 `0` 或很小的值

---

## 故障排查

### 问题 1: "未获取到远程模型列表"

**原因**:
- baseUrl 错误
- 网关不支持 `/models` 端点
- 网络不通

**解决**:
1. 点击"健康检查"验证连接
2. 手动访问 `{baseUrl}/models` 查看返回
3. 检查网络代理设置

### 问题 2: "API Key 无效"

**原因**:
- Key 过期或错误
- 网关需要 Key 但未配置

**解决**:
1. 重新生成 API Key
2. 确认 Key 格式正确
3. 确认该网关是否需要 Key

### 问题 3: 模型同步后无法调用

**原因**:
- 模型 ID 不匹配
- 上游不支持该模型

**解决**:
1. 检查 `/admin/channels/[id]` 的模型列表
2. 确认模型 ID 与上游一致
3. 尝试调用上游 API 验证

---

## API 参考

### 创建渠道

```bash
POST /api/channels
Authorization: Bearer <admin-token>

{
  "name": "Vercel AI",
  "type": "openai-compatible",
  "status": 1,
  "config": "{\"baseUrl\":\"https://ai-gateway.vercel.sh/v1\"}"
}
```

### 同步模型

```bash
POST /api/channels/{channelId}/models
Authorization: Bearer <admin-token>
```

### 健康检查

```bash
GET /api/channels/{channelId}/health
Authorization: Bearer <admin-token>
```

---

## 总结

通过 **OpenAI 兼容适配器**，您可以：
- ✅ 接入任何 OpenAI 兼容的 API 网关
- ✅ 一键同步上游模型列表
- ✅ 支持免费网关（无需 API Key）
- ✅ 统一管理多个渠道
- ✅ 自动计费和统计

**下一步**:
1. 添加 Vercel AI Gateway（免费模型）
2. 同步模型列表
3. 创建 API Key
4. 开始使用！

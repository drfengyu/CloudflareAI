# Cloudflare AI Console API 使用文档

**生产环境 Base URL**: `https://cloudflare-ai-tau.vercel.app`

---

## 🔑 认证

所有 API 请求需要 API Key 认证。

### 获取 API Key

1. 访问 https://cloudflare-ai-tau.vercel.app/keys
2. 登录后点击 "创建新的 API Key"
3. 输入名称（如 `my-app-key`）
4. 复制生成的密钥（格式：`sk-cfai-xxxxx`）

⚠️ **密钥仅显示一次，请妥善保存！**

---

## 📡 OpenAI 兼容端点

### 1. 列出可用模型

```bash
# 公开端点，无需 API key
curl https://cloudflare-ai-tau.vercel.app/v1/models
```

**响应示例：**
```json
{
  "object": "list",
  "data": [
    {
      "id": "@cf/meta/llama-3.1-8b-instruct",
      "object": "model",
      "created": 1609459200,
      "owned_by": "cloudflare"
    },
    ...
  ]
}
```

### 2. 聊天补全（非流式）

```bash
curl https://cloudflare-ai-tau.vercel.app/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is Cloudflare Workers AI?"}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

**响应示例：**
```json
{
  "id": "chatcmpl-xxxxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Cloudflare Workers AI is..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 150,
    "total_tokens": 175
  }
}
```

### 3. 聊天补全（流式）

```bash
curl https://cloudflare-ai-tau.vercel.app/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
```

**响应示例（SSE 流）：**
```
data: {"choices":[{"delta":{"content":"Once"}}]}

data: {"choices":[{"delta":{"content":" upon"}}]}

data: {"choices":[{"delta":{"content":" a"}}]}

data: [DONE]
```

### 4. 嵌入向量

```bash
curl https://cloudflare-ai-tau.vercel.app/v1/embeddings \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/baai/bge-base-en-v1.5",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

**响应示例：**
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.123, -0.456, 0.789, ...],
      "index": 0
    }
  ],
  "model": "@cf/baai/bge-base-en-v1.5",
  "usage": {
    "prompt_tokens": 1,
    "total_tokens": 1
  }
}
```

> **关于嵌入的 `prompt_tokens`**：嵌入模型上游只返回向量、不返回 token 计数，
> 故 `prompt_tokens` 由服务端估算（CJK ≈ 1 token/字，拉丁 ≈ 1 token/4 字符，最小 1），
> 该估算值即为计费 token 数。计费公式与扣费口径详见 [`docs/BILLING_GUIDE.md`](docs/BILLING_GUIDE.md)。

---

## 🤖 Anthropic 兼容端点

### 消息生成（非流式）

```bash
curl https://cloudflare-ai-tau.vercel.app/v1/messages \
  -H "x-api-key: sk-cfai-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 1024,
    "system": "You are a helpful AI assistant.",
    "messages": [
      {"role": "user", "content": "Explain quantum computing"}
    ]
  }'
```

**响应示例：**
```json
{
  "id": "msg-xxxxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Quantum computing is..."
    }
  ],
  "model": "@cf/meta/llama-3.1-8b-instruct",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 20,
    "output_tokens": 200
  }
}
```

### 消息生成（流式）

```bash
curl https://cloudflare-ai-tau.vercel.app/v1/messages \
  -H "x-api-key: sk-cfai-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Write a poem"}],
    "stream": true
  }'
```

---

## 🐍 Python 示例

### OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-cfai-xxxxx",
    base_url="https://cloudflare-ai-tau.vercel.app/v1"
)

# 聊天补全
response = client.chat.completions.create(
    model="@cf/meta/llama-3.1-8b-instruct",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)

# 流式聊天
stream = client.chat.completions.create(
    model="@cf/meta/llama-3.1-8b-instruct",
    messages=[{"role": "user", "content": "Count to 10"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")

# 嵌入向量
embedding = client.embeddings.create(
    model="@cf/baai/bge-base-en-v1.5",
    input="Hello world"
)

print(embedding.data[0].embedding[:5])  # 前5个维度
```

### Anthropic SDK

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="sk-cfai-xxxxx",
    base_url="https://cloudflare-ai-tau.vercel.app/v1"
)

# 消息生成
message = client.messages.create(
    model="@cf/meta/llama-3.1-8b-instruct",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Explain AI in simple terms"}
    ]
)

print(message.content[0].text)

# 流式消息
with client.messages.stream(
    model="@cf/meta/llama-3.1-8b-instruct",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a story"}]
) as stream:
    for text in stream.text_stream:
        print(text, end="")
```

---

## 🟢 Node.js 示例

### OpenAI SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-cfai-xxxxx',
  baseURL: 'https://cloudflare-ai-tau.vercel.app/v1'
});

// 聊天补全
const response = await client.chat.completions.create({
  model: '@cf/meta/llama-3.1-8b-instruct',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' }
  ]
});

console.log(response.choices[0].message.content);

// 流式聊天
const stream = await client.chat.completions.create({
  model: '@cf/meta/llama-3.1-8b-instruct',
  messages: [{ role: 'user', content: 'Count to 10' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}

// 嵌入向量
const embedding = await client.embeddings.create({
  model: '@cf/baai/bge-base-en-v1.5',
  input: 'Hello world'
});

console.log(embedding.data[0].embedding.slice(0, 5));
```

### Anthropic SDK

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'sk-cfai-xxxxx',
  baseURL: 'https://cloudflare-ai-tau.vercel.app/v1'
});

// 消息生成
const message = await client.messages.create({
  model: '@cf/meta/llama-3.1-8b-instruct',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Explain AI in simple terms' }
  ]
});

console.log(message.content[0].text);

// 流式消息
const stream = await client.messages.stream({
  model: '@cf/meta/llama-3.1-8b-instruct',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a story' }]
});

for await (const text of stream.text_stream) {
  process.stdout.write(text);
}
```

---

## 🛠️ 在编程工具中使用

### Claude Code

在 `~/.claude/settings.json` 或通过 `/config` 命令：

```json
{
  "customModels": [
    {
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "baseURL": "https://cloudflare-ai-tau.vercel.app/v1"
    }
  ]
}
```

### Continue

在 `~/.continue/config.json`：

```json
{
  "models": [
    {
      "title": "Cloudflare Llama 3.1",
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "apiBase": "https://cloudflare-ai-tau.vercel.app/v1"
    }
  ]
}
```

### Cursor

Settings → Models → Add Custom Model：
- Provider: OpenAI
- Model: `@cf/meta/llama-3.1-8b-instruct`
- API Key: `sk-cfai-xxxxx`
- Base URL: `https://cloudflare-ai-tau.vercel.app/v1`

---

## 📊 可用模型

访问 https://cloudflare-ai-tau.vercel.app/models 查看完整模型列表（需登录）。

### 热门模型

**文本生成：**
- `@cf/meta/llama-3.1-8b-instruct` — Meta Llama 3.1 8B
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — Meta Llama 3.3 70B
- `@cf/qwen/qwen2.5-14b-instruct-awq` — Qwen 2.5 14B

**嵌入：**
- `@cf/baai/bge-base-en-v1.5` — BGE Base 英文 768维
- `@cf/baai/bge-small-en-v1.5` — BGE Small 英文 384维
- `@cf/baai/bge-large-en-v1.5` — BGE Large 英文 1024维

**图像生成：**
- `@cf/black-forest-labs/flux-1-schnell` — FLUX.1 Schnell
- `@cf/stabilityai/stable-diffusion-xl-base-1.0` — Stable Diffusion XL

**视觉理解：**
- `@cf/meta/llama-3.2-11b-vision-instruct` — Llama 3.2 Vision 11B
- `@cf/llava-hf/llava-1.5-7b-hf` — LLaVA 1.5 7B

---

## ⚠️ 限流

- **60 请求/分钟** per 用户
- 超出限制返回 `429 Too Many Requests`

---

## 🐛 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 401 | API Key 无效或已撤销 |
| 429 | 超出速率限制 |
| 500 | 服务器错误（Cloudflare AI 调用失败）|

---

## 📚 更多信息

- **控制台**: https://cloudflare-ai-tau.vercel.app
- **GitHub**: https://github.com/drfengyu/CloudflareAI
- **Cloudflare Workers AI 文档**: https://developers.cloudflare.com/workers-ai/

---

**🎉 开始使用 Cloudflare AI Console API！**

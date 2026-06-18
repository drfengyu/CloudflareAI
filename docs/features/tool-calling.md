# 工具调用（Function Calling）

> 适配 Claude Code 等智能体客户端的 `tool_use → tool_result` 循环。
> 实现参考 new-api `relay/channel/claude/relay-claude.go` 的字段映射。

## 背景

本网关把 Anthropic `/v1/messages` 与 OpenAI `/v1/chat/completions` 请求统一转发到
Cloudflare 的 OpenAI 兼容端点（`/ai/v1/chat/completions`）。旧实现把所有 content block
**展平为纯文本**，丢弃 `tools` / `tool_use` / `tool_result`，导致 Claude Code 工具调用失败、
多轮回传被 400、流式工具调用解析错误。

本特性补齐了完整的双向工具调用转换。

## 架构

```
Claude Code ──Anthropic /v1/messages──▶ 本网关 ──转 OpenAI──▶ Cloudflare
            ◀──Anthropic SSE/JSON──────         ◀──OpenAI──
```

核心模块：

| 文件 | 职责 |
|---|---|
| `lib/relay/anthropic.ts` | Anthropic ⇆ OpenAI 请求/响应转换 |
| `lib/usage/anthropic-stream.ts` | OpenAI SSE → Anthropic SSE（含 `tool_use` 块）+ `anthropicMessageToSSE` 合成 |
| `lib/usage/stream-intercept.ts` | `openAIResponseToSSE` 合成 OpenAI SSE（含 `tool_calls` deltas） |

## 转换映射

### 请求（Anthropic → OpenAI）

| Anthropic | OpenAI |
|---|---|
| `tools: [{name, description, input_schema}]` | `tools: [{type:"function", function:{name, description, parameters}}]` |
| `tool_choice: {type:"auto"}` | `"auto"` |
| `tool_choice: {type:"any"}` | `"required"` |
| `tool_choice: {type:"tool", name}` | `{type:"function", function:{name}}` |
| assistant `tool_use` block | assistant `tool_calls[]`（`content` 用 `""`，不可为 `null`） |
| user `tool_result` block | 独立 `role:"tool"` 消息（`tool_call_id` + `content`） |
| `image` block（base64/url） | `image_url` content part |
| 内置工具（`web_search` 等） | 跳过（Cloudflare 不支持） |

### 响应（OpenAI → Anthropic）

| OpenAI | Anthropic |
|---|---|
| `message.tool_calls[]` | `tool_use` content block（`input` 为解析后的对象） |
| `finish_reason: "tool_calls"` | `stop_reason: "tool_use"` |
| `finish_reason: "length"` | `stop_reason: "max_tokens"` |
| `finish_reason: "stop"` | `stop_reason: "end_turn"` |

## 两个上游坑（已规避）

1. **assistant `content` 不能为 `null`**：Cloudflare 要求字符串，否则 400
   （`Type mismatch '/messages/N/content' 'string' not in 'null'`）。只有 `tool_use` 的
   assistant 轮次用 `""`。
2. **流式不返回结构化 tool_calls**：Cloudflare 流式端点把工具调用序列化进 `delta.content`
   文本。本网关在**请求带 `tools` 且 `stream:true`** 时改用非流式上游拿结构化结果，再用
   `anthropicMessageToSSE` / `openAIResponseToSSE` 回放成标准 SSE。代价：工具轮次没有逐字
   流式（但工具参数本就不适合逐字消费），普通文本流式不受影响。

## 使用示例

### Anthropic `/v1/messages`

```bash
curl https://cloudai.fuwari.fun/v1/messages \
  -H "x-api-key: sk-cfai-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Weather in Paris?"}],
    "tools": [{
      "name": "get_weather",
      "description": "Get weather for a city",
      "input_schema": {"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}
    }],
    "tool_choice": {"type": "auto"}
  }'
```

响应含 `tool_use` block：

```json
{
  "type": "message", "role": "assistant",
  "content": [{"type":"tool_use","id":"...","name":"get_weather","input":{"city":"Paris"}}],
  "stop_reason": "tool_use",
  "usage": {"input_tokens": 46, "output_tokens": 17}
}
```

### 支持工具调用的模型

并非所有文本模型都支持 function calling。LoRA 微调模型、蒸馏/推理模型（qwq、qwen3、deepseek-r1-distill）、
安全分类器（llama-guard）通常不支持，会返回文本而非工具调用。实测可用工具调用的 15 个模型见
[测试报告](../testing/model-matrix-2026-06-18.md)，典型可用：
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`、`@cf/meta/llama-4-scout-17b-16e-instruct`、
`@cf/mistralai/mistral-small-3.1-24b-instruct`、`@cf/openai/gpt-oss-120b`、`@cf/openai/gpt-oss-20b`、
`@cf/zai-org/glm-5.2`、`@cf/moonshotai/kimi-k2.6` 等。

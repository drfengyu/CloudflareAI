# API 网关

控制台对外暴露 **OpenAI 兼容** 与 **Anthropic 兼容** 端点，供 Claude Code / Codex / Hermes
等工具直接调用 Cloudflare Workers AI 模型。所有请求用平台签发的 API key 鉴权，
并按 key 归属记录用量。

> 状态：P5 实现。以下为目标契约，便于提前对齐。

基础地址：`{NEXT_PUBLIC_APP_URL}/api/v1`

## OpenAI 兼容

- `POST /api/v1/chat/completions` — 支持 `stream: true`（SSE）
- `POST /api/v1/embeddings`
- `GET  /api/v1/models`

### Codex / 通用 OpenAI 客户端

```bash
export OPENAI_BASE_URL="https://<app>.vercel.app/api/v1"
export OPENAI_API_KEY="<本平台签发的 key>"
```

```bash
curl "$OPENAI_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"@cf/meta/llama-4-scout","messages":[{"role":"user","content":"你好"}]}'
```

## Anthropic 兼容（Claude Code）

- `POST /api/v1/messages` — Anthropic Messages 协议，支持 `stream`、`tools`

```bash
export ANTHROPIC_BASE_URL="https://<app>.vercel.app/api/v1"
export ANTHROPIC_AUTH_TOKEN="<本平台签发的 key>"
```

网关内部将 Anthropic Messages ↔ Cloudflare/OpenAI 协议互转，包括：

- `system` 提升为 system 消息，content blocks 拍平
- `tools` / `tool_use` / `tool_result` 往返映射
- 流式事件翻译：`message_start → content_block_start → content_block_delta →
  content_block_stop → message_delta → message_stop`

## 鉴权与配额

- `Authorization: Bearer <key>`；key 在「API 密钥」页创建，仅显示一次。
- 每用户有每日/每月 Neuron 配额，超额返回 `429`。
- 响应中 `proxied` 模型按第三方计费，不占用 neuron 免费额度。

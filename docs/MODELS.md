# Workers AI 模型与分类

## 关键要点（官方）

- **推理端点**
  - 通用：`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}`
  - OpenAI 兼容：`.../ai/v1/chat/completions`、`.../ai/v1/embeddings`、`.../ai/v1/responses`
- **鉴权**：`Authorization: Bearer {CF_API_TOKEN}`
- **模型目录**：`GET .../ai/models/search`，每个模型含 `name`、`task`、`source`、定价与能力
  （`context_window`、`function_calling`、`vision` 等）
- **计费（Neurons）**：$0.011 / 1000 neurons；每日 **10,000 neurons 免费**，00:00 UTC 重置
- **hosted vs proxied**：`source=hosted` 跑在 Cloudflare GPU、计入 neuron 免费额度；
  `source=proxied` 转发至第三方（OpenAI/Anthropic/Google 等），**不走 neuron 免费额度**，
  按第三方价格在其账单计费。UI 必须区分标注。

## 分类映射（`lib/categories.ts`）

| 产品分类 | Cloudflare `task` | 备注 |
| --- | --- | --- |
| 文本生成 | Text Generation | LLM 对话/推理/代码/函数调用 |
| 文生图 | Text-to-Image | FLUX.2 / FLUX.1 等 |
| 图像理解 | Image-to-Text | Llama 3.2 Vision、Gemma 3 等多模态 |
| 语音 | Automatic Speech Recognition / Text-to-Speech | Whisper / MeloTTS |
| 嵌入 | Text Embeddings | Qwen3-Embedding 等 |
| 翻译 | Translation | 多语种 |
| 分类/检测 | Text/Image Classification · Object Detection · Summarization | |
| 视频生成 | —（原生不支持） | 规划接入第三方（Replicate / fal.ai） |

## 代表性模型（随目录变化，以同步结果为准）

- 文本：`@cf/openai/gpt-oss-120b`、`@cf/meta/llama-4-scout`、`@cf/qwen/qwen3-*`、Kimi K2.5
- 文生图：`@cf/black-forest-labs/flux-1-schnell`、FLUX.2 [klein]
- 视觉：`@cf/meta/llama-3.2-11b-vision-instruct`、Gemma 3
- 语音：`@cf/openai/whisper-large-v3-turbo`、`@cf/myshell-ai/melotts`
- 嵌入：Qwen3 Embedding 系列

> ⚠️ 标注 `proxied` 的模型不计入免费额度，请在调用前确认计费来源。

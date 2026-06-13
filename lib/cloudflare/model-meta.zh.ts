/**
 * 模型中文元数据覆盖层。
 *
 * Cloudflare 官方模型目录的描述是英文的。这里按模型 slug（id 的最后一段）提供
 * 中文描述、作者、能力标签，在 catalog 归一化时合并进 NormalizedModel。
 *
 * 数据来源：docs/modellist.md（Workers AI 官方模型列表，79 个模型）。
 * 能力标签：函数调用 / 推理 / 视觉 / 批处理 / 实时 / 合作伙伴 / LoRA / 已弃用 / 测试版。
 */

export interface ModelMetaZh {
  /** 作者/厂商 */
  author: string;
  /** 中文描述 */
  zh: string;
  /** 中文能力标签 */
  tags?: string[];
}

export const MODEL_META_ZH: Record<string, ModelMetaZh> = {
  // ── 文本生成 ──
  "kimi-k2.7-code": {
    author: "Moonshot AI",
    zh: "Kimi K2.7 是前沿规模的开源万亿（1T）参数模型，拥有 26.2 万 token 上下文窗口，支持多轮工具调用、视觉输入与结构化输出，面向智能体工作负载。",
    tags: ["函数调用", "推理", "视觉"],
  },
  "glm-4.7-flash": {
    author: "智谱 AI",
    zh: "GLM-4.7-Flash 是快速高效的多语言文本生成模型，上下文窗口 131,072 token，针对对话、指令遵循与 100+ 语言的多轮工具调用进行了优化。",
    tags: ["函数调用", "推理"],
  },
  "gpt-oss-120b": {
    author: "OpenAI",
    zh: "OpenAI 开放权重模型，专为强大推理、智能体任务和多样化开发场景设计。gpt-oss-120b 面向生产环境、通用用途与高强度推理场景。",
    tags: ["函数调用", "推理"],
  },
  "gpt-oss-20b": {
    author: "OpenAI",
    zh: "OpenAI 开放权重模型，gpt-oss-20b 面向低延迟、本地化或专用场景。",
    tags: ["函数调用", "推理"],
  },
  "llama-4-scout-17b-16e-instruct": {
    author: "Meta",
    zh: "Meta Llama 4 Scout 是 170 亿参数、16 专家的原生多模态模型，采用混合专家（MoE）架构，在文本与图像理解上提供业界领先性能。",
    tags: ["批处理", "函数调用", "视觉"],
  },
  "kimi-k2.6": {
    author: "Moonshot AI",
    zh: "Kimi K2.6 是前沿规模的开源万亿参数模型，26.2 万 token 上下文，支持多轮工具调用、视觉输入与结构化输出。",
    tags: ["函数调用", "推理", "视觉"],
  },
  "gemma-4-26b-a4b-it": {
    author: "Google",
    zh: "Gemma 4 是 Google 最智能的开放模型家族，源自 Gemini 3 研究，旨在最大化单位参数的智能表现。",
    tags: ["函数调用", "推理", "视觉"],
  },
  "nemotron-3-120b-a12b": {
    author: "NVIDIA",
    zh: "NVIDIA Nemotron 3 Super 是混合 MoE 模型，在多智能体应用与专用智能体 AI 系统上具备领先精度。",
    tags: ["函数调用", "推理"],
  },
  "kimi-k2.5": {
    author: "Moonshot AI",
    zh: "Kimi K2.5 是前沿规模开源模型，256k 上下文窗口，支持多轮工具调用、视觉输入与结构化输出。",
    tags: ["函数调用", "推理", "视觉", "已弃用"],
  },
  "granite-4.0-h-micro": {
    author: "IBM",
    zh: "Granite 4.0 指令模型在各项基准上表现强劲，在指令遵循与函数调用等关键智能体任务上达到业界领先，适合 RAG、多智能体工作流与边缘部署。",
    tags: ["函数调用"],
  },
  "gemma-sea-lion-v4-27b-it": {
    author: "AI Singapore",
    zh: "SEA-LION（东南亚语言一体化网络）是为东南亚地区预训练和指令微调的大语言模型集合。",
  },
  "mistral-small-3.1-24b-instruct": {
    author: "Mistral AI",
    zh: "在 Mistral Small 3 基础上，3.1 版本增加了顶尖视觉理解能力，并将长上下文扩展至 128k token，同时保持文本性能。240 亿参数，文本与视觉任务俱佳。",
    tags: ["函数调用"],
  },
  "qwen3-30b-a3b-fp8": {
    author: "通义千问 Qwen",
    zh: "Qwen3 是通义千问系列最新一代大语言模型，提供密集与混合专家（MoE）模型，在推理、指令遵循、智能体能力与多语言支持上有突破性进展。",
    tags: ["批处理", "函数调用", "推理"],
  },
  "gemma-3-12b-it": {
    author: "Google",
    zh: "Gemma 3 适合多种文本生成与图像理解任务，包括问答、摘要与推理。多模态，支持文本与图像输入，128K 上下文，支持 140+ 语言。",
    tags: ["LoRA", "已弃用"],
  },
  "qwq-32b": {
    author: "通义千问 Qwen",
    zh: "QwQ 是 Qwen 系列的推理模型，具备思考与推理能力，在复杂难题上性能显著提升。QwQ-32B 是中等规模推理模型，可与 DeepSeek-R1、o1-mini 等顶尖推理模型竞争。",
    tags: ["LoRA", "推理"],
  },
  "qwen2.5-coder-32b-instruct": {
    author: "通义千问 Qwen",
    zh: "Qwen2.5-Coder 是最新的代码专用 Qwen 大语言模型系列（前身 CodeQwen），覆盖 0.5B 到 32B 六种规模，满足不同开发者需求。",
    tags: ["LoRA"],
  },
  "llama-guard-3-8b": {
    author: "Meta",
    zh: "Llama Guard 3 基于 Llama-3.1-8B 预训练并针对内容安全分类微调，可对 LLM 输入（提示分类）和输出（响应分类）进行安全判定，并列出违规内容类别。",
    tags: ["LoRA"],
  },
  "deepseek-r1-distill-qwen-32b": {
    author: "DeepSeek",
    zh: "DeepSeek-R1-Distill-Qwen-32B 基于 Qwen2.5 从 DeepSeek-R1 蒸馏而来，在多项基准上超越 OpenAI-o1-mini，达到密集模型的新最优水平。",
    tags: ["推理"],
  },
  "llama-3.3-70b-instruct-fp8-fast": {
    author: "Meta",
    zh: "Llama 3.3 70B 量化为 fp8 精度，优化以提升速度。",
    tags: ["批处理", "函数调用"],
  },
  "llama-3.2-1b-instruct": {
    author: "Meta",
    zh: "Llama 3.2 纯文本指令微调模型，针对多语言对话场景优化，包括智能体检索与摘要任务。",
  },
  "llama-3.2-3b-instruct": {
    author: "Meta",
    zh: "Llama 3.2 纯文本指令微调模型，针对多语言对话场景优化，包括智能体检索与摘要任务。",
  },
  "llama-3.2-11b-vision-instruct": {
    author: "Meta",
    zh: "Llama 3.2-Vision 指令微调模型，针对视觉识别、图像推理、图像描述以及关于图像的通用问答进行了优化。",
    tags: ["LoRA", "视觉"],
  },
  "llama-3.1-8b-instruct-awq": {
    author: "Meta",
    zh: "Meta 出品的量化（int4）生成式文本模型，80 亿参数。",
    tags: ["已弃用"],
  },
  "llama-3.1-8b-instruct-fp8": {
    author: "Meta",
    zh: "Llama 3.1 8B 量化为 FP8 精度。",
  },
  "llama-3.1-8b-instruct": {
    author: "Meta",
    zh: "Meta Llama 3.1 多语言大语言模型集合，指令微调的纯文本模型针对多语言对话场景优化，在常见行业基准上超越许多开源与闭源聊天模型。",
    tags: ["已弃用"],
  },
  "llama-3.1-8b-instruct-fast": {
    author: "Meta",
    zh: "【快速版】Meta Llama 3.1 多语言大语言模型集合，针对多语言对话场景优化。",
  },
  "llama-3.1-70b-instruct": {
    author: "Meta",
    zh: "Meta Llama 3.1 多语言大语言模型集合，指令微调的纯文本模型针对多语言对话场景优化。",
    tags: ["已弃用"],
  },
  "meta-llama-3-8b-instruct": {
    author: "Meta",
    zh: "Meta Llama 3 在众多行业基准上展现最先进性能，并提供包括增强推理在内的新能力。",
    tags: ["已弃用"],
  },
  "llama-3-8b-instruct": {
    author: "Meta",
    zh: "Meta Llama 3 在众多行业基准上展现最先进性能，并提供包括增强推理在内的新能力。",
    tags: ["已弃用"],
  },
  "llama-3-8b-instruct-awq": {
    author: "Meta",
    zh: "Meta 出品的量化（int4）生成式文本模型，80 亿参数。",
    tags: ["已弃用"],
  },
  "mistral-7b-instruct-v0.2": {
    author: "Mistral AI",
    zh: "Mistral-7B-Instruct-v0.2 是 Mistral-7B-v0.2 的指令微调版本，32k 上下文窗口，rope-theta = 1e6，无滑动窗口注意力。",
    tags: ["LoRA", "已弃用", "测试版"],
  },
  "mistral-7b-instruct-v0.2-lora": {
    author: "Mistral AI",
    zh: "Mistral-7B-Instruct-v0.2 的指令微调版本，支持 LoRA 适配器。",
    tags: ["LoRA", "测试版"],
  },
  "mistral-7b-instruct-v0.1": {
    author: "Mistral AI",
    zh: "Mistral-7b 生成式文本模型的指令微调版本，70 亿参数。",
    tags: ["LoRA", "已弃用"],
  },
  "gemma-7b-it-lora": {
    author: "Google",
    zh: "Cloudflare 专用于 LoRA 适配器推理的 Gemma-7B 基础模型。Gemma 是 Google 的轻量级最先进开放模型家族。",
    tags: ["LoRA", "测试版"],
  },
  "gemma-2b-it-lora": {
    author: "Google",
    zh: "Cloudflare 专用于 LoRA 适配器推理的 Gemma-2B 基础模型。",
    tags: ["LoRA", "测试版"],
  },
  "gemma-7b-it": {
    author: "Google",
    zh: "Gemma 是 Google 轻量级最先进开放模型家族，源自创建 Gemini 的同一研究与技术。纯文本解码器模型，提供英文开放权重、预训练与指令微调变体。",
    tags: ["LoRA", "已弃用", "测试版"],
  },
  "llama-2-7b-chat-hf-lora": {
    author: "Meta",
    zh: "Cloudflare 专用于 LoRA 适配器推理的 Llama2 基础模型。Llama 2 是 70 亿到 700 亿参数的预训练与微调生成式文本模型集合，本款为针对对话优化的 7B 微调模型。",
    tags: ["LoRA", "测试版"],
  },
  "llama-2-7b-chat-fp16": {
    author: "Meta",
    zh: "Meta 出品的全精度（fp16）生成式文本模型，70 亿参数。",
    tags: ["已弃用"],
  },
  "llama-2-7b-chat-int8": {
    author: "Meta",
    zh: "Meta 出品的量化（int8）生成式文本模型，70 亿参数。",
    tags: ["已弃用"],
  },
  "hermes-2-pro-mistral-7b": {
    author: "Nous Research",
    zh: "基于 Mistral 7B 的 Hermes 2 Pro 是全新旗舰 7B Hermes，是 Nous Hermes 2 的升级重训版本，新增了内部研发的函数调用与 JSON 模式数据集。",
    tags: ["函数调用", "已弃用", "测试版"],
  },
  "phi-2": {
    author: "Microsoft",
    zh: "Phi-2 是基于 Transformer 的下一词预测模型，在 1.4T token 上训练（合成与网络数据混合），用于 NLP 与编程。",
    tags: ["已弃用", "测试版"],
  },
  "sqlcoder-7b-2": {
    author: "Defog",
    zh: "本模型面向非技术用户，帮助他们理解 SQL 数据库中的数据。",
    tags: ["已弃用", "测试版"],
  },

  // ── 文生图 ──
  "flux-2-klein-9b": {
    author: "Black Forest Labs",
    zh: "FLUX.2 [klein] 9B 是超快速蒸馏图像模型，画质增强。单一模型统一图像生成与编辑，提供顶尖质量，支持交互式工作流、实时预览与低延迟应用。",
    tags: ["合作伙伴"],
  },
  "flux-2-klein-4b": {
    author: "Black Forest Labs",
    zh: "FLUX.2 [klein] 是超快速蒸馏图像模型。单一模型统一图像生成与编辑，支持交互式工作流、实时预览与低延迟应用。",
    tags: ["合作伙伴"],
  },
  "flux-2-dev": {
    author: "Black Forest Labs",
    zh: "FLUX.2 [dev] 是 Black Forest Labs 的图像模型，可生成高度逼真细致的图像，并支持多参考图。",
    tags: ["合作伙伴"],
  },
  "flux-1-schnell": {
    author: "Black Forest Labs",
    zh: "FLUX.1 [schnell] 是 120 亿参数的矫正流 Transformer，可根据文本描述生成图像。",
  },
  "lucid-origin": {
    author: "Leonardo",
    zh: "Leonardo.AI 的 Lucid Origin 是迄今最具适应性、最贴合提示词的模型，能精准遵循提示、准确渲染文字，支持从风格化概念艺术到精致产品效果图的多种视觉风格。",
    tags: ["合作伙伴"],
  },
  "phoenix-1.0": {
    author: "Leonardo",
    zh: "Phoenix 1.0 是 Leonardo.Ai 的模型，生成的图像具备出色的提示遵循度与连贯的文字渲染。",
    tags: ["合作伙伴"],
  },
  "stable-diffusion-xl-lightning": {
    author: "ByteDance",
    zh: "SDXL-Lightning 是闪电般快速的文生图模型，可在几步内生成高质量 1024px 图像。",
    tags: ["测试版"],
  },
  "dreamshaper-8-lcm": {
    author: "Lykon",
    zh: "经过微调的 Stable Diffusion 模型，在不牺牲表现范围的前提下提升照片级真实感。",
  },
  "stable-diffusion-v1-5-img2img": {
    author: "RunwayML",
    zh: "Stable Diffusion 是潜在文生图扩散模型，可生成照片级真实图像。img2img 可由输入图像生成新图像。",
    tags: ["测试版"],
  },
  "stable-diffusion-v1-5-inpainting": {
    author: "RunwayML",
    zh: "Stable Diffusion Inpainting 是潜在文生图扩散模型，可根据文本生成照片级图像，并支持使用蒙版对图片进行局部重绘。",
    tags: ["测试版"],
  },
  "stable-diffusion-xl-base-1.0": {
    author: "Stability.ai",
    zh: "Stability AI 的扩散式文生图生成模型，可根据文本提示生成与修改图像。",
    tags: ["测试版"],
  },

  // ── 图像理解 ──
  "llava-1.5-7b-hf": {
    author: "llava-hf",
    zh: "LLaVA 是通过在 GPT 生成的多模态指令数据上微调 LLaMA/Vicuna 训练的开源聊天机器人，是基于 Transformer 架构的自回归语言模型。",
    tags: ["测试版"],
  },
  "uform-gen2-qwen-500m": {
    author: "Unum",
    zh: "UForm-Gen 是小型生成式视觉语言模型，主要用于图像描述与视觉问答。在内部图像描述数据集预训练，并在 SVIT、LVIS、VQA 等公开指令数据集上微调。",
    tags: ["已弃用", "测试版"],
  },

  // ── 嵌入 ──
  "plamo-embedding-1b": {
    author: "pfnet",
    zh: "PLaMo-Embedding-1B 是 Preferred Networks 开发的日语文本嵌入模型，可将日语文本转为数值向量，用于信息检索、文本分类与聚类等场景。",
  },
  "embeddinggemma-300m": {
    author: "Google",
    zh: "EmbeddingGemma 是 Google 的 3 亿参数开放嵌入模型，同等规模下达到最先进水平，源自 Gemma 3。生成文本向量表示，适合搜索检索、分类、聚类与语义相似度，支持 100+ 语言。",
  },
  "qwen3-embedding-0.6b": {
    author: "通义千问 Qwen",
    zh: "Qwen3 Embedding 是 Qwen 家族最新的专有模型系列，专为文本嵌入与排序任务设计。",
  },
  "bge-m3": {
    author: "BAAI 智源",
    zh: "多功能、多语言、多粒度的嵌入模型。",
  },
  "bge-large-en-v1.5": {
    author: "BAAI 智源",
    zh: "BAAI 通用嵌入（大）模型，将任意文本转换为 1024 维向量。",
    tags: ["批处理"],
  },
  "bge-small-en-v1.5": {
    author: "BAAI 智源",
    zh: "BAAI 通用嵌入（小）模型，将任意文本转换为 384 维向量。",
    tags: ["批处理"],
  },
  "bge-base-en-v1.5": {
    author: "BAAI 智源",
    zh: "BAAI 通用嵌入（基础）模型，将任意文本转换为 768 维向量。",
    tags: ["批处理"],
  },

  // ── 文本分类 / 重排 ──
  "bge-reranker-base": {
    author: "BAAI 智源",
    zh: "与嵌入模型不同，重排器以问题和文档为输入，直接输出相似度而非嵌入向量。可通过 sigmoid 将分数映射到 [0,1]。",
  },
  "distilbert-sst-2-int8": {
    author: "HuggingFace",
    zh: "在 SST-2 上微调的蒸馏 BERT 模型，用于情感分类。",
  },

  // ── 语音转文本 (ASR) ──
  "flux": {
    author: "Deepgram",
    zh: "Flux 是首个专为语音智能体打造的对话式语音识别模型。",
    tags: ["合作伙伴", "实时"],
  },
  "nova-3": {
    author: "Deepgram",
    zh: "使用 Deepgram 语音转文本模型转写音频。",
    tags: ["批处理", "合作伙伴", "实时"],
  },
  "whisper-large-v3-turbo": {
    author: "OpenAI",
    zh: "Whisper 是用于自动语音识别（ASR）与语音翻译的预训练模型。",
    tags: ["批处理"],
  },
  "whisper-tiny-en": {
    author: "OpenAI",
    zh: "Whisper 是自动语音识别预训练模型。在 68 万小时标注数据上训练，无需微调即可泛化到众多数据集与领域。本款为仅英文的 Whisper Tiny 版本。",
    tags: ["测试版"],
  },
  "whisper": {
    author: "OpenAI",
    zh: "Whisper 是通用语音识别模型，在大规模多样化音频数据上训练，可执行多语言语音识别、语音翻译与语言识别。",
  },

  // ── 文本转语音 (TTS) ──
  "aura-2-es": {
    author: "Deepgram",
    zh: "Aura-2 是上下文感知的文本转语音（TTS）模型，根据文本上下文应用自然停顿、表现力与语气词。西班牙语。",
    tags: ["批处理", "合作伙伴", "实时"],
  },
  "aura-2-en": {
    author: "Deepgram",
    zh: "Aura-2 是上下文感知的文本转语音（TTS）模型，根据文本上下文应用自然停顿、表现力与语气词。英语。",
    tags: ["批处理", "合作伙伴", "实时"],
  },
  "aura-1": {
    author: "Deepgram",
    zh: "Aura 是上下文感知的文本转语音（TTS）模型，根据文本上下文应用自然停顿、表现力与语气词。",
    tags: ["批处理", "合作伙伴", "实时"],
  },
  "melotts": {
    author: "MyShell",
    zh: "MeloTTS 是 MyShell.ai 的高质量多语言文本转语音库。",
  },

  // ── 翻译 ──
  "indictrans2-en-indic-1B": {
    author: "AI4Bharat",
    zh: "IndicTrans2 是首个开源的基于 Transformer 的多语言神经机器翻译模型，支持全部 22 种印度官方语言的高质量翻译。",
  },
  "m2m100-1.2b": {
    author: "Meta",
    zh: "多语言编码器-解码器（seq-to-seq）模型，针对多对多多语言翻译训练。",
    tags: ["批处理"],
  },

  // ── 摘要 ──
  "bart-large-cnn": {
    author: "Meta",
    zh: "BART 是带双向（类 BERT）编码器和自回归（类 GPT）解码器的 Transformer seq2seq 模型，可用于文本摘要。",
    tags: ["已弃用", "测试版"],
  },

  // ── 目标检测 / 图像分类 ──
  "detr-resnet-50": {
    author: "Meta",
    zh: "DEtection TRansformer（DETR）模型，在 COCO 2017 目标检测数据集（11.8 万标注图像）上端到端训练。",
    tags: ["测试版"],
  },
  "resnet-50": {
    author: "Microsoft",
    zh: "50 层深度的图像分类 CNN，在 ImageNet 100 万+ 图像上训练。",
  },

  // ── 语音活动检测 ──
  "smart-turn-v2": {
    author: "Pipecat",
    zh: "开源、社区驱动的原生音频对话轮次检测模型（第 2 版）。",
    tags: ["批处理", "实时"],
  },
};

/**
 * 厂商 Logo（SVG）。键为 MODEL_META_ZH 中使用的 author 字符串。
 * 资源来自 Cloudflare 文档站（docs/modellist.md 引用的 _astro/*.svg）。
 * 未在官方列表中提供 logo 的厂商（pfnet、AI Singapore、AI4Bharat、
 * llava-hf、Nous Research、Lykon）留空，UI 回退到首字母占位。
 */
const CF_ASTRO = "https://developers.cloudflare.com/_astro";
export const AUTHOR_LOGOS: Record<string, string> = {
  "Moonshot AI": `${CF_ASTRO}/moonshotai.D9EBG7kx.svg`,
  "智谱 AI": `${CF_ASTRO}/zai.Dj2vcayE.svg`,
  OpenAI: `${CF_ASTRO}/openai.BI8PEEzI.svg`,
  Meta: `${CF_ASTRO}/meta.BR4nfp35.svg`,
  Google: `${CF_ASTRO}/google.DyXKPTPP.svg`,
  NVIDIA: `${CF_ASTRO}/nvidia.y1O6VlZA.svg`,
  IBM: `${CF_ASTRO}/ibm.CNSuznmO.svg`,
  "Mistral AI": `${CF_ASTRO}/mistralai.Bn9UMUMu.svg`,
  "通义千问 Qwen": `${CF_ASTRO}/qwen.CVqFFn5h.svg`,
  DeepSeek: `${CF_ASTRO}/deepseek.nPIT6fwR.svg`,
  Microsoft: `${CF_ASTRO}/microsoft.LujcDJ--.svg`,
  Defog: `${CF_ASTRO}/defog.BeLrxE1p.svg`,
  "Black Forest Labs": `${CF_ASTRO}/blackforestlabs.Ccs-Y4-D.svg`,
  Leonardo: `${CF_ASTRO}/leonardo.Ch-T5rST.svg`,
  ByteDance: `${CF_ASTRO}/bytedance.T1uiROQ6.svg`,
  RunwayML: `${CF_ASTRO}/runway.Cq8Cjov4.svg`,
  "Stability.ai": `${CF_ASTRO}/stabilityai.CmlmNdqR.svg`,
  Unum: `${CF_ASTRO}/unum.Cjjoj0_o.svg`,
  "BAAI 智源": `${CF_ASTRO}/baai.mOtdbKlV.svg`,
  HuggingFace: `${CF_ASTRO}/huggingface.ngjt5u2J.svg`,
  Deepgram: `${CF_ASTRO}/deepgram.BYzW8KfF.svg`,
  MyShell: `${CF_ASTRO}/myshell.BpTDMxd2.svg`,
  Pipecat: `${CF_ASTRO}/pipecat.B-PNBdef.svg`,
};

/** 从模型 id（如 @cf/meta/llama-3.1-8b-instruct）提取 slug（最后一段）。 */
export function slugFromId(id: string): string {
  return id.split("/").pop() ?? id;
}

/** 查找模型的中文元数据。 */
export function metaForId(id: string): ModelMetaZh | undefined {
  return MODEL_META_ZH[slugFromId(id)];
}

/** 按作者查找厂商 Logo URL（无则返回 undefined）。 */
export function logoForAuthor(author: string | undefined): string | undefined {
  return author ? AUTHOR_LOGOS[author] : undefined;
}

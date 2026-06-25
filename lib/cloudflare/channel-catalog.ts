import { db } from "@/lib/db/d1-http";
import { channels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/channels/registry";
import type { NormalizedModel } from "./catalog";
import { logoForAuthor } from "./model-meta.zh";

/**
 * 从 model_pricing 表中读取某个渠道关联的所有模型。
 * 返回 NormalizedModel 格式，供 ModelBrowser 展示。
 */
export async function fetchChannelModels(
  channelId: string,
  channelType: string,
  channelName?: string,
): Promise<NormalizedModel[]> {
  const adapter = getAdapter(channelType);
  if (!adapter || !adapter.listModels) return [];

  const channelRow = await db
    .select({ config: channels.config })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!channelRow[0]) return [];

  let configObj: Record<string, unknown> = {};
  try {
    configObj = channelRow[0].config ? JSON.parse(channelRow[0].config) : {};
  } catch {
    // ignore
  }

  const remoteModels = await adapter.listModels({ config: configObj });

  return remoteModels.map((m) => {
    const vendor = extractVendor(m.id);
    const author = vendor || m.owned_by || channelName || channelLabel(channelType);

    // 从上游 type 映射到本项目的 category
    let category: "text" | "image" | "embeddings" | "speech" | "vision" | "translate" | "video" | "classify" = "text";
    if (m.type === "language") category = "text";
    else if (m.type === "embedding") category = "embeddings";
    else if (m.type === "image") category = "image";
    else if (m.type === "speech" || m.type === "transcription") category = "speech";
    else if (m.type === "video") category = "video";
    else if (m.type === "reranking") category = "classify";

    return {
      id: m.id,
      name: m.name || friendlyName(m.id),
      description: m.description || "",
      task: m.type === "language" ? "Text Generation" : m.type || "Text Generation",
      category,
      source: "proxied" as const,
      channelSource: channelType,
      beta: false,
      contextWindow: m.context_window,
      functionCalling: m.tags?.includes("tool-use") ?? true,
      pricing: [],
      author,
      channelName: channelName,
      logo: logoForAuthor(author),
      // 保留原始 tags
      tags: m.tags,
      // 保留上游定价（美元/token）
      upstreamPricing: m.pricing ? {
        input: parseFloat(m.pricing.input || "0"),
        output: parseFloat(m.pricing.output || "0"),
      } : undefined,
    };
  });
}

/**
 * 获取所有已启用渠道的模型列表（用于模型库多 tab 展示）。
 */
export async function fetchAllChannelsModels(): Promise<{
  channels: { id: string; type: string; name: string; label: string }[];
  modelsByChannel: Record<string, NormalizedModel[]>;
}> {
  const channelRows = await db
    .select({ id: channels.id, name: channels.name, type: channels.type })
    .from(channels)
    .where(eq(channels.status, 1));

  const result: Record<string, NormalizedModel[]> = {};

  for (const ch of channelRows) {
    if (ch.type === "cloudflare") continue; // Cloudflare 单独处理
    if (!ch.type) continue;
    const models = await fetchChannelModels(ch.id, ch.type, ch.name);
    result[ch.id] = models;
  }

  return {
    channels: channelRows
      .filter((c) => c.type !== "cloudflare" && c.type)
      .map((c) => ({
        id: c.id,
        type: c.type!,
        name: c.name,
        label: c.name, // 使用渠道名称而不是类型标签
      })),
    modelsByChannel: result,
  };
}

function friendlyName(id: string): string {
  const seg = id.split("/").pop() ?? id;
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 从模型 ID 中提取真实厂商名。
 *
 * 规则：
 * - 包含 "/" 的取斜杠前的部分（如 "meta-llama/Llama-3.3-70B" → "meta-llama"）
 * - 不含斜杠时，尝试匹配常见厂商前缀
 * - 都匹配不到返回 null
 */
function extractVendor(modelId: string): string | null {
  // 1. 优先取斜杠前部分
  if (modelId.includes("/")) {
    const vendor = modelId.split("/")[0];
    return formatVendorName(vendor);
  }

  // 2. 常见厂商前缀匹配（不带斜杠的情况）
  const id = modelId.toLowerCase();
  const prefixes: Record<string, string> = {
    "gpt-": "OpenAI",
    "o1-": "OpenAI",
    "o3-": "OpenAI",
    "claude-": "Anthropic",
    "gemini-": "Google",
    "deepseek": "DeepSeek",
    "llama": "Meta",
    "mistral": "Mistral",
    "mixtral": "Mistral",
    "qwen": "Qwen",
    "yi-": "01.AI",
    "command-": "Cohere",
    "flux": "Black Forest Labs",
    "stable-diffusion": "Stability AI",
    "sd-": "Stability AI",
    "whisper": "OpenAI",
    "phi-": "Microsoft",
    "grok": "xAI",
  };

  for (const [prefix, vendor] of Object.entries(prefixes)) {
    if (id.startsWith(prefix) || id.includes(prefix)) {
      return vendor;
    }
  }

  return null;
}

/**
 * 格式化 vendor slug 为可显示的名称。
 * - "meta-llama" → "Meta Llama"
 * - "openai" → "OpenAI"
 * - "mistralai" → "Mistral AI"
 */
function formatVendorName(slug: string): string {
  const aliases: Record<string, string> = {
    "openai": "OpenAI",
    "meta-llama": "Meta",
    "meta": "Meta",
    "mistralai": "Mistral AI",
    "mistral": "Mistral",
    "deepseek-ai": "DeepSeek",
    "deepseek": "DeepSeek",
    "google": "Google",
    "anthropic": "Anthropic",
    "qwen": "Qwen",
    "01-ai": "01.AI",
    "cohere": "Cohere",
    "stabilityai": "Stability AI",
    "microsoft": "Microsoft",
    "huggingfaceh4": "HuggingFace",
    "nousresearch": "Nous Research",
    "togethercomputer": "Together",
    "xai": "xAI",
  };

  const lower = slug.toLowerCase();
  if (aliases[lower]) return aliases[lower];

  // 默认格式化：连字符转空格 + 首字母大写
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function channelLabel(type: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    deepseek: "DeepSeek",
    anthropic: "Anthropic",
    azure: "Azure",
    "openai-compatible": "第三方",
  };
  return labels[type] || type;
}

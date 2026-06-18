import { db } from "@/lib/db/d1-http";
import { channels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/channels/registry";
import type { NormalizedModel } from "./catalog";

/**
 * 从 model_pricing 表中读取某个渠道关联的所有模型。
 * 返回 NormalizedModel 格式，供 ModelBrowser 展示。
 */
export async function fetchChannelModels(
  channelId: string,
  channelType: string,
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

  return remoteModels.map((m) => ({
    id: m.id,
    name: friendlyName(m.id),
    description: "",
    task: "Text Generation",
    category: channelType === "image" ? "image" : "text" as any,
    source: "proxied" as const,
    channelSource: channelType,
    beta: false,
    contextWindow: undefined,
    functionCalling: true,
    pricing: [],
    author: channelLabel(channelType),
  }));
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
    const models = await fetchChannelModels(ch.id, ch.type);
    result[ch.id] = models;
  }

  return {
    channels: channelRows
      .filter((c) => c.type !== "cloudflare" && c.type)
      .map((c) => ({
        id: c.id,
        type: c.type!,
        name: c.name,
        label: channelLabel(c.type!),
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

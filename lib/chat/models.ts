import { eq } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";

export type ChatModelOption = {
  id: string;
  name: string;
  channel: string;
  contextWindow?: number;
};

/**
 * 可对话的文本模型：Cloudflare hosted 文本模型 + 已启用渠道里定价表标为 text/embeddings 的模型。
 * `/playground/text` 与 `/chat` 共用，避免两处各写一份筛选逻辑。
 */
export async function listTextModelOptions(): Promise<ChatModelOption[]> {
  const catalog = await fetchModelCatalog();
  const cfModels: ChatModelOption[] = catalog
    .filter((m) => m.category === "text" && m.source === "hosted" && !m.requireWorkersPaid)
    .map((m) => ({
      id: m.id,
      name: m.name,
      channel: "cloudflare",
      contextWindow: m.contextWindow,
    }));

  const channelRows = await db
    .select({ id: channels.id, type: channels.type, name: channels.name })
    .from(channels)
    .where(eq(channels.status, 1));

  const otherModels: ChatModelOption[] = [];
  for (const ch of channelRows) {
    if (ch.type === "cloudflare") continue;

    const pricingRows = await db
      .select({ modelId: modelPricing.modelId, category: modelPricing.category })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, ch.id));

    const textModelIds = new Set(
      pricingRows
        .filter((p) => p.category === "text" || p.category === "embeddings")
        .map((p) => p.modelId),
    );
    if (textModelIds.size === 0) continue;

    const channelModels = await fetchChannelModels(ch.id, ch.type || "", ch.name);
    for (const meta of channelModels) {
      if (!textModelIds.has(meta.id)) continue;
      otherModels.push({
        id: meta.id,
        name: meta.name || meta.id.split("/").pop() || meta.id,
        channel: ch.name || ch.type || "other",
        contextWindow: meta.contextWindow,
      });
    }
  }

  const seen = new Set<string>();
  return [...cfModels, ...otherModels].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

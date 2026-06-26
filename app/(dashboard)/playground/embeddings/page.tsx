import { PageHeader } from "@/components/dashboard/page-header";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EmbeddingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EmbeddingsPage() {
  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.category === "embeddings" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  // 渠道 embedding 模型
  const channelRows = await db
    .select({ id: channels.id, type: channels.type, name: channels.name })
    .from(channels)
    .where(eq(channels.status, 1));

  const otherModels: { id: string; name: string; channel: string }[] = [];

  for (const ch of channelRows) {
    if (ch.type === "cloudflare") continue;

    const pricingAll = await db
      .select({ modelId: modelPricing.modelId, category: modelPricing.category })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, ch.id));

    const embIds = new Set(
      pricingAll
        .filter((p) => p.category === "embeddings" || /embedding/i.test(p.modelId))
        .map((p) => p.modelId)
    );
    if (embIds.size === 0) continue;

    const channelModels = await fetchChannelModels(ch.id, ch.type || "", ch.name);

    for (const modelMeta of channelModels) {
      if (!embIds.has(modelMeta.id)) continue;
      otherModels.push({
        id: modelMeta.id,
        name: modelMeta.name || modelMeta.id.split("/").pop() || modelMeta.id,
        channel: ch.name || ch.type || "other",
      });
    }
  }

  const seen = new Set<string>();
  const allModels = [...models, ...otherModels].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <>
      <PageHeader title="嵌入向量" description="将文本转换为向量表示，用于相似度计算或检索" />
      {allModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的嵌入模型
        </div>
      ) : (
        <EmbeddingsClient models={allModels} />
      )}
    </>
  );
}

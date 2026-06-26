import { PageHeader } from "@/components/dashboard/page-header";
import { ImageGenPlayground } from "@/components/playground/image-gen";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ImagePlaygroundPage() {
  const catalog = await fetchModelCatalog();
  const imageModels = catalog
    .filter((m) => m.category === "image" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  // 渠道文生图模型
  const channelRows = await db
    .select({ id: channels.id, type: channels.type, name: channels.name })
    .from(channels)
    .where(eq(channels.status, 1));

  const otherModels: { id: string; name: string; channel: string }[] = [];

  for (const ch of channelRows) {
    if (ch.type === "cloudflare") continue;

    // 只保留 isImage=1 的图像模型
    const pricingAll = await db
      .select({ modelId: modelPricing.modelId, isImage: modelPricing.isImage })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, ch.id));

    const imgIds = new Set(pricingAll.filter((p) => p.isImage === 1).map((p) => p.modelId));
    if (imgIds.size === 0) continue;

    const channelModels = await fetchChannelModels(ch.id, ch.type || "", ch.name);

    for (const modelMeta of channelModels) {
      if (!imgIds.has(modelMeta.id)) continue;
      otherModels.push({
        id: modelMeta.id,
        name: modelMeta.name || modelMeta.id.split("/").pop() || modelMeta.id,
        channel: ch.name || ch.type || "other",
      });
    }
  }

  // 去重 + 合并
  const seen = new Set<string>();
  const allModels = [...imageModels, ...otherModels].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <>
      <PageHeader
        title="文生图"
        description="从文本提示词生成图像，支持步数与引导强度调节"
      />
      {allModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的文生图模型
        </div>
      ) : (
        <ImageGenPlayground models={allModels} />
      )}
    </>
  );
}

import { PageHeader } from "@/components/dashboard/page-header";
import { VisionPlayground } from "@/components/playground/vision";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function VisionPlaygroundPage() {
  const catalog = await fetchModelCatalog();
  const visionModels = catalog
    .filter((m) => m.category === "vision" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  // 渠道 vision 模型（category=vision 或 modelId 含 vl/vision）
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

    const visionIds = new Set(
      pricingAll
        .filter((p) => p.category === "vision" || /vl-|vision/i.test(p.modelId))
        .map((p) => p.modelId)
    );
    if (visionIds.size === 0) continue;

    const channelModels = await fetchChannelModels(ch.id, ch.type || "", ch.name);

    for (const modelMeta of channelModels) {
      if (!visionIds.has(modelMeta.id)) continue;
      otherModels.push({
        id: modelMeta.id,
        name: modelMeta.name || modelMeta.id.split("/").pop() || modelMeta.id,
        channel: ch.name || ch.type || "other",
      });
    }
  }

  const seen = new Set<string>();
  const allModels = [...visionModels, ...otherModels].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <>
      <PageHeader
        title="图像理解"
        description="上传图片并提问，AI 分析图像内容"
      />
      {allModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的图像理解模型
        </div>
      ) : (
        <VisionPlayground models={allModels} />
      )}
    </>
  );
}

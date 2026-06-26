import { redirect } from "next/navigation";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, modelPricing, channels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { PricingManager } from "./pricing-manager";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { getCreditsPerUsd } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const userId = await requireUser();
  const userRows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRows[0] || userRows[0].role < 10) redirect("/dashboard");

  // 所有启用渠道
  const channelRows = await db
    .select({ id: channels.id, name: channels.name, type: channels.type })
    .from(channels)
    .where(eq(channels.status, 1));

  const channelList = channelRows
    .filter((c) => c.type && c.type !== "cloudflare")
    .map((c) => ({ id: c.id, name: c.name, type: c.type!, label: c.name }));

  // 定价数据
  const [catalog, pricingRows, ratio] = await Promise.all([
    fetchModelCatalog(),
    db.select().from(modelPricing),
    getCreditsPerUsd(),
  ]);

  const pricingMap = new Map(
    pricingRows.map((row) => [
      row.modelId,
      {
        category: row.category,
        source: row.source,
        inputPrice: row.inputPrice,
        outputPrice: row.outputPrice,
        unit: row.unit,
        isImage: row.isImage === 1,
        fixedPrice: row.fixedPrice,
        multiplier: row.multiplier ?? 1.0,
        updatedAt: row.updatedAt,
      },
    ]),
  );

  // Cloudflare 模型
  const cfModels = catalog.map((model) => {
    const pricing = pricingMap.get(model.id);
    return {
      id: model.id,
      name: model.name,
      category: model.category,
      source: model.source,
      channelSource: "cloudflare" as const,
      pricing,
    };
  });

  // 非 Cloudflare 渠道模型：直接从 model_pricing 表读取，不调用外部 API
  const channelModels: Array<{
    id: string;
    name: string;
    category: string;
    source: string;
    channelSource?: string;
    channelId?: string;
    pricing?: (typeof cfModels)[0]["pricing"];
  }> = [];

  for (const ch of channelList) {
    const pricingForChannel = pricingRows.filter((r) => r.channelId === ch.id);
    for (const row of pricingForChannel) {
      channelModels.push({
        id: row.modelId,
        name: friendlyName(row.modelId),
        category: row.category || "text",
        source: ch.type,
        channelSource: ch.type,
        channelId: ch.id,
        pricing: pricingMap.get(row.modelId),
      });
    }
  }

  return (
    <>
      <PageHeader
        title="定价管理"
        description="调整各渠道模型定价倍率（基础价格 × 倍率 = 最终价格）"
      />
      <PricingManager
        models={cfModels}
        ratio={ratio}
        channelModels={channelModels}
        channels={channelList}
      />
    </>
  );
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    deepseek: "DeepSeek",
    anthropic: "Anthropic",
    azure: "Azure",
    "openai-compatible": "第三方",
  };
  return labels[type] || type;
}

function friendlyName(id: string): string {
  const seg = id.split("/").pop() ?? id;
  return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

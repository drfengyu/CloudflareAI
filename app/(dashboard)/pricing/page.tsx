import { PageHeader } from "@/components/dashboard/page-header";
import { PricingTabs } from "@/components/pricing/pricing-tabs";
import { fetchModelCatalog, type NormalizedModel } from "@/lib/cloudflare/catalog";
import { getDisplayPrice } from "@/lib/billing/display-price";
import { getAllModelPricing } from "@/lib/billing/model-pricing";
import { getCreditsPerUsd, creditsToUsd } from "@/lib/billing/credits";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER = ["text", "image", "vision", "embeddings", "translate", "speech", "video"];

export default async function PricingPage() {
  const [cfModels, pricingMap, ratio, channelRows] = await Promise.all([
    fetchModelCatalog(),
    getAllModelPricing(),
    getCreditsPerUsd(),
    db
      .select({ id: channels.id, name: channels.name, type: channels.type })
      .from(channels)
      .where(eq(channels.status, 1)),
  ]);

  // 所有渠道 tab
  const cloudflareTab = {
    id: "cloudflare" as const,
    type: "cloudflare" as const,
    name: "Cloudflare Workers AI",
    label: "Cloudflare",
  };
  const allChannels = [
    cloudflareTab,
    ...channelRows
      .filter((c) => c.type && c.type !== "cloudflare")
      .map((c) => ({
        id: c.id,
        type: c.type!,
        name: c.name,
        label: c.name, // 使用渠道自定义名称（如 "Vercel"、"DeepSeek"）
      })),
  ];

  // 服务端预计算价格，传纯数据对象给 Client Component
  function modelToRow(m: NormalizedModel & { channelSource: string }): {
    id: string;
    name: string;
    category: string;
    channelSource: string;
    priceUsd: number | null;
    priceCr: number | null;
    unit: string;
    isImage: boolean;
  } {
    const dp = getDisplayPrice(m, pricingMap);
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      channelSource: m.channelSource,
      priceUsd: dp.usd !== null ? creditsToUsd(dp.usd, ratio) : null,
      priceCr: dp.credits,
      unit: dp.unit,
      isImage: dp.isImage,
    };
  }

  // Cloudflare 模型
  const cfRows = cfModels
    .map((m) => ({ ...m, channelSource: "cloudflare" as const }))
    .sort((a, b) => {
      const pa = getDisplayPrice(a, pricingMap);
      const pb = getDisplayPrice(b, pricingMap);
      if (pa.credits === null) return 1;
      if (pb.credits === null) return -1;
      return pa.credits - pb.credits;
    })
    .map(modelToRow);

  // 非 Cloudflare 渠道模型：从 model_pricing 表读取
  const allPricingRows = await db
    .select({
      modelId: modelPricing.modelId,
      channelId: modelPricing.channelId,
      inputPrice: modelPricing.inputPrice,
      isImage: modelPricing.isImage,
      fixedPrice: modelPricing.fixedPrice,
      unit: modelPricing.unit,
      multiplier: modelPricing.multiplier,
    })
    .from(modelPricing);

  const pricingByChannel: Record<string, typeof allPricingRows> = {};
  for (const row of allPricingRows) {
    const cid = row.channelId || "default";
    if (!pricingByChannel[cid]) pricingByChannel[cid] = [];
    pricingByChannel[cid].push(row);
  }

  const modelsByChannel: Record<string, typeof cfRows> = {
    cloudflare: cfRows,
  };

  for (const ch of allChannels) {
    if (ch.id === "cloudflare") continue;
    const cp = pricingByChannel[ch.id] || [];
    modelsByChannel[ch.id] = cp
      .map((p) => {
        const isImage = p.isImage === 1;
        const mult = p.multiplier ?? 1.0;
        const basePrice = isImage ? (p.fixedPrice ?? 3500) : (p.inputPrice ?? 100);
        const effectivePrice = basePrice * mult;
        return {
          id: p.modelId,
          name: friendlyName(p.modelId),
          category: isImage ? "image" as const : "text" as const,
          channelSource: ch.type,
          channelName: ch.name,
          priceUsd: creditsToUsd(effectivePrice, ratio),
          priceCr: effectivePrice,
          unit: isImage ? "image" : p.unit || "per M input tokens",
          isImage,
        };
      })
      .sort((a, b) => {
        if (a.priceUsd === null) return 1;
        if (b.priceUsd === null) return -1;
        return a.priceUsd - b.priceUsd;
      });
  }

  const totalCount = Object.values(modelsByChannel).reduce((s, l) => s + l.length, 0);

  return (
    <>
      <PageHeader
        title="定价"
        description={`所有模型的实际计费价格 · 共 ${totalCount} 个模型`}
      />

      <div className="space-y-6 p-8">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-primary">定价说明</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• 文本模型：按 token 计费，价格单位为「每百万 token」</li>
                  <li>• 图像模型：固定价格，价格单位为「每张图片」</li>
                  <li>• Credits 换算：1 USD = {ratio.toLocaleString()} credits</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <PricingTabs
          allChannels={allChannels}
          modelsByChannel={modelsByChannel}
        />
      </div>
    </>
  );
}

function friendlyName(id: string): string {
  const seg = id.split("/").pop() ?? id;
  return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

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

  // Cloudflare 模型标记来源
  const cfWithSource: (NormalizedModel & { channelSource: string })[] = cfModels.map((m) => ({
    ...m,
    channelSource: "cloudflare",
  }));

  // 从 model_pricing 表获取所有渠道的定价记录
  const allPricingRows = await db
    .select({
      modelId: modelPricing.modelId,
      channelId: modelPricing.channelId,
      inputPrice: modelPricing.inputPrice,
      isImage: modelPricing.isImage,
      fixedPrice: modelPricing.fixedPrice,
      unit: modelPricing.unit,
    })
    .from(modelPricing);

  // 按 channelId 分组定价数据
  const pricingByChannel: Record<string, typeof allPricingRows> = {};
  for (const row of allPricingRows) {
    const cid = row.channelId || "default";
    if (!pricingByChannel[cid]) pricingByChannel[cid] = [];
    pricingByChannel[cid].push(row);
  }

  // 构建渠道 tab
  const cloudflareTab = {
    id: "cloudflare",
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
        label: channelLabel(c.type!),
      })),
  ];

  // 按渠道分组模型数据（从 pricing 表 + 定价 map）
  // Cloudflare 模型
  const cfPricingMap = pricingMap;
  const cloudflareModels: (NormalizedModel & { channelSource: string })[] = cfWithSource;

  // 非 Cloudflare 渠道模型：从 pricing 表提取
  const modelsByChannel: Record<string, (NormalizedModel & { channelSource: string })[]> = {
    cloudflare: cloudflareModels,
  };

  for (const ch of allChannels) {
    if (ch.id === "cloudflare") continue;
    const channelPricing = pricingByChannel[ch.id] || [];
    const models = channelPricing.map((p) => ({
      id: p.modelId,
      name: friendlyName(p.modelId),
      description: "",
      task: "Text Generation",
      category: p.isImage ? "image" as any : "text" as any,
      source: "proxied" as const,
      channelSource: ch.type,
      beta: false,
      contextWindow: undefined,
      functionCalling: true,
      pricing: [],
      author: "",
    }));
    modelsByChannel[ch.id] = models;
  }

  return (
    <>
      <PageHeader
        title="定价"
        description="所有模型的实际计费价格，按渠道和分类浏览"
      />

      <div className="space-y-6 p-8">
        {/* 定价说明 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-primary">定价说明</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• <strong>文本模型</strong>：按 token 计费，价格单位为「每百万 token」</li>
                  <li>• <strong>图像模型</strong>：固定价格，价格单位为「每张图片」</li>
                  <li>• <strong>其他渠道</strong>：价格为上游供应商定价 × 本平台倍率</li>
                  <li>• <strong>Credits 换算</strong>：1 USD = {ratio.toLocaleString()} credits</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <PricingTabs
          allChannels={allChannels}
          modelsByChannel={modelsByChannel}
          pricingMap={pricingMap}
          ratio={ratio}
          getDisplayPrice={getDisplayPrice}
          creditsToUsd={creditsToUsd}
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

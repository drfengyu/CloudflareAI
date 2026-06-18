import { PageHeader } from "@/components/dashboard/page-header";
import { PricingTabs } from "@/components/pricing/pricing-tabs";
import { fetchModelCatalog, type NormalizedModel } from "@/lib/cloudflare/catalog";
import { getDisplayPrice } from "@/lib/billing/display-price";
import { getAllModelPricing } from "@/lib/billing/model-pricing";
import { getCreditsPerUsd, creditsToUsd } from "@/lib/billing/credits";
import { fetchAllChannelsModels } from "@/lib/cloudflare/channel-catalog";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [cfModels, pricingMap, ratio, rawChannelData] = await Promise.all([
    fetchModelCatalog(),
    getAllModelPricing(),
    getCreditsPerUsd(),
    fetchAllChannelsModels().catch((): { channels: { id: string; type: string; name: string; label: string }[]; modelsByChannel: Record<string, NormalizedModel[]> } => ({
      channels: [],
      modelsByChannel: {},
    })),
  ]);
  const channelData = rawChannelData as { channels: { id: string; type: string; name: string; label: string }[]; modelsByChannel: Record<string, NormalizedModel[]> };

  // Cloudflare 模型标记来源
  const cfWithSource = cfModels.map((m) => ({
    ...m,
    channelSource: "cloudflare" as const,
  }));

  // 渠道 tab 数据
  const cloudflareTab = {
    id: "cloudflare",
    type: "cloudflare" as const,
    name: "Cloudflare Workers AI",
    label: "Cloudflare",
  };
  const allChannels = [cloudflareTab, ...channelData.channels];
  const modelsByChannel: Record<string, any[]> = {
    cloudflare: cfWithSource,
  };
  const srcMap = channelData.modelsByChannel;
  for (const ch of channelData.channels) {
    const src = srcMap[ch.id] || [];
    modelsByChannel[ch.id] = src.map((m: any) => ({
      ...m,
      channelSource: ch.type,
    }));
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

import { PageHeader } from "@/components/dashboard/page-header";
import { ModelBrowser } from "@/components/models/model-browser";
import { Badge } from "@/components/ui/badge";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchAllChannelsModels } from "@/lib/cloudflare/channel-catalog";
import { getAllModelPricing } from "@/lib/billing/model-pricing";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  let cfModels: Awaited<ReturnType<typeof fetchModelCatalog>> = [];
  let pricingMap: Awaited<ReturnType<typeof getAllModelPricing>> = new Map();
  let error: string | null = null;
  let channelData: Awaited<ReturnType<typeof fetchAllChannelsModels>> = {
    channels: [],
    modelsByChannel: {},
  };

  try {
    [cfModels, pricingMap, channelData] = await Promise.all([
      fetchModelCatalog(),
      getAllModelPricing(),
      fetchAllChannelsModels().catch(() => ({
        channels: [],
        modelsByChannel: {},
      })),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "无法加载模型目录";
  }

  // 把 Cloudflare 的模型也做成一个"渠道"项
  const cloudflareChannel = {
    id: "cloudflare",
    type: "cloudflare" as const,
    name: "Cloudflare Workers AI",
    label: "Cloudflare",
  };

  // 组装所有渠道
  const allChannels = [cloudflareChannel, ...channelData.channels];

  // Cloudflare 模型已带上 channelSource
  const cfWithSource = cfModels.map((m) => ({
    ...m,
    channelSource: "cloudflare" as const,
  }));

  // 按渠道分组
  const modelsByChannel: Record<string, typeof cfModels> = {
    cloudflare: cfWithSource,
  };
  for (const ch of channelData.channels) {
    modelsByChannel[ch.id] = channelData.modelsByChannel[ch.id] || [];
  }

  const totalCount = Object.values(modelsByChannel).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  return (
    <>
      <PageHeader
        title="模型库"
        description="浏览所有渠道的 AI 模型，按渠道和分类筛选"
        action={
          totalCount > 0 ? (
            <Badge tone="muted">{totalCount} 个模型</Badge>
          ) : undefined
        }
      />

      {error ? (
        <div className="m-8 rounded-[var(--radius-lg)] border border-dashed border-border bg-card p-6 text-sm">
          <p className="mb-1 font-medium text-foreground">无法加载模型目录</p>
          <p className="text-muted-foreground">
            请在环境变量中配置 <code>CF_ACCOUNT_ID</code> 与{" "}
            <code>CF_API_TOKEN</code>（参考 <code>.env.example</code> 与{" "}
            <code>docs/DEPLOYMENT.md</code>）。
          </p>
          <p className="mt-2 text-[11px] text-destructive">{error}</p>
        </div>
      ) : (
        <ModelBrowser
          allChannels={allChannels}
          modelsByChannel={modelsByChannel}
          pricingMap={pricingMap}
        />
      )}
    </>
  );
}

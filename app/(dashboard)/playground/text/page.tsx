import { PageHeader } from "@/components/dashboard/page-header";
import { TextGenPlayground } from "@/components/playground/text-gen";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, getDefaultApiKey } from "@/lib/usage/meter";
import { apiKeys } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function TextPlaygroundPage() {
  const userId = await requireUser();
  const defaultKeyId = await getDefaultApiKey(userId);

  let keyName = "未设置";
  if (defaultKeyId) {
    const keyRows = await db
      .select({ name: apiKeys.name })
      .from(apiKeys)
      .where(eq(apiKeys.id, defaultKeyId))
      .limit(1);
    keyName = keyRows[0]?.name || "未知";
  }

  // 所有模型：Cloudflare hosted + 非 Cloudflare 渠道
  const catalog = await fetchModelCatalog();
  const cfTextModels = catalog
    .filter((m) => m.category === "text" && m.source === "hosted")
    .map((m) => ({
      id: m.id,
      name: m.name,
      channel: "cloudflare" as const,
      contextWindow: m.contextWindow,
    }));

  // 从 model_pricing 表获取其他渠道的文本模型
  const channelRows = await db
    .select({ id: channels.id, type: channels.type, name: channels.name })
    .from(channels)
    .where(eq(channels.status, 1));

  const otherModels: { id: string; name: string; channel: string; contextWindow?: number }[] = [];
  for (const ch of channelRows) {
    if (ch.type === "cloudflare") continue;
    const pricing = await db
      .select({ modelId: modelPricing.modelId })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, ch.id));
    for (const p of pricing) {
      otherModels.push({
        id: p.modelId,
        name: p.modelId.split("/").pop() || p.modelId,
        channel: ch.name || ch.type || "other",
        // 非 Cloudflare 模型 ctx 未知，保留 undefined 让 UI 提示
      });
    }
  }

  // 去重
  const seen = new Set<string>();
  const allModels = [...cfTextModels, ...otherModels].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <>
      <PageHeader
        title="文本生成"
        description="对话式文本生成，支持流式输出、温度与 token 控制"
        action={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">使用 API Key:</span>
            <Badge tone="muted">🔑 {keyName}</Badge>
          </div>
        }
      />
      {allModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的文本生成模型
        </div>
      ) : (
        <TextGenPlayground models={allModels} />
      )}
    </>
  );
}

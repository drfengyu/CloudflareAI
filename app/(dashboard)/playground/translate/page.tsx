import { PageHeader } from "@/components/dashboard/page-header";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TranslateClient } from "./client";

export const dynamic = "force-dynamic";

// 优先作为默认翻译引擎的多语言 LLM（命中者排到列表最前）。
// 优先非推理类 instruct 模型——推理模型（qwq/qwen3/deepseek-r1）会为隐藏思考多计 output token，
// 翻译既慢又贵，故不作默认。
const PREFERRED = [
  /llama-3\.3/i,
  /llama-4/i,
  /gemma-sea-lion/i,
  /gemma-4/i,
  /mistral-small/i,
  /gpt-oss/i,
];

function preferredRank(id: string): number {
  const i = PREFERRED.findIndex((re) => re.test(id));
  return i === -1 ? PREFERRED.length : i;
}

export default async function TranslatePage() {
  const catalog = await fetchModelCatalog();

  // LLM 翻译（文本模型）：CJK 质量好，作为主要选项
  const llmModels = catalog
    .filter((m) => m.category === "text" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => preferredRank(a.id) - preferredRank(b.id) || a.name.localeCompare(b.name));

  // 专用翻译模型（m2m100）：快速但 CJK 有限，保留为可选
  const legacyModels = catalog
    .filter((m) => m.category === "translate" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: `${m.name}（快速 · CJK 有限）` }));

  const models = [...llmModels, ...legacyModels];

  // 渠道文本模型（也可用于 LLM 翻译）
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

    // 文本模型 + 翻译模型都可用
    const textIds = new Set(
      pricingAll
        .filter((p) => p.category === "text" || p.category === "translate")
        .map((p) => p.modelId)
    );
    if (textIds.size === 0) continue;

    const channelModels = await fetchChannelModels(ch.id, ch.type || "", ch.name);

    for (const modelMeta of channelModels) {
      if (!textIds.has(modelMeta.id)) continue;
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
      <PageHeader title="翻译" description="多语言翻译服务（推荐用 LLM 模型，中日韩质量更好）" />
      {allModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的翻译模型
        </div>
      ) : (
        <TranslateClient models={allModels} />
      )}
    </>
  );
}

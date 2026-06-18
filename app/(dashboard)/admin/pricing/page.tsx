import { redirect } from "next/navigation";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { PricingManager } from "./pricing-manager";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { getCreditsPerUsd } from "@/lib/billing/credits";
import { getAdapter } from "@/lib/channels/registry";
import { channels } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const userId = await requireUser();

  // 校验管理员权限
  const userRows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows[0] || userRows[0].role < 10) {
    redirect("/dashboard");
  }

  // 获取所有渠道列表
  const channelRows = await db
    .select({ id: channels.id, name: channels.name, type: channels.type })
    .from(channels)
    .where(eq(channels.status, 1));

  const channelList = channelRows
    .filter((c) => c.type && c.type !== "cloudflare")
    .map((c) => ({ id: c.id, name: c.name, type: c.type!, label: typeLabel(c.type!) }));

  // 获取 Cloudflare 模型价格数据
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

  // 非 Cloudflare 渠道模型（从 model_pricing 和 adapter 收集）
  const channelModels: Array<{
    id: string;
    name: string;
    category: string;
    source: string;
    channelSource?: string;
    pricing?: (typeof cfModels)[0]["pricing"];
  }> = [];

  for (const ch of channelList) {
    const adapter = getAdapter(ch.type);
    if (!adapter?.listModels) continue;

    const chRow = channelRows.find((r) => r.id === ch.id);
    let configObj: Record<string, unknown> = {};
    if (chRow) {
      const full = await db.select().from(channels).where(eq(channels.id, ch.id)).limit(1);
      try { configObj = full[0]?.config ? JSON.parse(full[0].config) : {}; } catch { /* ignore */ }
    }

    const remoteModels = await adapter.listModels({ config: configObj }).catch(() => []);
    for (const m of remoteModels) {
      const pricing = pricingMap.get(m.id);
      channelModels.push({
        id: m.id,
        name: friendlyName(m.id),
        category: "remote",
        source: ch.type,
        channelSource: ch.type,
        pricing,
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

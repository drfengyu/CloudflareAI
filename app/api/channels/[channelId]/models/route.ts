import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchChannelModels } from "@/lib/cloudflare/channel-catalog";
import { getCreditsPerUsd } from "@/lib/billing/credits";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return !!currentUser[0] && currentUser[0].role >= 10;
}

/** GET /api/channels/[channelId]/models - 列出渠道关联的模型 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> | { channelId: string } },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;

  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // 获取该渠道关联的定价记录
  const pricingEntries = await db
    .select({
      modelId: modelPricing.modelId,
      category: modelPricing.category,
      source: modelPricing.source,
      inputPrice: modelPricing.inputPrice,
      outputPrice: modelPricing.outputPrice,
      fixedPrice: modelPricing.fixedPrice,
      isImage: modelPricing.isImage,
      multiplier: modelPricing.multiplier,
    })
    .from(modelPricing)
    .where(eq(modelPricing.channelId, channelId));

  return NextResponse.json({
    data: pricingEntries,
    total: pricingEntries.length,
  });
}

/** POST /api/channels/[channelId]/models/sync - 同步上游模型列表到定价表 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> | { channelId: string } },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;

  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // 使用 fetchChannelModels 获取带完整元数据的模型列表
  const normalizedModels = await fetchChannelModels(
    channelId,
    channel.type || "",
    channel.name,
  );

  if (normalizedModels.length === 0) {
    return NextResponse.json({ error: "未获取到远程模型列表" }, { status: 500 });
  }

  // 获取已存在的模型 ID
  const existing = await db
    .select({ modelId: modelPricing.modelId })
    .from(modelPricing)
    .where(eq(modelPricing.channelId, channelId));

  const existingIds = new Set(existing.map((e) => e.modelId));

  // 批量插入新模型（带完整元数据）
  const toInsert = normalizedModels.filter((m) => !existingIds.has(m.id));
  let inserted = 0;

  // 获取 credits/USD 倍率
  const creditsPerUsd = await getCreditsPerUsd();

  for (const model of toInsert) {
    try {
      // 从上游定价计算 credits per M tokens
      let inputPrice = 0;
      let outputPrice = 0;

      if (model.upstreamPricing) {
        // 上游定价是 美元/token，转换为 credits per M tokens
        // credits per M tokens = (美元/token) × 1,000,000 × creditsPerUsd
        inputPrice = model.upstreamPricing.input * 1_000_000 * creditsPerUsd;
        outputPrice = model.upstreamPricing.output * 1_000_000 * creditsPerUsd;
      }

      await db.insert(modelPricing).values({
        modelId: model.id,
        category: model.category,
        source: channel.type || "remote",
        channelId,
        multiplier: 1.0,
        inputPrice: Math.round(inputPrice),
        outputPrice: Math.round(outputPrice),
        unit: "M tokens",
        isImage: model.category === "image" ? 1 : 0,
      });
      inserted++;
    } catch (e) {
      console.error(`Failed to insert model ${model.id}:`, e);
      // 跳过冲突
    }
  }

  return NextResponse.json({
    message: `同步完成：新增 ${inserted} 个模型，共 ${existing.length + inserted} 个`,
    total: existing.length + inserted,
    inserted,
    skipped: existing.length,
  });
}

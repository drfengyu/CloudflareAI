import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/channels/registry";

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

  const adapter = getAdapter(channel.type || "");
  if (!adapter || !adapter.listModels) {
    return NextResponse.json({ error: "该渠道类型不支持模型同步" }, { status: 400 });
  }

  let configObj: Record<string, unknown> = {};
  try {
    configObj = channel.config ? JSON.parse(channel.config) : {};
  } catch {
    // ignore
  }

  const remoteModels = await adapter.listModels({ config: configObj });
  if (remoteModels.length === 0) {
    return NextResponse.json({ error: "未获取到远程模型列表" }, { status: 500 });
  }

  // 获取已存在的模型 ID
  const existing = await db
    .select({ modelId: modelPricing.modelId })
    .from(modelPricing)
    .where(eq(modelPricing.channelId, channelId));

  const existingIds = new Set(existing.map((e) => e.modelId));

  // 批量插入新模型
  const toInsert = remoteModels.filter((m) => !existingIds.has(m.id));
  let inserted = 0;

  for (const model of toInsert) {
    try {
      await db.insert(modelPricing).values({
        modelId: model.id,
        category: "remote",
        source: channel.type || "remote",
        channelId,
        multiplier: 1.0,
      });
      inserted++;
    } catch {
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

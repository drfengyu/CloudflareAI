import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { modelPricing, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

/** PUT /api/channels/[channelId]/models/[modelId] - 更新渠道关联模型的倍率 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ channelId: string; modelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId, modelId } = await params;
  const body = await request.json();
  const { multiplier } = body;

  if (multiplier !== undefined) {
    if (typeof multiplier !== "number" || multiplier < 0.01 || multiplier > 100) {
      return NextResponse.json({ error: "倍率必须在 0.01 到 100 之间" }, { status: 400 });
    }
  }

  try {
    const result = await db
      .update(modelPricing)
      .set({ multiplier, updatedAt: new Date() })
      .where(
        and(eq(modelPricing.modelId, modelId), eq(modelPricing.channelId, channelId)),
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "未找到该模型定价记录" }, { status: 404 });
    }

    return NextResponse.json({ message: "更新成功", data: result[0] });
  } catch (error) {
    console.error("Failed to update model pricing:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/** DELETE /api/channels/[channelId]/models/[modelId] - 移除渠道关联的模型 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; modelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId, modelId } = await params;

  try {
    await db
      .delete(modelPricing)
      .where(
        and(eq(modelPricing.modelId, modelId), eq(modelPricing.channelId, channelId)),
      );

    return NextResponse.json({ message: "模型已从渠道移除" });
  } catch (error) {
    console.error("Failed to delete model pricing:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}

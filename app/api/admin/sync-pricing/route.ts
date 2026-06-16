import { NextResponse } from "next/server";
import { syncModelPricing } from "@/lib/billing/model-pricing";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sync-pricing
 * 从 catalog 同步所有模型价格到 model_pricing 表。
 * 仅管理员可访问。
 */
export async function GET() {
  try {
    const userId = await requireUser();

    // 检查权限
    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows[0] || userRows[0].role < 10) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const result = await syncModelPricing();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 500 },
    );
  }
}

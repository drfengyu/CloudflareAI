import { NextRequest } from "next/server";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 临时测试端点：验证数据库 UPDATE 是否生效
 */
export async function GET(req: NextRequest) {
  try {
    // 1. 查找 test-quota key
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.name, "test-quota"))
      .limit(1);

    if (!keys[0]) {
      return Response.json({ error: "test-quota key not found" }, { status: 404 });
    }

    const keyId = keys[0].id;
    const oldValue = keys[0].remainCredits;

    // 2. 更新 remainCredits 为 88888
    const updateResult = await db
      .update(apiKeys)
      .set({ remainCredits: 88888 })
      .where(eq(apiKeys.id, keyId));

    console.log("[test-db] Update result:", updateResult);

    // 3. 重新查询验证
    const updated = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    return Response.json({
      success: true,
      keyId,
      oldValue,
      newValue: updated[0]?.remainCredits,
      updateResult,
    });
  } catch (err) {
    console.error("[test-db] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
